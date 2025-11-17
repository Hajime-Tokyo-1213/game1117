#!/usr/bin/env node

/**
 * Migration CLI
 * Command-line interface for database migrations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { config } from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;
import { MigrationRunner } from './MigrationRunner.js';
import { RollbackManager } from './RollbackManager.js';
import { MigrationGenerator } from './MigrationGenerator.js';
import { MigrationStatusViewer } from './MigrationStatusViewer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config();

// Create database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DEV_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Create instances
const runner = new MigrationRunner(pool);
const rollbackManager = new RollbackManager(pool);
const generator = new MigrationGenerator();
const statusViewer = new MigrationStatusViewer(pool);

// Create CLI program
const program = new Command();

program
  .name('db-migrate')
  .description('Enterprise-grade database migration system')
  .version('1.0.0');

// Initialize command
program
  .command('init')
  .description('Initialize migration system tables')
  .action(async () => {
    try {
      await runner.initialize();
      console.log(chalk.green('Migration system initialized successfully'));
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Initialization failed:'), error.message);
      process.exit(1);
    }
  });

// Migrate command
program
  .command('migrate')
  .description('Run pending migrations')
  .option('-t, --target <version>', 'Migrate to specific version')
  .option('-d, --dry-run', 'Show what would be executed without making changes')
  .option('-f, --force', 'Force migration even with checksum mismatch')
  .option('-s, --steps <n>', 'Run only N migrations', parseInt)
  .action(async (options) => {
    try {
      console.log(chalk.blue('Starting migration...'));
      
      // Initialize if needed
      await runner.initialize();
      
      // Run migrations
      const result = await runner.runMigrations({
        targetVersion: options.target,
        dryRun: options.dryRun,
        force: options.force,
        steps: options.steps
      });
      
      if (result.executed.length > 0) {
        console.log(chalk.green(`✓ Executed ${result.executed.length} migration(s)`));
      }
      
      if (result.skipped && result.skipped.length > 0) {
        console.log(chalk.yellow(`⊘ Skipped ${result.skipped.length} migration(s)`));
      }
      
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Migration failed:'), error.message);
      process.exit(1);
    }
  });

// Rollback command
program
  .command('rollback')
  .description('Rollback executed migrations')
  .option('-s, --steps <n>', 'Rollback N migrations', parseInt, 1)
  .option('-t, --to <version>', 'Rollback to specific version')
  .option('-a, --all', 'Rollback all migrations')
  .option('-d, --dry-run', 'Show what would be rolled back without making changes')
  .option('-f, --force', 'Force rollback even without rollback file')
  .action(async (options) => {
    try {
      console.log(chalk.yellow('Starting rollback...'));
      
      const steps = options.all ? 999999 : options.steps;
      
      const result = await rollbackManager.rollback({
        steps,
        toVersion: options.to,
        dryRun: options.dryRun,
        force: options.force
      });
      
      if (result.rolledBack.length > 0) {
        console.log(chalk.green(`✓ Rolled back ${result.rolledBack.length} migration(s)`));
      }
      
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Rollback failed:'), error.message);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show migration status')
  .option('-v, --verbose', 'Show detailed information')
  .option('-l, --limit <n>', 'Limit number of migrations shown', parseInt, 20)
  .action(async (options) => {
    try {
      await statusViewer.showStatus({
        verbose: options.verbose,
        limit: options.limit
      });
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Failed to get status:'), error.message);
      process.exit(1);
    }
  });

// Create command
program
  .command('create <name>')
  .description('Create a new migration')
  .option('-t, --type <type>', 'Use specific template type')
  .option('-d, --description <desc>', 'Migration description')
  .action(async (name, options) => {
    try {
      const result = await generator.create(name, {
        type: options.type,
        description: options.description
      });
      
      console.log(chalk.green('Migration created successfully'));
      console.log(chalk.gray(`Migration: ${result.migration}`));
      console.log(chalk.gray(`Rollback: ${result.rollback}`));
      
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Failed to create migration:'), error.message);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate migration files')
  .action(async () => {
    try {
      console.log(chalk.blue('Validating migrations...'));
      
      const pending = await runner.getPendingMigrations();
      const { rows: executed } = await pool.query(
        'SELECT version, filename, checksum FROM _migrations WHERE status = $1',
        ['completed']
      );
      
      let hasErrors = false;
      
      // Check for checksum mismatches
      for (const migration of executed) {
        const currentChecksum = await generator.getFileChecksum(migration.filename);
        if (currentChecksum && currentChecksum !== migration.checksum) {
          console.error(chalk.red(`✗ Checksum mismatch: ${migration.filename}`));
          hasErrors = true;
        }
      }
      
      // Check for missing rollback files
      for (const migration of pending) {
        const hasRollback = await rollbackManager.checkRollbackFile(migration);
        if (!hasRollback) {
          console.warn(chalk.yellow(`⚠ Missing rollback file: ${migration.filename}`));
        }
      }
      
      if (!hasErrors) {
        console.log(chalk.green('✓ All migrations are valid'));
      }
      
      process.exit(hasErrors ? 1 : 0);
    } catch (error) {
      console.error(chalk.red('Validation failed:'), error.message);
      process.exit(1);
    }
  });

// Reset command (danger!)
program
  .command('reset')
  .description('Reset database (DANGER: drops all data)')
  .option('-f, --force', 'Skip confirmation')
  .action(async (options) => {
    try {
      if (!options.force) {
        console.log(chalk.red('⚠️  WARNING: This will drop all tables and data!'));
        console.log(chalk.red('Use --force to confirm'));
        process.exit(1);
      }
      
      console.log(chalk.red('Resetting database...'));
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Drop all tables in public schema
        await client.query(`
          DO $$ 
          DECLARE
            r RECORD;
          BEGIN
            FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
            LOOP
              EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
            END LOOP;
          END $$;
        `);
        
        await client.query('COMMIT');
        console.log(chalk.green('✓ Database reset complete'));
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Reset failed:'), error.message);
      process.exit(1);
    }
  });

// List templates command
program
  .command('templates')
  .description('List available migration templates')
  .action(async () => {
    try {
      const templates = await generator.listTemplates();
      
      console.log(chalk.blue('Available templates:'));
      templates.forEach(template => {
        console.log(`  - ${template}`);
      });
      
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Failed to list templates:'), error.message);
      process.exit(1);
    }
  });

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Unhandled error:'), error);
  process.exit(1);
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}