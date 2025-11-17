/**
 * Performance Data Generator
 * Generates large volumes of test data for performance testing
 */

import pkg from 'pg';
const { Pool } = pkg;
import { faker } from '@faker-js/faker/locale/ja';
import chalk from 'chalk';
import ora from 'ora';
import { Worker } from 'worker_threads';
import os from 'os';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PerformanceDataGenerator {
  constructor(config = {}) {
    this.config = {
      concurrency: os.cpus().length,
      batchSize: 1000,
      verbose: false,
      ...config
    };
    
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || process.env.DEV_DATABASE_URL,
      max: this.config.concurrency * 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    
    this.statistics = {
      startTime: null,
      endTime: null,
      totalRecords: 0,
      recordsPerSecond: 0,
      memoryUsage: {}
    };
  }

  /**
   * Generate bulk data with parallel processing
   */
  async generateBulkData(options) {
    const {
      users = 10000,
      products = 50000,
      transactions = 100000,
      concurrency = this.config.concurrency
    } = options;
    
    this.statistics.startTime = Date.now();
    const spinner = ora('Initializing performance test data generation...').start();
    
    try {
      // Monitor memory usage
      this.startMemoryMonitoring();
      
      // Generate users in parallel
      spinner.text = `Generating ${users.toLocaleString()} users with ${concurrency} workers...`;
      await this.generateInParallel('users', users, concurrency);
      
      // Generate products in parallel
      spinner.text = `Generating ${products.toLocaleString()} products with ${concurrency} workers...`;
      await this.generateInParallel('products', products, concurrency);
      
      // Generate transactions in parallel
      spinner.text = `Generating ${transactions.toLocaleString()} transactions with ${concurrency} workers...`;
      await this.generateInParallel('transactions', transactions, concurrency);
      
      this.statistics.endTime = Date.now();
      this.statistics.totalRecords = users + products + transactions;
      this.statistics.recordsPerSecond = Math.round(
        this.statistics.totalRecords / ((this.statistics.endTime - this.statistics.startTime) / 1000)
      );
      
      spinner.succeed('Performance test data generated successfully!');
      this.printStatistics();
      
    } catch (error) {
      spinner.fail('Performance data generation failed');
      console.error(chalk.red('Error:'), error.message);
      throw error;
    } finally {
      this.stopMemoryMonitoring();
    }
  }

  /**
   * Generate data in parallel using worker threads
   */
  async generateInParallel(type, totalCount, concurrency) {
    const chunkSize = Math.ceil(totalCount / concurrency);
    const promises = [];
    
    for (let i = 0; i < concurrency; i++) {
      const offset = i * chunkSize;
      const limit = Math.min(chunkSize, totalCount - offset);
      
      if (limit > 0) {
        promises.push(
          this.generateChunk(type, offset, limit, i)
        );
      }
    }
    
    await Promise.all(promises);
  }

  /**
   * Generate a chunk of data
   */
  async generateChunk(type, offset, limit, workerId) {
    const client = await this.pool.connect();
    
    try {
      const batchSize = this.config.batchSize;
      const batches = Math.ceil(limit / batchSize);
      
      for (let batch = 0; batch < batches; batch++) {
        const batchOffset = batch * batchSize;
        const batchLimit = Math.min(batchSize, limit - batchOffset);
        
        const data = this.generateBatchData(type, offset + batchOffset, batchLimit);
        await this.insertBatch(client, type, data);
        
        if (this.config.verbose) {
          console.log(chalk.gray(`Worker ${workerId}: Inserted batch ${batch + 1}/${batches} for ${type}`));
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Generate batch data based on type
   */
  generateBatchData(type, offset, limit) {
    const data = [];
    
    switch (type) {
      case 'users':
        for (let i = 0; i < limit; i++) {
          data.push(this.generateUser(offset + i));
        }
        break;
        
      case 'products':
        for (let i = 0; i < limit; i++) {
          data.push(this.generateProduct(offset + i));
        }
        break;
        
      case 'transactions':
        for (let i = 0; i < limit; i++) {
          data.push(this.generateTransaction(offset + i));
        }
        break;
    }
    
    return data;
  }

  /**
   * Generate a single user
   */
  generateUser(index) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    
    return {
      email: `user${index}@example.com`,
      password_hash: '$2a$10$YourHashedPasswordHere', // Pre-hashed for speed
      name: `${lastName} ${firstName}`,
      role: faker.helpers.weightedArrayElement([
        { weight: 70, value: 'customer' },
        { weight: 20, value: 'staff' },
        { weight: 8, value: 'manager' },
        { weight: 2, value: 'admin' }
      ]),
      phone: this.generatePhoneNumber(),
      address: faker.location.streetAddress(),
      postal_code: faker.location.zipCode('###-####'),
      email_verified: faker.datatype.boolean({ probability: 0.8 }),
      created_at: faker.date.recent({ days: 365 })
    };
  }

  /**
   * Generate a single product
   */
  generateProduct(index) {
    const categories = ['consoles', 'games', 'accessories', 'retro'];
    const conditions = ['S', 'A', 'B', 'C', 'D'];
    
    return {
      sku: `SKU-${Date.now()}-${index}`,
      name: faker.commerce.productName(),
      category_id: faker.number.int({ min: 1, max: 5 }),
      manufacturer_id: faker.number.int({ min: 1, max: 8 }),
      model: faker.string.alphanumeric(8).toUpperCase(),
      description: faker.commerce.productDescription(),
      purchase_price: faker.number.int({ min: 1000, max: 30000 }),
      selling_price: faker.number.int({ min: 2000, max: 50000 }),
      stock_quantity: faker.number.int({ min: 0, max: 100 }),
      condition_grade: faker.helpers.arrayElement(conditions),
      status: 'active'
    };
  }

  /**
   * Generate a single transaction
   */
  generateTransaction(index) {
    const subtotal = faker.number.int({ min: 5000, max: 200000 });
    const taxRate = 0.1;
    
    return {
      order_number: `ORD-${Date.now()}-${index}`,
      customer_id: faker.number.int({ min: 1, max: 10000 }),
      status: faker.helpers.arrayElement(['pending', 'processing', 'completed', 'cancelled']),
      subtotal: subtotal,
      tax_amount: Math.floor(subtotal * taxRate),
      shipping_fee: faker.number.int({ min: 0, max: 1500 }),
      total_amount: Math.floor(subtotal * (1 + taxRate)),
      payment_method: faker.helpers.arrayElement(['cash', 'credit_card', 'bank_transfer']),
      ordered_at: faker.date.recent({ days: 90 })
    };
  }

  /**
   * Insert batch data into database
   */
  async insertBatch(client, type, data) {
    if (data.length === 0) return;
    
    let query;
    let values;
    
    switch (type) {
      case 'users':
        query = this.buildBatchInsertQuery('users', data, [
          'email', 'password_hash', 'name', 'role', 'phone',
          'address', 'postal_code', 'email_verified', 'created_at'
        ]);
        break;
        
      case 'products':
        query = this.buildBatchInsertQuery('products', data, [
          'sku', 'name', 'category_id', 'manufacturer_id', 'model',
          'description', 'purchase_price', 'selling_price',
          'stock_quantity', 'condition_grade', 'status'
        ]);
        break;
        
      case 'transactions':
        query = this.buildBatchInsertQuery('sales_orders', data, [
          'order_number', 'customer_id', 'status', 'subtotal',
          'tax_amount', 'shipping_fee', 'total_amount',
          'payment_method', 'ordered_at'
        ]);
        break;
    }
    
    await client.query(query);
  }

  /**
   * Build batch insert query
   */
  buildBatchInsertQuery(table, data, columns) {
    const values = [];
    const placeholders = [];
    let paramIndex = 1;
    
    data.forEach(row => {
      const rowPlaceholders = [];
      columns.forEach(col => {
        values.push(row[col]);
        rowPlaceholders.push(`$${paramIndex++}`);
      });
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    });
    
    const query = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT DO NOTHING
    `;
    
    return { text: query, values };
  }

  /**
   * Generate phone number
   */
  generatePhoneNumber() {
    const areaCodes = ['03', '06', '075', '052', '011', '092'];
    const areaCode = faker.helpers.arrayElement(areaCodes);
    return `${areaCode}-${faker.string.numeric(4)}-${faker.string.numeric(4)}`;
  }

  /**
   * Start memory monitoring
   */
  startMemoryMonitoring() {
    this.memoryInterval = setInterval(() => {
      const usage = process.memoryUsage();
      this.statistics.memoryUsage = {
        rss: Math.round(usage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(usage.external / 1024 / 1024) + ' MB'
      };
    }, 1000);
  }

  /**
   * Stop memory monitoring
   */
  stopMemoryMonitoring() {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
    }
  }

  /**
   * Print performance statistics
   */
  printStatistics() {
    const duration = (this.statistics.endTime - this.statistics.startTime) / 1000;
    
    console.log(chalk.cyan('\n📊 Performance Statistics:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.green('Total Records:'), chalk.yellow(this.statistics.totalRecords.toLocaleString()));
    console.log(chalk.green('Duration:'), chalk.yellow(`${duration.toFixed(2)} seconds`));
    console.log(chalk.green('Records/Second:'), chalk.yellow(this.statistics.recordsPerSecond.toLocaleString()));
    console.log(chalk.green('Concurrency:'), chalk.yellow(this.config.concurrency));
    console.log(chalk.green('Batch Size:'), chalk.yellow(this.config.batchSize));
    
    console.log(chalk.cyan('\n💾 Memory Usage:'));
    console.log(chalk.gray('─'.repeat(50)));
    Object.entries(this.statistics.memoryUsage).forEach(([key, value]) => {
      console.log(chalk.green(`${key}:`), chalk.yellow(value));
    });
    
    console.log(chalk.gray('─'.repeat(50)));
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    await this.pool.end();
  }
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const generator = new PerformanceDataGenerator({
    verbose: process.argv.includes('--verbose')
  });
  
  generator.generateBulkData({
    users: parseInt(process.env.PERF_USERS) || 10000,
    products: parseInt(process.env.PERF_PRODUCTS) || 50000,
    transactions: parseInt(process.env.PERF_TRANSACTIONS) || 100000
  })
  .then(() => generator.cleanup())
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
}

export default PerformanceDataGenerator;