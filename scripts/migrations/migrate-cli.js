#!/usr/bin/env node

/**
 * Supabase Migration CLI
 * Command-line interface for localStorage to Supabase migration
 */

import { Command } from 'commander';
import SupabaseMigrator from './SupabaseMigrator.js';
import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenvConfig({ path: path.resolve(__dirname, '../../.env') });
dotenvConfig({ path: path.resolve(__dirname, '../../.env.local') });

const program = new Command();

program
  .name('supabase-migrate')
  .description('Migrate localStorage data to Supabase')
  .version('1.0.0');

program
  .command('migrate')
  .description('Run the migration')
  .option('-f, --file <path>', 'Path to localStorage export file')
  .option('-d, --dry-run', 'Run in dry-run mode (no data changes)')
  .option('-v, --validate-only', 'Only validate data without migration')
  .option('-b, --batch-size <number>', 'Batch size for processing', '100')
  .option('-c, --concurrency <number>', 'Concurrent operations', '5')
  .option('--continue-on-error', 'Continue migration on errors', true)
  .option('--interactive', 'Interactive mode with prompts')
  .action(async (options) => {
    const spinner = ora('Initializing migration...').start();

    try {
      let data;

      // Determine data source
      if (options.file) {
        spinner.text = 'Loading data from file...';
        const content = await fs.readFile(options.file, 'utf-8');
        data = JSON.parse(content);
      } else if (options.interactive) {
        spinner.stop();
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'source',
            message: 'Select data source:',
            choices: [
              'Load from localStorage export file',
              'Use sample data for testing'
            ]
          }
        ]);

        if (answers.source === 'Load from localStorage export file') {
          const { filePath } = await inquirer.prompt([{
            type: 'input',
            name: 'filePath',
            message: 'Enter file path:',
            validate: async (input) => {
              try {
                await fs.access(input);
                return true;
              } catch {
                return 'File does not exist';
              }
            }
          }]);
          
          const content = await fs.readFile(filePath, 'utf-8');
          data = JSON.parse(content);
        } else {
          data = await generateSampleData();
        }
        
        spinner.start('Starting migration...');
      } else {
        // Try to load from default export file
        try {
          const defaultFile = './localStorage-export.json';
          await fs.access(defaultFile);
          spinner.text = 'Loading data from default export file...';
          const content = await fs.readFile(defaultFile, 'utf-8');
          data = JSON.parse(content);
        } catch {
          spinner.fail('No data source specified. Use --file or --interactive');
          process.exit(1);
        }
      }

      // Validate environment variables
      if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
        spinner.fail('SUPABASE_URL environment variable is required');
        process.exit(1);
      }

      spinner.text = 'Starting migration...';
      const migrator = new SupabaseMigrator();

      await migrator.migrateFromLocalStorage(data, {
        batchSize: parseInt(options.batchSize),
        concurrency: parseInt(options.concurrency),
        dryRun: options.dryRun,
        continueOnError: options.continueOnError,
        validateOnly: options.validateOnly
      });

      spinner.succeed('Migration completed successfully!');

    } catch (error) {
      spinner.fail('Migration failed');
      console.error(chalk.red('Error:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export localStorage data to file')
  .option('-o, --output <path>', 'Output file path', './localStorage-export.json')
  .action(async (options) => {
    const spinner = ora('Generating sample export data...').start();

    try {
      const data = await generateSampleData();
      await fs.writeFile(
        options.output,
        JSON.stringify(data, null, 2)
      );
      spinner.succeed(`Sample data exported to ${options.output}`);
    } catch (error) {
      spinner.fail('Export failed');
      console.error(error);
    }
  });

program
  .command('validate')
  .description('Validate localStorage data')
  .option('-f, --file <path>', 'Path to localStorage export file')
  .action(async (options) => {
    const spinner = ora('Validating data...').start();

    try {
      let data;
      
      if (options.file) {
        data = JSON.parse(await fs.readFile(options.file, 'utf-8'));
      } else {
        data = await generateSampleData();
      }

      const migrator = new SupabaseMigrator();
      await migrator.migrateFromLocalStorage(data, {
        validateOnly: true
      });

      spinner.succeed('Validation completed');
    } catch (error) {
      spinner.fail('Validation failed');
      console.error(error);
    }
  });

program
  .command('status')
  .description('Check Supabase connection status')
  .action(async () => {
    const spinner = ora('Checking connection...').start();

    try {
      const migrator = new SupabaseMigrator();
      
      // Test connection
      const { data, error } = await migrator.supabase
        .from('users')
        .select('count')
        .limit(1);

      if (error && !error.message.includes('relation "users" does not exist')) {
        throw error;
      }

      spinner.succeed('Supabase connection OK');
      console.log(chalk.green('✓ Environment variables configured'));
      console.log(chalk.green('✓ Supabase client initialized'));
      console.log(chalk.yellow('Note: Database tables may need to be created first'));

    } catch (error) {
      spinner.fail('Connection failed');
      console.error(chalk.red('Error:'), error.message);
      
      if (error.message.includes('Invalid API key')) {
        console.log(chalk.yellow('Check your SUPABASE_ANON_KEY and SUPABASE_URL'));
      }
    }
  });

// Helper function to generate sample data for testing
async function generateSampleData() {
  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      source: 'sample_generator',
      version: '1.0.0'
    },
    users: [
      {
        email: 'admin@example.com',
        password: 'Admin123!@#',
        name: 'システム管理者',
        role: 'admin',
        phone: '03-1234-5678',
        address: '東京都渋谷区1-1-1',
        postalCode: '150-0001'
      },
      {
        email: 'staff@example.com',
        password: 'Staff123!@#',
        name: 'スタッフ太郎',
        role: 'staff',
        phone: '03-2345-6789',
        address: '東京都新宿区2-2-2',
        postalCode: '160-0001'
      }
    ],
    inventory: [
      {
        name: 'Nintendo Switch',
        category: 'consoles',
        manufacturer: 'nintendo',
        condition: 'A',
        purchasePrice: 25000,
        sellingPrice: 35000,
        quantity: 5,
        model: 'HAC-001',
        description: '人気のゲーム機'
      },
      {
        name: 'PlayStation 5',
        category: 'consoles',
        manufacturer: 'sony',
        condition: 'S',
        purchasePrice: 45000,
        sellingPrice: 60000,
        quantity: 3,
        model: 'CFI-1200A01',
        description: '最新ゲーム機'
      }
    ],
    buybackRequests: [
      {
        customerName: '山田太郎',
        email: 'yamada@example.com',
        phone: '090-1234-5678',
        address: '東京都渋谷区3-3-3',
        postalCode: '150-0003',
        items: ['Nintendo Switch', 'ゲームソフト10本'],
        estimatedValue: 40000,
        status: 'pending',
        notes: '状態良好'
      }
    ],
    salesData: [
      {
        orderNumber: 'ORD-2024001',
        customerId: 1,
        subtotal: 35000,
        taxAmount: 3500,
        totalAmount: 38500,
        paymentMethod: 'credit_card',
        status: 'completed',
        orderedAt: new Date()
      }
    ],
    antiquitiesLedger: [
      {
        entryNumber: 'ENT-2024001',
        date: new Date(),
        type: 'purchase',
        itemName: 'Nintendo Switch',
        description: 'ゲーム機',
        customerName: '田中次郎',
        customerAddress: '東京都新宿区4-4-4',
        idType: 'drivers_license',
        idNumber: '123456789',
        price: 25000
      }
    ]
  };
}

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}