/**
 * Migration Generator
 * Creates new migration and rollback files with proper naming and templates
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { format } from 'date-fns';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MigrationGenerator {
  constructor() {
    this.templatesDir = path.join(__dirname, 'templates');
    this.sqlDir = path.join(__dirname, 'sql');
    this.rollbackDir = path.join(__dirname, 'rollback');
  }

  /**
   * Create a new migration file
   */
  async create(name, options = {}) {
    if (!name) {
      throw new Error('Migration name is required');
    }

    // Ensure directories exist
    await this.ensureDirectories();

    // Generate version and filename
    const timestamp = format(new Date(), 'yyyyMMddHHmmss');
    const version = timestamp;
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filename = `${version}_${safeName}.sql`;
    const rollbackFilename = `${version}_${safeName}.down.sql`;

    // Get template content
    const template = await this.getTemplate(options.type || 'default');
    const rollbackTemplate = await this.getRollbackTemplate(options.type || 'default');

    // Replace placeholders
    const migrationContent = this.replacePlaceholders(template, {
      name,
      version,
      author: process.env.USER || 'Unknown',
      date: new Date().toISOString(),
      description: options.description || '',
      rollbackFile: rollbackFilename
    });

    const rollbackContent = this.replacePlaceholders(rollbackTemplate, {
      name,
      version,
      author: process.env.USER || 'Unknown',
      date: new Date().toISOString(),
      migrationFile: filename
    });

    // Write files
    const migrationPath = path.join(this.sqlDir, filename);
    const rollbackPath = path.join(this.rollbackDir, rollbackFilename);

    await fs.writeFile(migrationPath, migrationContent, 'utf8');
    await fs.writeFile(rollbackPath, rollbackContent, 'utf8');

    console.log(chalk.green(`✓ Created migration: ${filename}`));
    console.log(chalk.green(`✓ Created rollback: ${rollbackFilename}`));

    return {
      migration: migrationPath,
      rollback: rollbackPath,
      version,
      filename
    };
  }

  /**
   * Generate migration from schema differences
   */
  async generateFromDiff(sourceSchema, targetSchema) {
    const differences = await this.compareSchemas(sourceSchema, targetSchema);
    
    if (differences.length === 0) {
      console.log(chalk.yellow('No schema differences found'));
      return null;
    }

    const migrationStatements = [];
    const rollbackStatements = [];

    for (const diff of differences) {
      switch (diff.type) {
        case 'CREATE_TABLE':
          migrationStatements.push(this.generateCreateTable(diff.table));
          rollbackStatements.push(`DROP TABLE IF EXISTS ${diff.table.name} CASCADE;`);
          break;
          
        case 'DROP_TABLE':
          migrationStatements.push(`DROP TABLE IF EXISTS ${diff.table.name} CASCADE;`);
          rollbackStatements.push(this.generateCreateTable(diff.table));
          break;
          
        case 'ADD_COLUMN':
          migrationStatements.push(
            `ALTER TABLE ${diff.table} ADD COLUMN ${this.generateColumnDefinition(diff.column)};`
          );
          rollbackStatements.push(
            `ALTER TABLE ${diff.table} DROP COLUMN IF EXISTS ${diff.column.name} CASCADE;`
          );
          break;
          
        case 'DROP_COLUMN':
          migrationStatements.push(
            `ALTER TABLE ${diff.table} DROP COLUMN IF EXISTS ${diff.column.name} CASCADE;`
          );
          rollbackStatements.push(
            `ALTER TABLE ${diff.table} ADD COLUMN ${this.generateColumnDefinition(diff.column)};`
          );
          break;
          
        case 'MODIFY_COLUMN':
          migrationStatements.push(
            `ALTER TABLE ${diff.table} ALTER COLUMN ${diff.column.name} ${diff.changes};`
          );
          rollbackStatements.push(
            `ALTER TABLE ${diff.table} ALTER COLUMN ${diff.column.name} ${diff.original};`
          );
          break;
          
        case 'CREATE_INDEX':
          migrationStatements.push(this.generateCreateIndex(diff.index));
          rollbackStatements.push(`DROP INDEX IF EXISTS ${diff.index.name};`);
          break;
          
        case 'DROP_INDEX':
          migrationStatements.push(`DROP INDEX IF EXISTS ${diff.index.name};`);
          rollbackStatements.push(this.generateCreateIndex(diff.index));
          break;
      }
    }

    const name = `auto_generated_diff_${format(new Date(), 'yyyyMMdd')}`;
    const migration = await this.create(name, {
      description: 'Auto-generated from schema differences'
    });

    // Update files with generated statements
    const migrationPath = migration.migration;
    const rollbackPath = migration.rollback;

    const migrationContent = await fs.readFile(migrationPath, 'utf8');
    const rollbackContent = await fs.readFile(rollbackPath, 'utf8');

    const updatedMigration = migrationContent.replace(
      '-- Write your migration SQL here',
      migrationStatements.join('\n')
    );

    const updatedRollback = rollbackContent.replace(
      '-- Write your rollback SQL here',
      rollbackStatements.join('\n')
    );

    await fs.writeFile(migrationPath, updatedMigration, 'utf8');
    await fs.writeFile(rollbackPath, updatedRollback, 'utf8');

    console.log(chalk.green(`✓ Generated migration from schema differences`));
    return migration;
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    await fs.mkdir(this.sqlDir, { recursive: true });
    await fs.mkdir(this.rollbackDir, { recursive: true });
    await fs.mkdir(this.templatesDir, { recursive: true });
  }

  /**
   * Get migration template
   */
  async getTemplate(type) {
    const customTemplatePath = path.join(this.templatesDir, `${type}.sql`);
    
    try {
      return await fs.readFile(customTemplatePath, 'utf8');
    } catch {
      // Return default template
      return `-- Migration: {{name}}
-- Version: {{version}}
-- Author: {{author}}
-- Date: {{date}}
-- Description: {{description}}
-- Rollback: rollback/{{rollbackFile}}

BEGIN;

-- Write your migration SQL here

COMMIT;
`;
    }
  }

  /**
   * Get rollback template
   */
  async getRollbackTemplate(type) {
    const customTemplatePath = path.join(this.templatesDir, `${type}.down.sql`);
    
    try {
      return await fs.readFile(customTemplatePath, 'utf8');
    } catch {
      // Return default rollback template
      return `-- Rollback for: {{name}}
-- Version: {{version}}
-- Author: {{author}}
-- Date: {{date}}
-- Migration: sql/{{migrationFile}}

BEGIN;

-- Write your rollback SQL here

COMMIT;
`;
    }
  }

  /**
   * Replace template placeholders
   */
  replacePlaceholders(template, values) {
    let result = template;
    
    for (const [key, value] of Object.entries(values)) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(placeholder, value);
    }
    
    return result;
  }

  /**
   * Compare schemas for differences
   */
  async compareSchemas(sourceSchema, targetSchema) {
    const differences = [];
    
    // Compare tables
    for (const tableName in targetSchema.tables) {
      if (!sourceSchema.tables[tableName]) {
        differences.push({
          type: 'CREATE_TABLE',
          table: targetSchema.tables[tableName]
        });
      } else {
        // Compare columns
        const sourceTable = sourceSchema.tables[tableName];
        const targetTable = targetSchema.tables[tableName];
        
        for (const columnName in targetTable.columns) {
          if (!sourceTable.columns[columnName]) {
            differences.push({
              type: 'ADD_COLUMN',
              table: tableName,
              column: targetTable.columns[columnName]
            });
          } else if (JSON.stringify(sourceTable.columns[columnName]) !== 
                     JSON.stringify(targetTable.columns[columnName])) {
            differences.push({
              type: 'MODIFY_COLUMN',
              table: tableName,
              column: targetTable.columns[columnName],
              original: sourceTable.columns[columnName]
            });
          }
        }
        
        for (const columnName in sourceTable.columns) {
          if (!targetTable.columns[columnName]) {
            differences.push({
              type: 'DROP_COLUMN',
              table: tableName,
              column: sourceTable.columns[columnName]
            });
          }
        }
      }
    }
    
    for (const tableName in sourceSchema.tables) {
      if (!targetSchema.tables[tableName]) {
        differences.push({
          type: 'DROP_TABLE',
          table: sourceSchema.tables[tableName]
        });
      }
    }
    
    // Compare indexes
    for (const indexName in targetSchema.indexes) {
      if (!sourceSchema.indexes[indexName]) {
        differences.push({
          type: 'CREATE_INDEX',
          index: targetSchema.indexes[indexName]
        });
      }
    }
    
    for (const indexName in sourceSchema.indexes) {
      if (!targetSchema.indexes[indexName]) {
        differences.push({
          type: 'DROP_INDEX',
          index: sourceSchema.indexes[indexName]
        });
      }
    }
    
    return differences;
  }

  /**
   * Generate CREATE TABLE statement
   */
  generateCreateTable(table) {
    const columns = Object.entries(table.columns)
      .map(([name, def]) => `  ${this.generateColumnDefinition({ name, ...def })}`)
      .join(',\n');
    
    const constraints = table.constraints
      ? ',\n' + table.constraints.map(c => `  ${c}`).join(',\n')
      : '';
    
    return `CREATE TABLE IF NOT EXISTS ${table.name} (
${columns}${constraints}
);`;
  }

  /**
   * Generate column definition
   */
  generateColumnDefinition(column) {
    let definition = `${column.name} ${column.type}`;
    
    if (column.default !== undefined) {
      definition += ` DEFAULT ${column.default}`;
    }
    
    if (column.nullable === false) {
      definition += ` NOT NULL`;
    }
    
    if (column.unique) {
      definition += ` UNIQUE`;
    }
    
    if (column.primaryKey) {
      definition += ` PRIMARY KEY`;
    }
    
    if (column.references) {
      definition += ` REFERENCES ${column.references}`;
    }
    
    return definition;
  }

  /**
   * Generate CREATE INDEX statement
   */
  generateCreateIndex(index) {
    const unique = index.unique ? 'UNIQUE ' : '';
    const method = index.method ? `USING ${index.method} ` : '';
    
    return `CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${index.table} ${method}(${index.columns.join(', ')});`;
  }

  /**
   * List available templates
   */
  async listTemplates() {
    try {
      const files = await fs.readdir(this.templatesDir);
      const templates = files
        .filter(f => f.endsWith('.sql') && !f.includes('.down.'))
        .map(f => f.replace('.sql', ''));
      
      if (templates.length === 0) {
        console.log(chalk.yellow('No custom templates found. Using default template.'));
        return ['default'];
      }
      
      return templates;
    } catch {
      return ['default'];
    }
  }
}

export default MigrationGenerator;