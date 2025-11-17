/**
 * Supabase Data Migration System
 * Migrates localStorage data to Supabase with validation, batching, and error recovery
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import pLimit from 'p-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

// Data validation schemas
const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['customer', 'staff', 'admin', 'super_admin']).optional(),
  name: z.string(),
  phone: z.string().optional(),
  address: z.string().optional(),
  postalCode: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

const ProductSchema = z.object({
  name: z.string(),
  category: z.string(),
  model: z.string().optional(),
  manufacturer: z.string().optional(),
  condition: z.enum(['S', 'A', 'B', 'C', 'D']).optional(),
  purchasePrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  quantity: z.number().min(0),
  zaicoId: z.string().optional(),
  zaicoData: z.record(z.unknown()).optional()
});

export class SupabaseMigrator {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
    );

    // Admin client for RLS bypass
    this.adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    this.stats = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0
    };
    
    this.errors = [];
  }

  async migrateFromLocalStorage(data, options = {}) {
    const {
      batchSize = 100,
      concurrency = 5,
      dryRun = false,
      continueOnError = true,
      validateOnly = false
    } = options;

    console.log(chalk.blue('🚀 Starting Supabase migration...'));
    console.log(chalk.gray(`Options: ${JSON.stringify(options)}`));

    const limit = pLimit(concurrency);
    const startTime = Date.now();

    try {
      // 1. Data validation phase
      console.log(chalk.yellow('\n📋 Phase 1: Data Validation'));
      const validationResults = await this.validateData(data);
      
      if (validationResults.errors.length > 0 && !continueOnError) {
        console.log(chalk.red('❌ Validation failed. Aborting migration.'));
        this.printValidationErrors(validationResults.errors);
        return;
      }

      if (validateOnly) {
        console.log(chalk.green('✓ Validation complete'));
        return;
      }

      if (dryRun) {
        console.log(chalk.yellow('🏃 DRY RUN MODE - No data will be modified'));
      }

      // 2. User migration
      console.log(chalk.yellow('\n📋 Phase 2: User Migration'));
      if (data.users) {
        await this.migrateUsers(data.users, { batchSize, limit, dryRun, continueOnError });
      }

      // 3. Product migration
      console.log(chalk.yellow('\n📋 Phase 3: Product Migration'));
      if (data.inventory) {
        await this.migrateProducts(data.inventory, { batchSize, limit, dryRun });
      }

      // 4. Buyback requests migration
      console.log(chalk.yellow('\n📋 Phase 4: Buyback Request Migration'));
      if (data.buybackRequests) {
        await this.migrateBuybackRequests(data.buybackRequests, { batchSize, limit, dryRun });
      }

      // 5. Sales data migration
      console.log(chalk.yellow('\n📋 Phase 5: Sales Data Migration'));
      if (data.salesData) {
        await this.migrateSalesData(data.salesData, { batchSize, limit, dryRun });
      }

      // 6. Antiquities ledger migration
      console.log(chalk.yellow('\n📋 Phase 6: Antiquities Ledger Migration'));
      if (data.antiquitiesLedger) {
        await this.migrateAntiquitiesLedger(data.antiquitiesLedger, { batchSize, limit, dryRun });
      }

      const duration = Date.now() - startTime;
      this.printMigrationSummary(duration);

    } catch (error) {
      console.error(chalk.red('Fatal migration error:'), error);
      throw error;
    }
  }

  async migrateUsers(users, options) {
    const batches = this.createBatches(users, options.batchSize);
    
    for (const [index, batch] of batches.entries()) {
      console.log(chalk.gray(`Processing user batch ${index + 1}/${batches.length}`));
      
      await Promise.all(
        batch.map((user) => 
          options.limit(async () => {
            try {
              this.stats.processed++;

              // Data validation
              const validated = UserSchema.parse(user);

              if (options.dryRun) {
                console.log(chalk.gray(`[DRY] Would migrate user: ${validated.email}`));
                this.stats.succeeded++;
                return;
              }

              // Check if user already exists
              const { data: existingUser } = await this.supabase
                .from('users')
                .select('id')
                .eq('email', validated.email)
                .single();

              if (existingUser) {
                console.log(chalk.yellow(`⊘ User already exists: ${validated.email}`));
                this.stats.skipped++;
                return;
              }

              // Hash password
              const passwordHash = await bcrypt.hash(validated.password, 12);

              // Insert user into users table
              const { data: userData, error: userError } = await this.supabase
                .from('users')
                .insert({
                  email: validated.email,
                  password_hash: passwordHash,
                  name: validated.name,
                  role: validated.role || 'customer',
                  phone: validated.phone,
                  address: validated.address,
                  postal_code: validated.postalCode,
                  email_verified: true,
                  metadata: validated.metadata || {}
                })
                .select()
                .single();

              if (userError) throw userError;

              this.stats.succeeded++;
              console.log(chalk.green(`✓ User migrated: ${validated.email}`));

            } catch (error) {
              this.stats.failed++;
              this.errors.push({
                entity: 'user',
                error: error.message,
                data: user.email
              });
              console.error(chalk.red(`✗ Failed to migrate user: ${user.email}`), error.message);
              
              if (!options.continueOnError) throw error;
            }
          })
        )
      );
    }
  }

  async migrateProducts(products, options) {
    const batches = this.createBatches(products, options.batchSize);
    
    for (const [index, batch] of batches.entries()) {
      console.log(chalk.gray(`Processing product batch ${index + 1}/${batches.length}`));
      
      if (options.dryRun) {
        console.log(chalk.gray(`[DRY] Would insert ${batch.length} products`));
        this.stats.succeeded += batch.length;
        continue;
      }

      const transformedProducts = batch.map(product => ({
        sku: `SKU-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: product.name,
        category_id: this.getCategoryId(product.category),
        manufacturer_id: this.getManufacturerId(product.manufacturer),
        model: product.model || '',
        description: product.description || '',
        condition_grade: product.condition || 'B',
        purchase_price: product.purchasePrice || 0,
        selling_price: product.sellingPrice || 0,
        stock_quantity: product.quantity || 0,
        status: product.status || 'active',
        zaico_item_id: product.zaicoId,
        zaico_data: product.zaicoData || {},
        images: product.images || [],
        barcode: product.barcode,
        location: product.location,
        notes: product.notes
      }));

      const { data, error } = await this.supabase
        .from('products')
        .insert(transformedProducts)
        .select();

      if (error) {
        this.stats.failed += batch.length;
        console.error(chalk.red(`✗ Failed to insert product batch`), error);
      } else {
        this.stats.succeeded += data.length;
        console.log(chalk.green(`✓ Inserted ${data.length} products`));
      }
    }
  }

  async migrateBuybackRequests(requests, options) {
    const transformedRequests = requests.map(request => ({
      customer_name: request.customerName,
      email: request.email,
      phone: request.phone,
      address: request.address,
      postal_code: request.postalCode,
      items: request.items || [],
      estimated_value: request.estimatedValue || 0,
      status: request.status || 'pending',
      notes: request.notes,
      appraisal_date: request.appraisalDate,
      appraised_by: request.appraisedBy,
      final_value: request.finalValue
    }));

    if (options.dryRun) {
      console.log(chalk.gray(`[DRY] Would insert ${transformedRequests.length} buyback requests`));
      this.stats.succeeded += transformedRequests.length;
      return;
    }

    const { data, error } = await this.supabase
      .from('buyback_applications')
      .insert(transformedRequests)
      .select();

    if (error) {
      this.stats.failed += requests.length;
      console.error(chalk.red('✗ Failed to insert buyback requests'), error);
    } else {
      this.stats.succeeded += data.length;
      console.log(chalk.green(`✓ Inserted ${data.length} buyback requests`));
    }
  }

  async migrateSalesData(sales, options) {
    const transformedSales = sales.map(sale => ({
      order_number: sale.orderNumber || `ORD-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      customer_id: sale.customerId,
      status: sale.status || 'completed',
      subtotal: sale.subtotal || sale.totalAmount || 0,
      tax_amount: sale.taxAmount || Math.floor((sale.totalAmount || 0) * 0.1),
      shipping_fee: sale.shippingFee || 0,
      total_amount: sale.totalAmount,
      payment_method: sale.paymentMethod || 'cash',
      notes: sale.notes,
      ordered_at: sale.orderedAt || new Date()
    }));

    if (options.dryRun) {
      console.log(chalk.gray(`[DRY] Would insert ${transformedSales.length} sales`));
      this.stats.succeeded += transformedSales.length;
      return;
    }

    const { data, error } = await this.supabase
      .from('sales_orders')
      .insert(transformedSales)
      .select();

    if (error) {
      this.stats.failed += sales.length;
      console.error(chalk.red('✗ Failed to insert sales'), error);
    } else {
      this.stats.succeeded += data.length;
      console.log(chalk.green(`✓ Inserted ${data.length} sales`));
    }
  }

  async migrateAntiquitiesLedger(entries, options) {
    const transformedEntries = entries.map(entry => ({
      entry_number: entry.entryNumber || `ENT-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      transaction_date: entry.date || new Date(),
      transaction_type: entry.type,
      item_name: entry.itemName,
      item_description: entry.description,
      customer_name: entry.customerName,
      customer_address: entry.customerAddress,
      customer_id_type: entry.idType,
      customer_id_number: entry.idNumber,
      price: entry.price,
      notes: entry.notes
    }));

    if (options.dryRun) {
      console.log(chalk.gray(`[DRY] Would insert ${transformedEntries.length} ledger entries`));
      this.stats.succeeded += transformedEntries.length;
      return;
    }

    const { data, error } = await this.supabase
      .from('antiquities_ledger')
      .insert(transformedEntries)
      .select();

    if (error) {
      this.stats.failed += entries.length;
      console.error(chalk.red('✗ Failed to insert ledger entries'), error);
    } else {
      this.stats.succeeded += data.length;
      console.log(chalk.green(`✓ Inserted ${data.length} ledger entries`));
    }
  }

  async validateData(data) {
    const errors = [];

    if (data.users) {
      for (const user of data.users) {
        try {
          UserSchema.parse(user);
        } catch (error) {
          errors.push({ type: 'user', email: user.email, error });
        }
      }
    }

    if (data.inventory) {
      for (const product of data.inventory) {
        try {
          ProductSchema.parse(product);
        } catch (error) {
          errors.push({ type: 'product', name: product.name, error });
        }
      }
    }

    return { errors };
  }

  getCategoryId(categoryName) {
    const categoryMap = {
      'consoles': 1,
      'games': 2,
      'accessories': 3,
      'retro': 4,
      'other': 5
    };
    return categoryMap[categoryName?.toLowerCase()] || 5;
  }

  getManufacturerId(manufacturerName) {
    const manufacturerMap = {
      'nintendo': 1,
      'sony': 2,
      'microsoft': 3,
      'sega': 4,
      'other': 5
    };
    return manufacturerMap[manufacturerName?.toLowerCase()] || 5;
  }

  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  printValidationErrors(errors) {
    console.log(chalk.red('\nValidation Errors:'));
    errors.forEach((err, i) => {
      console.log(chalk.red(`${i + 1}. ${err.type}: ${err.email || err.name}`));
      console.log(chalk.gray(`   ${err.error.message}`));
    });
  }

  printMigrationSummary(duration) {
    console.log(chalk.blue('\n═══════════════════════════════════'));
    console.log(chalk.blue('       Migration Summary           '));
    console.log(chalk.blue('═══════════════════════════════════'));
    console.log(chalk.green(`✓ Succeeded: ${this.stats.succeeded}`));
    console.log(chalk.red(`✗ Failed: ${this.stats.failed}`));
    console.log(chalk.yellow(`⊘ Skipped: ${this.stats.skipped}`));
    console.log(chalk.gray(`Total processed: ${this.stats.processed}`));
    console.log(chalk.gray(`Duration: ${(duration / 1000).toFixed(2)}s`));
    
    if (this.errors.length > 0) {
      console.log(chalk.red(`\nErrors encountered: ${this.errors.length}`));
      console.log(chalk.gray('Run with --verbose to see detailed errors'));
    }
  }
}

export default SupabaseMigrator;