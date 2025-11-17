/**
 * データベース接続モジュール
 * PostgreSQL接続とクエリ実行のユーティリティ
 */

import pkg from 'pg';
const { Pool } = pkg;
import config from './config.js';

/**
 * 環境に応じたデータベースURLの取得
 */
const getDatabaseUrl = () => {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return process.env.DATABASE_URL;
    case 'test':
      return process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    default: // development
      return process.env.DEV_DATABASE_URL || process.env.DATABASE_URL;
  }
};

/**
 * PostgreSQL接続プールの設定
 */
const poolConfig = {
  connectionString: getDatabaseUrl(),
  max: 20, // 最大接続数
  idleTimeoutMillis: 30000, // アイドル接続のタイムアウト（30秒）
  connectionTimeoutMillis: 2000, // 接続タイムアウト（2秒）
  statement_timeout: 30000, // クエリタイムアウト（30秒）
};

// 本番環境の場合、SSL接続を設定
if (config.isProduction) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

/**
 * データベース接続プール
 */
let pool = null;

/**
 * プールの初期化
 */
export const initializePool = () => {
  if (!pool) {
    pool = new Pool(poolConfig);
    
    // エラーイベントのハンドリング
    pool.on('error', (err, client) => {
      console.error('Unexpected database error on idle client', err);
    });
    
    // 接続イベントのログ
    pool.on('connect', () => {
      console.log('Database client connected');
    });
    
    // 削除イベントのログ
    pool.on('remove', () => {
      console.log('Database client removed');
    });
  }
  
  return pool;
};

/**
 * クエリ実行関数
 * @param {string} text - SQLクエリ文字列
 * @param {Array} params - クエリパラメータ
 * @returns {Promise<Object>} クエリ結果
 */
export const query = async (text, params = []) => {
  const start = Date.now();
  
  try {
    // プールが初期化されていない場合は初期化
    if (!pool) {
      initializePool();
    }
    
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // デバッグログ（本番環境では制限）
    if (!config.isProduction || duration > 1000) {
      console.log('Executed query', {
        text: text.substring(0, 100), // 最初の100文字のみログ
        duration,
        rows: res.rowCount
      });
    }
    
    return res;
  } catch (error) {
    const duration = Date.now() - start;
    console.error('Query error', {
      text: text.substring(0, 100),
      duration,
      error: error.message,
      code: error.code
    });
    throw error;
  }
};

/**
 * トランザクション実行関数
 * @param {Function} callback - トランザクション内で実行する関数
 * @returns {Promise<*>} トランザクション結果
 */
export const transaction = async (callback) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * データベース接続のテスト
 * @returns {Promise<boolean>} 接続成功時true
 */
export const testConnection = async () => {
  try {
    const result = await query('SELECT NOW() as current_time');
    console.log('Database connected successfully at:', result.rows[0].current_time);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    return false;
  }
};

/**
 * プールの終了
 */
export const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database pool closed');
  }
};

/**
 * ヘルパー関数: 単一行の取得
 */
export const getOne = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

/**
 * ヘルパー関数: 複数行の取得
 */
export const getMany = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

/**
 * ヘルパー関数: 挿入と結果の取得
 */
export const insert = async (table, data) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  
  const text = `
    INSERT INTO ${table} (${keys.join(', ')})
    VALUES (${placeholders})
    RETURNING *
  `;
  
  const result = await query(text, values);
  return result.rows[0];
};

/**
 * ヘルパー関数: 更新と結果の取得
 */
export const update = async (table, data, condition, conditionParams = []) => {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
  
  const text = `
    UPDATE ${table}
    SET ${setClause}
    WHERE ${condition}
    RETURNING *
  `;
  
  const result = await query(text, [...values, ...conditionParams]);
  return result.rows;
};

/**
 * ヘルパー関数: 削除
 */
export const remove = async (table, condition, params = []) => {
  const text = `DELETE FROM ${table} WHERE ${condition} RETURNING *`;
  const result = await query(text, params);
  return result.rows;
};

/**
 * ヘルパー関数: カウント
 */
export const count = async (table, condition = '1=1', params = []) => {
  const text = `SELECT COUNT(*) as count FROM ${table} WHERE ${condition}`;
  const result = await query(text, params);
  return parseInt(result.rows[0].count, 10);
};

/**
 * ヘルパー関数: 存在確認
 */
export const exists = async (table, condition, params = []) => {
  const text = `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${condition}) as exists`;
  const result = await query(text, params);
  return result.rows[0].exists;
};

// デフォルトエクスポート
export default {
  initializePool,
  query,
  transaction,
  testConnection,
  closePool,
  getOne,
  getMany,
  insert,
  update,
  remove,
  count,
  exists
};