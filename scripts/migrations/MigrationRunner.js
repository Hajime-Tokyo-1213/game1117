/**
 * Enterprise-grade Migration Runner
 * Handles database schema migrations with transaction safety,
 * rollback support, and concurrent execution prevention
 */

import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import chalk from 'chalk';
import { format } from 'date-fns';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MigrationRunner {
  constructor(pool) {
    this.pool = pool;
    this.lockTimeout = 30000; // 30 seconds
    this.migrationTimeout = 300000; // 5 minutes
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Initialize migration system tables
   */
  async initialize() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create migrations tracking table
      await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id SERIAL PRIMARY KEY,
          version VARCHAR(20) UNIQUE NOT NULL,
          filename VARCHAR(255) NOT NULL,
          checksum VARCHAR(64) NOT NULL,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          executed_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
          execution_time_ms INTEGER NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          error_message TEXT,
          rollback_sql TEXT,
          metadata JSONB DEFAULT '{}'::jsonb,
          CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back'))
        );

        CREATE INDEX IF NOT EXISTS idx_migrations_version ON _migrations(version);
        CREATE INDEX IF NOT EXISTS idx_migrations_status ON _migrations(status);
        CREATE INDEX IF NOT EXISTS idx_migrations_executed_at ON _migrations(executed_at DESC);
      `);

      // Create migration locks table for concurrency control
      await client.query(`
        CREATE TABLE IF NOT EXISTS _migration_locks (
          id INTEGER PRIMARY KEY DEFAULT 1,
          locked_by VARCHAR(100),
          locked_at TIMESTAMP WITH TIME ZONE,
          lock_key UUID,
          pid INTEGER,
          hostname VARCHAR(255),
          CONSTRAINT single_row CHECK (id = 1)
        );

        INSERT INTO _migration_locks (id) VALUES (1) ON CONFLICT DO NOTHING;
      `);

      // Create migration history table for audit
      await client.query(`
        CREATE TABLE IF NOT EXISTS _migration_history (
          id SERIAL PRIMARY KEY,
          migration_id INTEGER REFERENCES _migrations(id),
          action VARCHAR(50) NOT NULL,
          performed_by VARCHAR(100) NOT NULL,
          performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          details JSONB DEFAULT '{}'::jsonb
        );

        CREATE INDEX IF NOT EXISTS idx_migration_history_migration ON _migration_history(migration_id);
        CREATE INDEX IF NOT EXISTS idx_migration_history_action ON _migration_history(action);
        CREATE INDEX IF NOT EXISTS idx_migration_history_performed_at ON _migration_history(performed_at DESC);
      `);

      await client.query('COMMIT');
      console.log(chalk.green('✓ Migration system initialized'));
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(chalk.red('Failed to initialize migration system:'), error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run pending migrations
   */
  async runMigrations(options = {}) {
    const { targetVersion, dryRun = false, force = false, skipLock = false } = options;
    const lockKey = crypto.randomUUID();
    
    // Acquire lock unless skipped (for testing)
    if (!skipLock && !await this.acquireLock(lockKey)) {
      throw new Error('Could not acquire migration lock. Another migration may be running.');
    }

    const client = await this.pool.connect();
    
    try {
      const pendingMigrations = await this.getPendingMigrations();
      
      if (pendingMigrations.length === 0) {
        console.log(chalk.yellow('No pending migrations'));
        return { executed: [], skipped: [] };
      }

      console.log(chalk.blue(`Found ${pendingMigrations.length} pending migrations`));
      
      const executed = [];
      const skipped = [];

      for (const migration of pendingMigrations) {
        // Check if we should stop at target version
        if (targetVersion && migration.version > targetVersion) {
          console.log(chalk.gray(`Stopping at version ${targetVersion}`));
          skipped.push(migration);
          continue;
        }

        // Validate migration checksum
        if (!force && !await this.validateChecksum(migration)) {
          throw new Error(`Checksum mismatch for migration ${migration.filename}`);
        }

        if (dryRun) {
          console.log(chalk.gray(`[DRY RUN] Would execute: ${migration.filename}`));
          executed.push({ ...migration, dryRun: true });
          continue;
        }

        // Execute with retry logic
        await this.executeMigrationWithRetry(client, migration);
        executed.push(migration);
      }

      return { executed, skipped };
    } finally {
      if (!skipLock) {
        await this.releaseLock(lockKey);
      }
      client.release();
    }
  }

  /**
   * Execute migration with retry logic
   */
  async executeMigrationWithRetry(client, migration, attempt = 1) {
    try {
      await this.executeMigration(client, migration);
    } catch (error) {
      if (attempt < this.maxRetries) {
        console.log(chalk.yellow(`Retrying migration ${migration.filename} (attempt ${attempt + 1}/${this.maxRetries})`));
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        return this.executeMigrationWithRetry(client, migration, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Execute a single migration
   */
  async executeMigration(client, migration) {
    const startTime = Date.now();
    
    console.log(chalk.blue(`Executing migration: ${migration.filename}`));
    
    try {
      await client.query('BEGIN');
      
      // Record migration start
      const { rows } = await client.query(`
        INSERT INTO _migrations (version, filename, checksum, status, execution_time_ms, executed_by, metadata)
        VALUES ($1, $2, $3, 'running', 0, $4, $5)
        RETURNING id
      `, [
        migration.version,
        migration.filename,
        migration.checksum,
        process.env.USER || 'system',
        JSON.stringify({ hostname: process.env.HOSTNAME, pid: process.pid })
      ]);
      
      const migrationId = rows[0].id;

      // Read and execute migration SQL
      const sql = await fs.readFile(migration.filepath, 'utf8');
      
      // Parse and execute statements
      const statements = this.parseSqlStatements(sql);
      let statementCount = 0;
      
      for (const statement of statements) {
        if (statement.trim()) {
          await client.query(statement);
          statementCount++;
        }
      }

      const executionTime = Date.now() - startTime;

      // Mark migration as completed
      await client.query(`
        UPDATE _migrations 
        SET status = 'completed', 
            execution_time_ms = $1,
            metadata = metadata || $2
        WHERE id = $3
      `, [
        executionTime,
        JSON.stringify({ statements_executed: statementCount }),
        migrationId
      ]);

      // Record in history
      await client.query(`
        INSERT INTO _migration_history (migration_id, action, performed_by, details)
        VALUES ($1, 'executed', $2, $3)
      `, [
        migrationId,
        process.env.USER || 'system',
        JSON.stringify({ execution_time_ms: executionTime, statements: statementCount })
      ]);

      await client.query('COMMIT');
      
      console.log(chalk.green(`✓ ${migration.filename} (${executionTime}ms, ${statementCount} statements)`));
      
    } catch (error) {
      await client.query('ROLLBACK');
      
      // Record failure
      try {
        await client.query(`
          INSERT INTO _migrations (version, filename, checksum, status, error_message, execution_time_ms, executed_by)
          VALUES ($1, $2, $3, 'failed', $4, $5, $6)
          ON CONFLICT (version) DO UPDATE
          SET status = 'failed',
              error_message = $4,
              execution_time_ms = $5
        `, [
          migration.version,
          migration.filename,
          migration.checksum,
          error.message,
          Date.now() - startTime,
          process.env.USER || 'system'
        ]);
      } catch (recordError) {
        console.error(chalk.red('Failed to record migration failure:'), recordError.message);
      }
      
      console.error(chalk.red(`✗ Failed: ${migration.filename}`));
      console.error(chalk.red(error.message));
      throw error;
    }
  }

  /**
   * Parse SQL statements (handles semicolons in strings/comments)
   */
  parseSqlStatements(sql) {
    const statements = [];
    let current = '';
    let inString = false;
    let stringChar = null;
    let inComment = false;
    let inBlockComment = false;
    
    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const nextChar = sql[i + 1];
      
      // Handle block comments
      if (!inString && char === '/' && nextChar === '*') {
        inBlockComment = true;
        current += char;
        continue;
      }
      if (inBlockComment && char === '*' && nextChar === '/') {
        inBlockComment = false;
        current += char + nextChar;
        i++;
        continue;
      }
      
      // Handle line comments
      if (!inString && !inBlockComment && char === '-' && nextChar === '-') {
        inComment = true;
        current += char;
        continue;
      }
      if (inComment && char === '\n') {
        inComment = false;
        current += char;
        continue;
      }
      
      // Handle strings
      if (!inComment && !inBlockComment && (char === "'" || char === '"')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          // Check for escaped quotes
          if (sql[i - 1] !== '\\') {
            inString = false;
            stringChar = null;
          }
        }
      }
      
      // Handle statement separator
      if (!inString && !inComment && !inBlockComment && char === ';') {
        if (current.trim()) {
          statements.push(current.trim() + ';');
        }
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add remaining statement if any
    if (current.trim()) {
      statements.push(current.trim());
    }
    
    return statements;
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    const migrationsDir = path.join(__dirname, 'sql');
    
    // Ensure directory exists
    try {
      await fs.access(migrationsDir);
    } catch {
      await fs.mkdir(migrationsDir, { recursive: true });
      return [];
    }
    
    const files = await fs.readdir(migrationsDir);
    
    const migrations = await Promise.all(
      files
        .filter(f => f.endsWith('.sql') && !f.includes('.down.'))
        .map(async (filename) => {
          const filepath = path.join(migrationsDir, filename);
          const content = await fs.readFile(filepath, 'utf8');
          const checksum = crypto.createHash('sha256').update(content).digest('hex');
          const version = filename.match(/^(\d+)_/)?.[1] || '0';
          
          return {
            version,
            filename,
            filepath,
            checksum
          };
        })
    );

    // Get executed migrations
    const { rows: executed } = await this.pool.query(
      'SELECT version, checksum FROM _migrations WHERE status IN ($1, $2)',
      ['completed', 'running']
    );
    
    const executedVersions = new Set(executed.map(r => r.version));
    
    return migrations
      .filter(m => !executedVersions.has(m.version))
      .sort((a, b) => a.version.localeCompare(b.version));
  }

  /**
   * Validate migration checksum
   */
  async validateChecksum(migration) {
    const { rows } = await this.pool.query(
      'SELECT checksum FROM _migrations WHERE version = $1 AND status = $2',
      [migration.version, 'completed']
    );
    
    if (rows.length === 0) {
      return true; // Not executed yet
    }
    
    return rows[0].checksum === migration.checksum;
  }

  /**
   * Acquire migration lock
   */
  async acquireLock(lockKey) {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        UPDATE _migration_locks 
        SET locked_by = $1, 
            locked_at = NOW(), 
            lock_key = $2,
            pid = $3,
            hostname = $4
        WHERE id = 1 AND (
          locked_at IS NULL OR 
          locked_at < NOW() - INTERVAL '${this.lockTimeout / 1000} seconds'
        )
      `, [
        process.env.USER || 'system',
        lockKey,
        process.pid,
        process.env.HOSTNAME || 'unknown'
      ]);
      
      return result.rowCount > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Release migration lock
   */
  async releaseLock(lockKey) {
    await this.pool.query(`
      UPDATE _migration_locks 
      SET locked_by = NULL, 
          locked_at = NULL, 
          lock_key = NULL,
          pid = NULL,
          hostname = NULL
      WHERE id = 1 AND lock_key = $1
    `, [lockKey]);
  }

  /**
   * Get migration status
   */
  async getStatus() {
    const { rows: migrations } = await this.pool.query(`
      SELECT 
        version,
        filename,
        status,
        executed_at,
        executed_by,
        execution_time_ms,
        error_message
      FROM _migrations
      ORDER BY version DESC
    `);

    const { rows: locks } = await this.pool.query(`
      SELECT locked_by, locked_at, pid, hostname
      FROM _migration_locks
      WHERE id = 1
    `);

    return {
      migrations,
      lock: locks[0]
    };
  }
}

export default MigrationRunner;