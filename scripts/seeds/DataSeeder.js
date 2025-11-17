/**
 * Database Seeder for Development/Testing
 * Generates realistic test data for all database tables
 */

import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
import { faker } from '@faker-js/faker/locale/ja';
import chalk from 'chalk';
import ora from 'ora';
import { addDays, subMonths } from 'date-fns';

class DataSeeder {
  constructor(config) {
    this.config = {
      environment: 'development',
      locale: 'ja',
      batchSize: 100,
      verbose: false,
      ...config
    };
    
    this.pool = new Pool({
      connectionString: this.getConnectionString(),
      ssl: this.config.environment === 'production' ? { rejectUnauthorized: false } : false
    });
    
    this.statistics = new Map();
    this.relationships = new Map();
    
    // Set faker locale
    faker.locale = this.config.locale;
  }

  getConnectionString() {
    const env = this.config.environment;
    switch (env) {
      case 'production':
        return process.env.DATABASE_URL;
      case 'test':
        return process.env.TEST_DATABASE_URL;
      default:
        return process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
    }
  }

  async seed() {
    const spinner = ora('Initializing seed process...').start();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      
      // Verify environment safety
      await this.verifyEnvironment(client);
      
      // Seed in dependency order
      const seedOrder = [
        { name: 'roles', method: this.seedRoles.bind(this) },
        { name: 'users', method: this.seedUsers.bind(this) },
        { name: 'categories', method: this.seedCategories.bind(this) },
        { name: 'manufacturers', method: this.seedManufacturers.bind(this) },
        { name: 'products', method: this.seedProducts.bind(this) },
        { name: 'inventory', method: this.seedInventory.bind(this) },
        { name: 'buyback_applications', method: this.seedBuybackApplications.bind(this) },
        { name: 'sales_orders', method: this.seedSalesOrders.bind(this) },
        { name: 'antiquities_ledger', method: this.seedAntiquitiesLedger.bind(this) }
      ];

      for (const seed of seedOrder) {
        if (this.shouldSeed(seed.name)) {
          spinner.text = `Seeding ${seed.name}...`;
          const count = await seed.method(client);
          this.statistics.set(seed.name, count);
          spinner.succeed(`${seed.name}: ${count} records created`);
        }
      }

      await client.query('COMMIT');
      spinner.succeed('Seed completed successfully!');
      
      this.printStatistics();
      
    } catch (error) {
      await client.query('ROLLBACK');
      spinner.fail('Seed failed');
      console.error(chalk.red('Error:'), error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async seedRoles(client) {
    const roles = [
      { name: 'admin', display_name: '管理者', description: 'システム全体の管理権限' },
      { name: 'manager', display_name: 'マネージャー', description: '店舗管理と承認権限' },
      { name: 'staff', display_name: 'スタッフ', description: '通常業務の実行権限' },
      { name: 'customer', display_name: '顧客', description: '基本的なサービス利用権限' },
      { name: 'overseas_buyer', display_name: '海外バイヤー', description: '海外取引専用の権限' }
    ];

    for (const role of roles) {
      await client.query(
        'INSERT INTO roles (name, display_name, description, is_system) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING',
        [role.name, role.display_name, role.description, true]
      );
    }

    return roles.length;
  }

  async seedUsers(client) {
    const users = [];
    const quantity = this.getQuantity('users');

    // Admin user (always created in non-production)
    if (this.config.environment !== 'production') {
      const adminPassword = await bcrypt.hash('Admin123!@#', 12);
      users.push({
        email: 'admin@example.com',
        password_hash: adminPassword,
        name: 'システム管理者',
        role: 'admin',
        email_verified: true,
        phone: '03-1234-5678'
      });

      // Staff user
      const staffPassword = await bcrypt.hash('Staff123!', 12);
      users.push({
        email: 'staff@example.com',
        password_hash: staffPassword,
        name: 'スタッフユーザー',
        role: 'staff',
        email_verified: true,
        phone: '03-2345-6789'
      });
    }

    // Generate test users
    for (let i = 0; i < quantity - 2; i++) {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const password = await bcrypt.hash('Password123!', 10);
      
      users.push({
        email: faker.internet.email({ firstName, lastName }).toLowerCase(),
        password_hash: password,
        name: `${lastName} ${firstName}`,
        role: faker.helpers.arrayElement(['customer', 'customer', 'customer', 'staff']),
        phone: this.generateJapanesePhone(),
        address: this.generateJapaneseAddress(),
        postal_code: faker.location.zipCode('###-####'),
        email_verified: faker.datatype.boolean({ probability: 0.8 }),
        metadata: {
          source: 'seed',
          created_by: 'DataSeeder',
          locale: 'ja'
        }
      });
    }

    // Batch insert users
    const insertedUsers = [];
    for (const user of users) {
      const result = await client.query(
        `INSERT INTO users (email, password_hash, name, role, phone, address, postal_code, email_verified, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, email, name, role`,
        [user.email, user.password_hash, user.name, user.role, user.phone, 
         user.address, user.postal_code, user.email_verified, JSON.stringify(user.metadata || {})]
      );
      insertedUsers.push(result.rows[0]);
    }

    this.relationships.set('users', insertedUsers);
    return insertedUsers.length;
  }

  async seedCategories(client) {
    const categories = [
      { name: 'consoles', display_name: 'ゲーム機本体', parent_id: null },
      { name: 'games', display_name: 'ゲームソフト', parent_id: null },
      { name: 'accessories', display_name: 'アクセサリー', parent_id: null },
      { name: 'retro', display_name: 'レトロゲーム', parent_id: null },
      { name: 'limited', display_name: '限定品', parent_id: null }
    ];

    const insertedCategories = [];
    for (const category of categories) {
      const result = await client.query(
        `INSERT INTO product_categories (name, display_name, parent_id, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id, name`,
        [category.name, category.display_name, category.parent_id, 0]
      );
      insertedCategories.push(result.rows[0]);
    }

    this.relationships.set('categories', insertedCategories);
    return insertedCategories.length;
  }

  async seedManufacturers(client) {
    const manufacturers = [
      { name: 'Nintendo', display_name: '任天堂', country: 'Japan' },
      { name: 'Sony', display_name: 'ソニー', country: 'Japan' },
      { name: 'Microsoft', display_name: 'マイクロソフト', country: 'USA' },
      { name: 'Sega', display_name: 'セガ', country: 'Japan' },
      { name: 'Bandai Namco', display_name: 'バンダイナムコ', country: 'Japan' },
      { name: 'Square Enix', display_name: 'スクウェア・エニックス', country: 'Japan' },
      { name: 'Capcom', display_name: 'カプコン', country: 'Japan' },
      { name: 'Konami', display_name: 'コナミ', country: 'Japan' }
    ];

    const insertedManufacturers = [];
    for (const manufacturer of manufacturers) {
      const result = await client.query(
        `INSERT INTO manufacturers (name, display_name, country)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id, name`,
        [manufacturer.name, manufacturer.display_name, manufacturer.country]
      );
      insertedManufacturers.push(result.rows[0]);
    }

    this.relationships.set('manufacturers', insertedManufacturers);
    return insertedManufacturers.length;
  }

  async seedProducts(client) {
    const quantity = this.getQuantity('products');
    const categories = this.relationships.get('categories') || [];
    const manufacturers = this.relationships.get('manufacturers') || [];
    const products = [];

    // Product templates for realistic data
    const templates = this.getProductTemplates();

    for (let i = 0; i < quantity; i++) {
      const category = faker.helpers.arrayElement(categories);
      const manufacturer = faker.helpers.arrayElement(manufacturers);
      const template = faker.helpers.arrayElement(templates[category.name] || templates.games);
      const condition = faker.helpers.arrayElement(['S', 'A', 'B', 'C', 'D']);
      const conditionMultiplier = { S: 1.0, A: 0.9, B: 0.75, C: 0.6, D: 0.4 }[condition];
      
      const product = {
        sku: this.generateSKU(category.name, i),
        name: template.name + ' ' + faker.commerce.productAdjective(),
        category_id: category.id,
        manufacturer_id: manufacturer.id,
        model: faker.string.alphanumeric(8).toUpperCase(),
        description: faker.commerce.productDescription(),
        purchase_price: Math.floor(template.base_price * conditionMultiplier * 0.6),
        selling_price: Math.floor(template.base_price * conditionMultiplier),
        market_price: Math.floor(template.base_price),
        stock_quantity: faker.number.int({ min: 0, max: 50 }),
        minimum_stock: faker.number.int({ min: 1, max: 5 }),
        condition_grade: condition,
        condition_notes: this.getConditionNotes(condition),
        status: faker.helpers.arrayElement(['active', 'active', 'active', 'inactive']),
        metadata: {
          warranty_months: faker.helpers.arrayElement([0, 3, 6, 12]),
          origin_country: 'Japan',
          tags: faker.helpers.arrayElements(['人気', '限定', 'レア', '新入荷', 'セール'], { min: 1, max: 3 })
        }
      };

      const result = await client.query(
        `INSERT INTO products (
          sku, name, category_id, manufacturer_id, model, description,
          purchase_price, selling_price, market_price, stock_quantity,
          minimum_stock, condition_grade, condition_notes, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id, sku, name, selling_price`,
        [product.sku, product.name, product.category_id, product.manufacturer_id,
         product.model, product.description, product.purchase_price, product.selling_price,
         product.market_price, product.stock_quantity, product.minimum_stock,
         product.condition_grade, product.condition_notes, product.status,
         JSON.stringify(product.metadata)]
      );
      
      products.push(result.rows[0]);
    }

    this.relationships.set('products', products);
    return products.length;
  }

  async seedInventory(client) {
    const products = this.relationships.get('products') || [];
    const users = this.relationships.get('users') || [];
    const movements = [];

    for (const product of products.slice(0, 50)) { // Limit to first 50 products
      const movementCount = faker.number.int({ min: 1, max: 5 });
      
      for (let i = 0; i < movementCount; i++) {
        const movement = {
          product_id: product.id,
          movement_type: faker.helpers.arrayElement(['purchase', 'sale', 'adjustment', 'return']),
          quantity: faker.number.int({ min: 1, max: 10 }),
          quantity_before: faker.number.int({ min: 0, max: 100 }),
          quantity_after: faker.number.int({ min: 0, max: 100 }),
          unit_price: product.selling_price,
          notes: faker.datatype.boolean({ probability: 0.3 }) ? faker.lorem.sentence() : null,
          created_by: faker.helpers.arrayElement(users.filter(u => u.role !== 'customer')).id
        };

        await client.query(
          `INSERT INTO stock_movements (
            product_id, movement_type, quantity, quantity_before, quantity_after,
            unit_price, notes, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [movement.product_id, movement.movement_type, movement.quantity,
           movement.quantity_before, movement.quantity_after, movement.unit_price,
           movement.notes, movement.created_by]
        );
        
        movements.push(movement);
      }
    }

    return movements.length;
  }

  async seedBuybackApplications(client) {
    const quantity = this.getQuantity('buyback_applications');
    const users = this.relationships.get('users') || [];
    const products = this.relationships.get('products') || [];
    const customers = users.filter(u => u.role === 'customer');
    
    let applicationCount = 0;

    for (let i = 0; i < quantity; i++) {
      const customer = faker.helpers.arrayElement(customers);
      const applicationNumber = `BA-${new Date().getFullYear()}${String(i + 1).padStart(6, '0')}`;
      
      const result = await client.query(
        `INSERT INTO buyback_applications (
          application_number, customer_id, status, applicant_name,
          applicant_phone, applicant_email, applicant_address,
          estimated_amount, submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [applicationNumber, customer.id, 'submitted', customer.name,
         this.generateJapanesePhone(), customer.email, this.generateJapaneseAddress(),
         faker.number.int({ min: 10000, max: 200000 }), new Date()]
      );
      
      const applicationId = result.rows[0].id;
      
      // Add items to the application
      const itemCount = faker.number.int({ min: 1, max: 5 });
      for (let j = 0; j < itemCount; j++) {
        const product = faker.helpers.arrayElement(products);
        
        await client.query(
          `INSERT INTO buyback_items (
            application_id, product_id, product_name, quantity,
            condition_grade, estimated_price
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [applicationId, product.id, product.name,
           faker.number.int({ min: 1, max: 3 }),
           faker.helpers.arrayElement(['S', 'A', 'B', 'C']),
           faker.number.int({ min: 1000, max: 50000 })]
        );
      }
      
      applicationCount++;
    }

    return applicationCount;
  }

  async seedSalesOrders(client) {
    const quantity = this.getQuantity('sales_orders');
    const users = this.relationships.get('users') || [];
    const products = this.relationships.get('products') || [];
    const customers = users.filter(u => u.role === 'customer');
    
    let orderCount = 0;

    for (let i = 0; i < quantity; i++) {
      const customer = faker.helpers.arrayElement(customers);
      const orderNumber = `SO-${new Date().getFullYear()}${String(i + 1).padStart(6, '0')}`;
      
      const subtotal = faker.number.int({ min: 5000, max: 100000 });
      const taxAmount = Math.floor(subtotal * 0.1);
      const shippingFee = faker.number.int({ min: 0, max: 1000 });
      const totalAmount = subtotal + taxAmount + shippingFee;
      
      const result = await client.query(
        `INSERT INTO sales_orders (
          order_number, customer_id, status, customer_name, customer_email,
          subtotal, tax_amount, shipping_fee, total_amount, payment_method
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id`,
        [orderNumber, customer.id, 'pending', customer.name, customer.email,
         subtotal, taxAmount, shippingFee, totalAmount,
         faker.helpers.arrayElement(['cash', 'credit_card', 'bank_transfer'])]
      );
      
      const orderId = result.rows[0].id;
      
      // Add items to the order
      const itemCount = faker.number.int({ min: 1, max: 5 });
      for (let j = 0; j < itemCount; j++) {
        const product = faker.helpers.arrayElement(products);
        const quantity = faker.number.int({ min: 1, max: 3 });
        
        await client.query(
          `INSERT INTO sales_order_items (
            order_id, product_id, product_name, quantity,
            unit_price, total_amount
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, product.id, product.name, quantity,
           product.selling_price, product.selling_price * quantity]
        );
      }
      
      orderCount++;
    }

    return orderCount;
  }

  async seedAntiquitiesLedger(client) {
    const quantity = this.getQuantity('antiquities_ledger');
    const users = this.relationships.get('users') || [];
    const staff = users.filter(u => u.role !== 'customer');
    
    for (let i = 0; i < quantity; i++) {
      const entryDate = faker.date.recent({ days: 90 });
      
      await client.query(
        `INSERT INTO antiquities_ledger (
          transaction_date, transaction_time, transaction_type,
          counterpart_type, counterpart_name, counterpart_address,
          counterpart_phone, id_document_type, id_document_number,
          id_verification_date, item_category, item_name, quantity,
          unit_price, total_amount, recorded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [entryDate, '10:00:00', 'purchase', 'individual',
         faker.person.fullName(), this.generateJapaneseAddress(),
         this.generateJapanesePhone(), 'drivers_license',
         faker.string.alphanumeric(12).toUpperCase(), entryDate,
         'ゲーム機', faker.commerce.productName(),
         faker.number.int({ min: 1, max: 5 }),
         faker.number.int({ min: 1000, max: 50000 }),
         faker.number.int({ min: 5000, max: 200000 }),
         faker.helpers.arrayElement(staff).id]
      );
    }

    return quantity;
  }

  // Helper methods
  generateSKU(category, index) {
    const prefix = category.substring(0, 3).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase().substring(0, 4);
    const sequence = String(index + 1).padStart(4, '0');
    return `${prefix}-${timestamp}-${sequence}`;
  }

  generateJapanesePhone() {
    const areaCodes = ['03', '06', '075', '052', '011', '092', '098'];
    const areaCode = faker.helpers.arrayElement(areaCodes);
    return `${areaCode}-${faker.string.numeric(4)}-${faker.string.numeric(4)}`;
  }

  generateJapaneseAddress() {
    const prefectures = ['東京都', '大阪府', '京都府', '神奈川県', '愛知県', '福岡県', '北海道'];
    const cities = ['渋谷区', '新宿区', '港区', '中央区', '千代田区', '品川区', '目黒区'];
    const prefecture = faker.helpers.arrayElement(prefectures);
    const city = faker.helpers.arrayElement(cities);
    return `${prefecture}${city}${faker.location.streetAddress()}`;
  }

  getConditionNotes(grade) {
    const notes = {
      S: '新品・未開封品',
      A: '美品・ほぼ新品同様',
      B: '良品・多少の使用感あり',
      C: '可・使用感あり、動作確認済み',
      D: 'ジャンク・部品取り用'
    };
    return notes[grade] || '';
  }

  getProductTemplates() {
    return {
      consoles: [
        { name: 'Nintendo Switch', base_price: 32000 },
        { name: 'PlayStation 5', base_price: 55000 },
        { name: 'Xbox Series X', base_price: 50000 },
        { name: 'Nintendo 3DS', base_price: 15000 },
        { name: 'PlayStation 4', base_price: 30000 }
      ],
      games: [
        { name: 'ゼルダの伝説', base_price: 7000 },
        { name: 'ポケットモンスター', base_price: 6000 },
        { name: 'ファイナルファンタジー', base_price: 8000 },
        { name: 'モンスターハンター', base_price: 7500 },
        { name: 'ドラゴンクエスト', base_price: 7000 }
      ],
      accessories: [
        { name: 'Pro コントローラー', base_price: 7000 },
        { name: 'ワイヤレスヘッドセット', base_price: 10000 },
        { name: 'キャリングケース', base_price: 2000 },
        { name: 'メモリーカード', base_price: 3000 },
        { name: '充電スタンド', base_price: 2500 }
      ],
      retro: [
        { name: 'ファミコン', base_price: 8000 },
        { name: 'スーパーファミコン', base_price: 10000 },
        { name: 'セガサターン', base_price: 12000 },
        { name: 'プレイステーション', base_price: 5000 },
        { name: 'ゲームボーイ', base_price: 6000 }
      ]
    };
  }

  getQuantity(type) {
    const defaults = {
      development: { 
        users: 50, 
        products: 100, 
        buyback_applications: 30,
        sales_orders: 50,
        antiquities_ledger: 20
      },
      staging: { 
        users: 20, 
        products: 50, 
        buyback_applications: 10,
        sales_orders: 20,
        antiquities_ledger: 10
      },
      production: { 
        users: 1, 
        products: 0, 
        buyback_applications: 0,
        sales_orders: 0,
        antiquities_ledger: 0
      },
      test: { 
        users: 10, 
        products: 20, 
        buyback_applications: 5,
        sales_orders: 10,
        antiquities_ledger: 5
      }
    };
    
    const envDefaults = defaults[this.config.environment] || defaults.development;
    return this.config.quantity?.[type] || envDefaults[type] || 0;
  }

  shouldSeed(type) {
    if (this.config.specific && this.config.specific.length > 0) {
      return this.config.specific.includes(type);
    }
    return this.getQuantity(type) > 0;
  }

  async verifyEnvironment(client) {
    if (this.config.environment === 'production' && !this.config.force) {
      const result = await client.query('SELECT COUNT(*) FROM users');
      const count = parseInt(result.rows[0].count);
      
      if (count > 0) {
        throw new Error('Production database already contains data. Use --force to override.');
      }
    }
  }

  printStatistics() {
    console.log(chalk.cyan('\n📊 Seed Statistics:'));
    console.log(chalk.gray('─'.repeat(40)));
    
    let total = 0;
    this.statistics.forEach((count, table) => {
      console.log(chalk.green(`✓ ${table}:`), chalk.yellow(count.toLocaleString()), 'records');
      total += count;
    });
    
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.blue('Total:'), chalk.yellow(total.toLocaleString()), 'records');
    console.log(chalk.gray('─'.repeat(40)));
  }

  async cleanup() {
    await this.pool.end();
  }
}

export default DataSeeder;