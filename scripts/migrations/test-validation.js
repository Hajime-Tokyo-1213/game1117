#!/usr/bin/env node

/**
 * Standalone Validation Test
 * Tests the migration validation logic without requiring Supabase connection
 */

import fs from 'fs/promises';
import { z } from 'zod';
import chalk from 'chalk';

// Data validation schemas (copied from SupabaseMigrator)
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

async function validateData(data) {
  const errors = [];
  let validCount = 0;
  let totalCount = 0;

  console.log(chalk.blue('🔍 Starting validation...'));

  // Validate users
  if (data.users && Array.isArray(data.users)) {
    console.log(chalk.yellow(`\nValidating ${data.users.length} users...`));
    for (const [index, user] of data.users.entries()) {
      totalCount++;
      try {
        UserSchema.parse(user);
        validCount++;
        console.log(chalk.green(`✓ User ${index + 1}: ${user.email}`));
      } catch (error) {
        errors.push({ 
          type: 'user', 
          index,
          email: user.email, 
          error: error.errors[0]?.message || error.message 
        });
        console.log(chalk.red(`✗ User ${index + 1}: ${user.email} - ${error.errors[0]?.message || error.message}`));
      }
    }
  }

  // Validate inventory/products
  if (data.inventory && Array.isArray(data.inventory)) {
    console.log(chalk.yellow(`\nValidating ${data.inventory.length} products...`));
    for (const [index, product] of data.inventory.entries()) {
      totalCount++;
      try {
        ProductSchema.parse(product);
        validCount++;
        console.log(chalk.green(`✓ Product ${index + 1}: ${product.name}`));
      } catch (error) {
        errors.push({ 
          type: 'product', 
          index,
          name: product.name, 
          error: error.errors[0]?.message || error.message 
        });
        console.log(chalk.red(`✗ Product ${index + 1}: ${product.name} - ${error.errors[0]?.message || error.message}`));
      }
    }
  }

  // Validate other data types (basic structure checks)
  const dataTypes = ['buybackRequests', 'salesData', 'antiquitiesLedger'];
  for (const dataType of dataTypes) {
    if (data[dataType]) {
      if (Array.isArray(data[dataType])) {
        console.log(chalk.green(`✓ ${dataType}: Array with ${data[dataType].length} items`));
      } else {
        console.log(chalk.yellow(`⚠ ${dataType}: Not an array (${typeof data[dataType]})`));
      }
    }
  }

  return { errors, validCount, totalCount };
}

async function main() {
  try {
    console.log(chalk.blue('📋 Migration Validation Test'));
    console.log(chalk.gray('=' .repeat(50)));

    // Load test data
    const filePath = './localStorage-export.json';
    console.log(`Loading data from ${filePath}...`);
    
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Display data overview
    console.log(chalk.cyan('\n📊 Data Overview:'));
    console.log(`Users: ${data.users?.length || 0}`);
    console.log(`Products: ${data.inventory?.length || 0}`);
    console.log(`Buyback Requests: ${data.buybackRequests?.length || 0}`);
    console.log(`Sales Data: ${data.salesData?.length || 0}`);
    console.log(`Antiquities Ledger: ${data.antiquitiesLedger?.length || 0}`);

    // Run validation
    const { errors, validCount, totalCount } = await validateData(data);

    // Print summary
    console.log(chalk.blue('\n' + '=' .repeat(50)));
    console.log(chalk.blue('📋 Validation Summary'));
    console.log(chalk.blue('=' .repeat(50)));
    
    if (errors.length === 0) {
      console.log(chalk.green('🎉 All data is valid!'));
    } else {
      console.log(chalk.red(`❌ Found ${errors.length} validation errors:`));
      errors.forEach((err, i) => {
        console.log(chalk.red(`${i + 1}. ${err.type} (${err.email || err.name}): ${err.error}`));
      });
    }

    console.log(chalk.gray(`\nValid items: ${validCount}/${totalCount}`));
    console.log(chalk.gray(`Success rate: ${totalCount > 0 ? ((validCount / totalCount) * 100).toFixed(1) : 0}%`));

    // Test dry-run simulation
    console.log(chalk.yellow('\n🏃 Dry-run Simulation:'));
    console.log(chalk.gray('[DRY] Migration would process the following:'));
    if (data.users) console.log(chalk.gray(`[DRY] - ${data.users.length} users`));
    if (data.inventory) console.log(chalk.gray(`[DRY] - ${data.inventory.length} products`));
    if (data.buybackRequests) console.log(chalk.gray(`[DRY] - ${data.buybackRequests.length} buyback requests`));
    if (data.salesData) console.log(chalk.gray(`[DRY] - ${data.salesData.length} sales records`));
    if (data.antiquitiesLedger) console.log(chalk.gray(`[DRY] - ${data.antiquitiesLedger.length} ledger entries`));
    console.log(chalk.yellow('✓ Dry-run completed (no actual changes made)'));

    process.exit(errors.length > 0 ? 1 : 0);

  } catch (error) {
    console.error(chalk.red('❌ Validation test failed:'), error.message);
    process.exit(1);
  }
}

main();