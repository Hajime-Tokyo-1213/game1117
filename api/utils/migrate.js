/**
 * データベースマイグレーションユーティリティ
 * スキーマのバージョン管理と移行を処理
 */

import db from './database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * マイグレーションテーブルの作成
 */
const createMigrationTable = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  try {
    await db.query(sql);
    console.log('Migration table created or already exists');
  } catch (error) {
    console.error('Failed to create migration table:', error);
    throw error;
  }
};

/**
 * 実行済みマイグレーションの取得
 */
const getExecutedMigrations = async () => {
  const sql = 'SELECT filename FROM migrations ORDER BY id';
  const result = await db.query(sql);
  return result.rows.map(row => row.filename);
};

/**
 * マイグレーションファイルの取得
 */
const getMigrationFiles = () => {
  const migrationsPath = path.join(__dirname, '..', 'migrations');
  
  // migrationsディレクトリが存在しない場合は作成
  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath, { recursive: true });
    console.log('Created migrations directory');
    return [];
  }
  
  const files = fs.readdirSync(migrationsPath)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  return files;
};

/**
 * マイグレーションの実行
 */
const executeMigration = async (filename) => {
  const filepath = path.join(__dirname, '..', 'migrations', filename);
  const sql = fs.readFileSync(filepath, 'utf8');
  
  const client = await db.initializePool().connect();
  
  try {
    await client.query('BEGIN');
    
    // マイグレーションSQLを実行
    await client.query(sql);
    
    // マイグレーション記録を追加
    await client.query(
      'INSERT INTO migrations (filename) VALUES ($1)',
      [filename]
    );
    
    await client.query('COMMIT');
    console.log(`✅ Migration executed: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Migration failed: ${filename}`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * ロールバック用のマイグレーション削除
 */
const rollbackMigration = async (filename) => {
  const downFilepath = path.join(__dirname, '..', 'migrations', filename.replace('.sql', '.down.sql'));
  
  if (!fs.existsSync(downFilepath)) {
    throw new Error(`Rollback file not found: ${downFilepath}`);
  }
  
  const sql = fs.readFileSync(downFilepath, 'utf8');
  const client = await db.initializePool().connect();
  
  try {
    await client.query('BEGIN');
    
    // ロールバックSQLを実行
    await client.query(sql);
    
    // マイグレーション記録を削除
    await client.query(
      'DELETE FROM migrations WHERE filename = $1',
      [filename]
    );
    
    await client.query('COMMIT');
    console.log(`✅ Rollback executed: ${filename}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Rollback failed: ${filename}`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * マイグレーションの実行（upコマンド）
 */
export const up = async () => {
  try {
    // データベース接続テスト
    const connected = await db.testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }
    
    // マイグレーションテーブルを作成
    await createMigrationTable();
    
    // 実行済みのマイグレーションを取得
    const executed = await getExecutedMigrations();
    
    // すべてのマイグレーションファイルを取得
    const files = getMigrationFiles();
    
    // 未実行のマイグレーションをフィルタ
    const pending = files.filter(file => !executed.includes(file));
    
    if (pending.length === 0) {
      console.log('No pending migrations');
      return;
    }
    
    console.log(`Found ${pending.length} pending migrations`);
    
    // 未実行のマイグレーションを順番に実行
    for (const file of pending) {
      await executeMigration(file);
    }
    
    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.closePool();
  }
};

/**
 * 最新のマイグレーションをロールバック（downコマンド）
 */
export const down = async () => {
  try {
    // データベース接続テスト
    const connected = await db.testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }
    
    // 実行済みのマイグレーションを取得
    const executed = await getExecutedMigrations();
    
    if (executed.length === 0) {
      console.log('No migrations to rollback');
      return;
    }
    
    // 最新のマイグレーションをロールバック
    const latest = executed[executed.length - 1];
    await rollbackMigration(latest);
    
    console.log('Rollback completed successfully');
  } catch (error) {
    console.error('Rollback failed:', error);
    process.exit(1);
  } finally {
    await db.closePool();
  }
};

/**
 * マイグレーションステータスの表示
 */
export const status = async () => {
  try {
    // データベース接続テスト
    const connected = await db.testConnection();
    if (!connected) {
      console.log('Database connection failed - no migrations executed');
      return;
    }
    
    // マイグレーションテーブルの存在確認
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'migrations'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('Migration table does not exist - no migrations executed');
      return;
    }
    
    // 実行済みのマイグレーションを取得
    const executed = await getExecutedMigrations();
    
    // すべてのマイグレーションファイルを取得
    const files = getMigrationFiles();
    
    console.log('\nMigration Status:');
    console.log('=================');
    
    files.forEach(file => {
      const isExecuted = executed.includes(file);
      const status = isExecuted ? '✅ Executed' : '⏳ Pending';
      console.log(`${status} - ${file}`);
    });
    
    console.log('\nSummary:');
    console.log(`Total: ${files.length}`);
    console.log(`Executed: ${executed.length}`);
    console.log(`Pending: ${files.length - executed.length}`);
  } catch (error) {
    console.error('Failed to get migration status:', error);
    process.exit(1);
  } finally {
    await db.closePool();
  }
};

/**
 * CLIコマンド実行
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  
  switch (command) {
    case 'up':
      up();
      break;
    case 'down':
      down();
      break;
    case 'status':
      status();
      break;
    default:
      console.log('Usage: node migrate.js [up|down|status]');
      process.exit(1);
  }
}

export default {
  up,
  down,
  status
};