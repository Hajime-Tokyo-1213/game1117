#!/usr/bin/env node

/**
 * Database Seeding CLI
 * Command-line interface for database seeding operations
 */

import { Command } from 'commander';
import DataSeeder from './DataSeeder.js';
import { getConfig, mergeConfig, validateConfig } from './config.js';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { config as dotenvConfig } from 'dotenv';
import ora from 'ora';

// Load environment variables
dotenvConfig();

const program = new Command();

program
  .name('seed')
  .description('Database seeding utility for Game-F system')
  .version('1.0.0');

// Run command
program
  .command('run')
  .description('Run database seeders')
  .option('-e, --env <environment>', 'Target environment', 'development')
  .option('-s, --specific <tables...>', 'Seed specific tables only')
  .option('-q, --quantity <type:count...>', 'Override quantities (e.g., users:10 products:20)')
  .option('-f, --force', 'Force seed in production environment')
  .option('-v, --verbose', 'Verbose output')
  .option('--dry-run', 'Show what would be seeded without executing')
  .option('--no-relationships', 'Skip relationship generation')
  .action(async (options) => {
    try {
      // Get base configuration
      let config = getConfig(options.env);
      
      // Parse quantity overrides
      if (options.quantity) {
        const quantityOverrides = {};
        options.quantity.forEach(q => {
          const [type, count] = q.split(':');
          quantityOverrides[type] = parseInt(count, 10);
        });
        config = mergeConfig(options.env, { quantity: quantityOverrides });
      }
      
      // Add CLI options to config
      config = {
        ...config,
        environment: options.env,
        specific: options.specific,
        force: options.force,
        verbose: options.verbose || config.verbose,
        generateRelationships: options.relationships !== false
      };
      
      // Validate configuration
      const validation = validateConfig(config);
      if (!validation.isValid) {
        console.error(chalk.red('Configuration errors:'));
        validation.errors.forEach(error => {
          console.error(chalk.red(`  - ${error}`));
        });
        process.exit(1);
      }
      
      // Production safety check
      if (options.env === 'production' && !options.force) {
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: chalk.red('⚠️  WARNING: You are about to seed the PRODUCTION database. This action cannot be undone. Are you sure?'),
          default: false
        }]);
        
        if (!confirm) {
          console.log(chalk.yellow('Seed operation cancelled'));
          process.exit(0);
        }
        
        // Double confirmation for production
        const { confirmAgain } = await inquirer.prompt([{
          type: 'input',
          name: 'confirmAgain',
          message: chalk.red('Type "SEED PRODUCTION" to confirm:'),
          validate: input => input === 'SEED PRODUCTION' || 'Please type exactly: SEED PRODUCTION'
        }]);
        
        if (confirmAgain !== 'SEED PRODUCTION') {
          console.log(chalk.yellow('Seed operation cancelled'));
          process.exit(0);
        }
      }
      
      console.log(chalk.blue(`\n🌱 Seeding ${options.env} database...\n`));
      
      if (options.dryRun) {
        console.log(chalk.yellow('DRY RUN MODE - No data will be inserted\n'));
        displayDryRunInfo(config);
      } else {
        const seeder = new DataSeeder(config);
        await seeder.seed();
        await seeder.cleanup();
      }
      
      console.log(chalk.green('\n✅ Seed operation completed successfully!'));
      
    } catch (error) {
      console.error(chalk.red('\n❌ Seed operation failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

// Clean command
program
  .command('clean')
  .description('Clean all seeded data (dangerous!)')
  .option('-e, --env <environment>', 'Target environment', 'development')
  .option('-t, --tables <tables...>', 'Clean specific tables only')
  .option('-f, --force', 'Force clean without confirmation')
  .action(async (options) => {
    try {
      if (!options.force) {
        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: chalk.yellow('⚠️  This will delete all data from the specified tables. Are you sure?'),
          default: false
        }]);
        
        if (!confirm) {
          console.log(chalk.yellow('Clean operation cancelled'));
          process.exit(0);
        }
      }
      
      const spinner = ora('Cleaning database...').start();
      
      // Create a temporary pool for cleaning
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: getConnectionString(options.env),
        ssl: options.env === 'production' ? { rejectUnauthorized: false } : false
      });
      
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        const tables = options.tables || [
          'sales_order_items', 'sales_orders',
          'buyback_items', 'buyback_applications',
          'stock_movements', 'products',
          'manufacturers', 'product_categories',
          'user_sessions', 'users'
        ];
        
        for (const table of tables) {
          await client.query(`DELETE FROM ${table}`);
          spinner.text = `Cleaned table: ${table}`;
        }
        
        await client.query('COMMIT');
        spinner.succeed('Database cleaned successfully');
        
      } catch (error) {
        await client.query('ROLLBACK');
        spinner.fail('Clean operation failed');
        throw error;
      } finally {
        client.release();
        await pool.end();
      }
      
    } catch (error) {
      console.error(chalk.red('Clean operation failed:'), error.message);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show database seeding status')
  .option('-e, --env <environment>', 'Target environment', 'development')
  .action(async (options) => {
    try {
      const spinner = ora('Checking database status...').start();
      
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: getConnectionString(options.env),
        ssl: options.env === 'production' ? { rejectUnauthorized: false } : false
      });
      
      const client = await pool.connect();
      
      try {
        const tables = [
          'users', 'products', 'buyback_applications',
          'sales_orders', 'antiquities_ledger', 'stock_movements'
        ];
        
        console.log(chalk.cyan('\n📊 Database Status:\n'));
        console.log(chalk.gray('─'.repeat(50)));
        
        for (const table of tables) {
          try {
            const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
            const count = parseInt(result.rows[0].count, 10);
            const status = count > 0 ? chalk.green('✓') : chalk.gray('○');
            console.log(`${status} ${table.padEnd(25)} ${chalk.yellow(count.toLocaleString())} records`);
          } catch (error) {
            console.log(chalk.red('✗'), `${table.padEnd(25)} ${chalk.gray('table not found')}`);
          }
        }
        
        console.log(chalk.gray('─'.repeat(50)));
        spinner.stop();
        
      } finally {
        client.release();
        await pool.end();
      }
      
    } catch (error) {
      console.error(chalk.red('Status check failed:'), error.message);
      process.exit(1);
    }
  });

