/**
 * データベースヘルスチェックAPI
 * データベース接続の健全性を監視
 */

import { corsMiddleware, loggingMiddleware, errorHandler } from '../utils/middleware.js';
import { sendSuccess, sendError, HTTP_STATUS, ERROR_CODES } from '../utils/response.js';
import db from '../utils/database.js';

/**
 * データベースヘルスチェック
 * GET /api/health/database
 */
const databaseHealthHandler = async (req, res) => {
  const healthData = {
    status: 'unknown',
    responseTime: null,
    poolInfo: null,
    timestamp: new Date().toISOString(),
    details: {}
  };

  const startTime = Date.now();

  try {
    // 基本的な接続テスト
    const result = await db.query('SELECT NOW() as current_time, version() as db_version');
    const responseTime = Date.now() - startTime;
    
    if (!result || !result.rows || result.rows.length === 0) {
      throw new Error('Invalid database response');
    }

    // プール情報の取得
    const pool = db.initializePool();
    const poolInfo = {
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingConnections: pool.waitingCount
    };

    // テーブル存在確認（例: migrationsテーブル）
    const tableCheck = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      LIMIT 5
    `);

    // 詳細情報
    healthData.details = {
      currentTime: result.rows[0].current_time,
      databaseVersion: result.rows[0].db_version,
      tablesFound: tableCheck.rowCount,
      sampleTables: tableCheck.rows.map(r => r.table_name)
    };

    // ステータスの判定
    healthData.status = responseTime < 1000 ? 'healthy' : 'degraded';
    healthData.responseTime = `${responseTime}ms`;
    healthData.poolInfo = poolInfo;

    // 成功レスポンス
    return sendSuccess(
      res,
      healthData,
      `Database is ${healthData.status}`,
      HTTP_STATUS.OK
    );

  } catch (error) {
    console.error('Database health check failed:', error);
    
    healthData.status = 'unhealthy';
    healthData.responseTime = `${Date.now() - startTime}ms`;
    healthData.error = {
      message: error.message,
      code: error.code || 'UNKNOWN'
    };

    // エラーレスポンス
    return sendError(
      res,
      'Database health check failed',
      ERROR_CODES.DATABASE_ERROR,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      healthData
    );
  }
};

/**
 * データベース接続テスト
 * POST /api/health/database/test
 */
const testConnectionHandler = async (req, res) => {
  try {
    const startTime = Date.now();
    
    // トランザクションテスト
    const transactionTest = await db.transaction(async (client) => {
      // テストテーブルの作成
      await client.query(`
        CREATE TEMP TABLE test_connection (
          id SERIAL PRIMARY KEY,
          test_value VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // データの挿入
      await client.query(
        'INSERT INTO test_connection (test_value) VALUES ($1)',
        ['Connection test successful']
      );
      
      // データの取得
      const result = await client.query('SELECT * FROM test_connection');
      
      return result.rows[0];
    });
    
    const responseTime = Date.now() - startTime;
    
    return sendSuccess(
      res,
      {
        status: 'success',
        responseTime: `${responseTime}ms`,
        testResult: transactionTest,
        timestamp: new Date().toISOString()
      },
      'Database connection test successful',
      HTTP_STATUS.OK
    );
    
  } catch (error) {
    console.error('Database connection test failed:', error);
    
    return sendError(
      res,
      'Database connection test failed',
      ERROR_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      {
        error: error.message,
        code: error.code
      }
    );
  }
};

/**
 * データベース統計情報
 * GET /api/health/database/stats
 */
const databaseStatsHandler = async (req, res) => {
  try {
    // データベースサイズの取得
    const dbSize = await db.query(`
      SELECT 
        pg_database.datname as database_name,
        pg_size_pretty(pg_database_size(pg_database.datname)) as size
      FROM pg_database
      WHERE datname = current_database()
    `);
    
    // テーブルサイズの取得
    const tableSizes = await db.query(`
      SELECT 
        schemaname as schema,
        tablename as table_name,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        n_live_tup as row_count
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      LIMIT 10
    `);
    
    // 接続統計
    const connectionStats = await db.query(`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    
    // キャッシュヒット率
    const cacheStats = await db.query(`
      SELECT 
        sum(heap_blks_read) as heap_read,
        sum(heap_blks_hit) as heap_hit,
        CASE 
          WHEN sum(heap_blks_hit) + sum(heap_blks_read) > 0 
          THEN round(sum(heap_blks_hit) * 100.0 / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)
          ELSE 0
        END as cache_hit_ratio
      FROM pg_statio_user_tables
    `);
    
    const stats = {
      database: dbSize.rows[0],
      tables: tableSizes.rows,
      connections: connectionStats.rows[0],
      cache: {
        hitRatio: `${cacheStats.rows[0].cache_hit_ratio}%`,
        heapRead: cacheStats.rows[0].heap_read,
        heapHit: cacheStats.rows[0].heap_hit
      },
      timestamp: new Date().toISOString()
    };
    
    return sendSuccess(
      res,
      stats,
      'Database statistics retrieved',
      HTTP_STATUS.OK
    );
    
  } catch (error) {
    console.error('Failed to get database stats:', error);
    
    return sendError(
      res,
      'Failed to retrieve database statistics',
      ERROR_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      {
        error: error.message,
        code: error.code
      }
    );
  }
};

/**
 * APIハンドラーのメインエクスポート
 */
export default async (req, res) => {
  return corsMiddleware(
    loggingMiddleware(
      errorHandler(async (req, res) => {
        const { method } = req;
        const path = req.url?.split('?')[0];
        
        if (method === 'GET') {
          if (path?.includes('/stats')) {
            return databaseStatsHandler(req, res);
          }
          return databaseHealthHandler(req, res);
        } else if (method === 'POST' && path?.includes('/test')) {
          return testConnectionHandler(req, res);
        } else {
          return sendError(
            res,
            'Method not allowed',
            ERROR_CODES.INVALID_INPUT,
            HTTP_STATUS.METHOD_NOT_ALLOWED
          );
        }
      })
    )
  )(req, res);
};