/**
 * Rollback Manager
 * Handles safe rollback of database migrations with transaction support
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class RollbackManager {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Rollback migrations
   */
  async rollback(options = {}) {
    const { steps = 1, toVersion, force = false, dryRun = false } = options;
    const client = await this.pool.connect();
    
    try {
      const migrations = await this.getExecutedMigrations(steps, toVersion);
      
      if (migrations.length === 0) {
        console.log(chalk.yellow('No migrations to rollback'));
        return { rolledBack: [] };
      }

      console.log(chalk.blue(`Found ${migrations.length} migration(s) to rollback`));
      
      const rolledBack = [];

      for (const migration of migrations) {
        if (toVersion && migration.version <= toVersion) {
          console.log(chalk.gray(`Stopping at version ${toVersion}`));
          break;
        }

        // Check for rollback file
        const rollbackExists = await this.checkRollbackFile(migration);
        if (!rollbackExists && !force) {
          throw new Error(`Rollback file not found for migration ${migration.filename}`);
        }

        if (dryRun) {
          console.log(chalk.gray(`[DRY RUN] Would rollback: ${migration.filename}`));
          rolledBack.push({ ...migration, dryRun: true });
          continue;
        }

        await this.rollbackMigration(client, migration);
        rolledBack.push(migration);
      }

      return { rolledBack };
    } finally {
      client.release();
    }
  }

  /**
   * Rollback a single migration
   */
  async rollbackMigration(client, migration) {
    const startTime = Date.now();
    console.log(chalk.yellow(`Rolling back: ${migration.filename}`));
    
    try {
      await client.query('BEGIN');
      
      // Check if migration can be rolled back
      const { rows } = await client.query(`
        SELECT id, status FROM _migrations 
        WHERE version = $1 AND status != 'rolled_back'
      `, [migration.version]);
      
      if (rows.length === 0) {
        throw new Error(`Migration ${migration.version} is not eligible for rollback`);
      }
      
      const migrationId = rows[0].id;
      
      // Read rollback file
      const rollbackFile = await this.getRollbackFilePath(migration);
      const rollbackSql = await fs.readFile(rollbackFile, 'utf8');
      
      // Parse and execute rollback statements
      const statements = this.parseSqlStatements(rollbackSql);
      let statementCount = 0;
      
      for (const statement of statements) {
        if (statement.trim()) {
          await client.query(statement);
          statementCount++;
        }
      }
      
      const executionTime = Date.now() - startTime;
      
      // Update migration status
      await client.query(`
        UPDATE _migrations 
        SET status = 'rolled_back',
            metadata = metadata || $1
        WHERE version = $2
      `, [
        JSON.stringify({
          rolled_back_at: new Date().toISOString(),
          rollback_time_ms: executionTime,
          rollback_statements: statementCount
        }),
        migration.version
      ]);
      
      // Record in history
      await client.query(`
        INSERT INTO _migration_history (migration_id, action, performed_by, details)
        VALUES ($1, 'rolled_back', $2, $3)
      `, [
        migrationId,
        process.env.USER || 'system',
        JSON.stringify({ execution_time_ms: executionTime, statements: statementCount })
      ]);
      
      await client.query('COMMIT');
      
      console.log(chalk.green(`✓ Rolled back: ${migration.filename} (${executionTime}ms)`));
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(chalk.red(`✗ Rollback failed: ${migration.filename}`));
      console.error(chalk.red(error.message));
      throw error;
    }
  }

  /**
   * Get executed migrations eligible for rollback
   */
  async getExecutedMigrations(steps, toVersion) {
    let query = `
      SELECT 
        version,
        filename,
        checksum,
        executed_at,
        executed_by,
        execution_time_ms
      FROM _migrations
      WHERE status = 'completed'
      ORDER BY version DESC
    `;
    
    const params = [];
    
    if (steps && !toVersion) {
      query += ` LIMIT $1`;
      params.push(steps);
    }
    
    const { rows } = await this.pool.query(query, params);
    
    if (toVersion) {
      return rows.filter(m => m.version > toVersion);
    }
    
    return rows;
  }

  /**
   * Check if rollback file exists
   */
  async checkRollbackFile(migration) {
    const rollbackPath = await this.getRollbackFilePath(migration);
    try {
      await fs.access(rollbackPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get rollback file path
   */
  async getRollbackFilePath(migration) {
    const rollbackDir = path.join(__dirname, 'rollback');
    const baseFilename = migration.filename.replace('.sql', '');
    
    // Try multiple rollback file naming conventions
    const possiblePaths = [
      path.join(rollbackDir, `${baseFilename}.down.sql`),
      path.join(rollbackDir, `${baseFilename}_rollback.sql`),
      path.join(rollbackDir, `${baseFilename}.rollback.sql`),
      path.join(rollbackDir, migration.filename) // Same name in rollback folder
    ];
    
    for (const filePath of possiblePaths) {
      try {
        await fs.access(filePath);
        return filePath;
      } catch {
        continue;
      }
    }
    
    // Default to first option if none exist
    return possiblePaths[0];
  }

  /**
   * Parse SQL statements (same as MigrationRunner)
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
      
      if (!inComment && !inBlockComment && (char === "'" || char === '"')) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          if (sql[i - 1] !== '\\') {
            inString = false;
            stringChar = null;
          }
        }
      }
      
      if (!inString && !inComment && !inBlockComment && char === ';') {
        if (current.trim()) {
          statements.push(current.trim() + ';');
        }
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      statements.push(current.trim());
    }
    
    return statements;
  }

  /**
   * Create automatic rollback file based on migration
   */
  async generateRollback(migration) {
    const migrationPath = path.join(__dirname, 'sql', migration.filename);
    const migrationContent = await fs.readFile(migrationPath, 'utf8');
    
    // Parse CREATE TABLE statements and generate DROP TABLE
    const rollbackStatements = [];
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
    const createIndexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
    const alterTableRegex = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+(?:COLUMN\s+)?(\w+)/gi;
    
    let match;
    
    // Generate DROP TABLE statements
    const tables = new Set();
    while ((match = createTableRegex.exec(migrationContent)) !== null) {
      tables.add(match[1]);
    }
    
    // Generate DROP INDEX statements
    const indexes = new Set();
    while ((match = createIndexRegex.exec(migrationContent)) !== null) {
      indexes.add(match[1]);
    }
    
    // Generate ALTER TABLE DROP COLUMN statements
    const alterations = [];
    while ((match = alterTableRegex.exec(migrationContent)) !== null) {
      alterations.push({ table: match[1], column: match[2] });
    }
    
    // Build rollback SQL
    rollbackStatements.push('-- Auto-generated rollback');
    rollbackStatements.push('BEGIN;');
    rollbackStatements.push('');
    
    // Drop indexes first
    for (const index of indexes) {
      rollbackStatements.push(`DROP INDEX IF EXISTS ${index} CASCADE;`);
    }
    
    if (indexes.size > 0) {
      rollbackStatements.push('');
    }
    
    // Drop columns
    for (const alteration of alterations) {
      rollbackStatements.push(`ALTER TABLE ${alteration.table} DROP COLUMN IF EXISTS ${alteration.column} CASCADE;`);
    }
    
    if (alterations.length > 0) {
      rollbackStatements.push('');
    }
    
    // Drop tables
    for (const table of tables) {
      rollbackStatements.push(`DROP TABLE IF EXISTS ${table} CASCADE;`);
    }
    
    rollbackStatements.push('');
    rollbackStatements.push('COMMIT;');
    
    return rollbackStatements.join('\n');
  }
}

export default RollbackManager;