// Generate command
program
  .command('generate <type>')
  .description('Generate specific type of test data')
  .option('-c, --count <number>', 'Number of records to generate', '10')
  .option('-o, --output <file>', 'Output to file instead of database')
  .action(async (type, options) => {
    try {
      const count = parseInt(options.count, 10);
      console.log(chalk.blue(`Generating ${count} ${type} records...`));
      
      // Import the appropriate generator
      const generatorModule = await import(`./generators/${type}Generator.js`);
      const Generator = generatorModule.default;
      
      const generator = new Generator();
      const data = await generator.generate(count);
      
      if (options.output) {
        const fs = await import('fs/promises');
        await fs.writeFile(options.output, JSON.stringify(data, null, 2));
        console.log(chalk.green(`✓ Generated data saved to ${options.output}`));
      } else {
        console.log(chalk.green(`✓ Generated ${data.length} ${type} records`));
      }
      
    } catch (error) {
      console.error(chalk.red('Generation failed:'), error.message);
      process.exit(1);
    }
  });

// Helper functions
function getConnectionString(env) {
  switch (env) {
    case 'production':
      return process.env.DATABASE_URL;
    case 'test':
      return process.env.TEST_DATABASE_URL;
    default:
      return process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
  }
}

function displayDryRunInfo(config) {
  console.log(chalk.cyan('Configuration:'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(`Environment: ${chalk.yellow(config.environment)}`);
  console.log(`Locale: ${chalk.yellow(config.locale)}`);
  console.log(`Batch Size: ${chalk.yellow(config.batchSize)}`);
  
  console.log(chalk.cyan('\nPlanned quantities:'));
  console.log(chalk.gray('─'.repeat(40)));
  Object.entries(config.quantity).forEach(([table, count]) => {
    if (count > 0) {
      console.log(`  ${table}: ${chalk.yellow(count)} records`);
    }
  });
  
  console.log(chalk.cyan('\nEnabled features:'));
  console.log(chalk.gray('─'.repeat(40)));
  Object.entries(config.features).forEach(([feature, enabled]) => {
    const status = enabled ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${status} ${feature}`);
  });
}

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}