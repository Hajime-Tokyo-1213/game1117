/**
 * データベース接続テストスクリプト
 * 接続設定の検証とトラブルシューティング
 */

import db from './database.js';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config();

const runTests = async () => {
  console.log('========================================');
  console.log('Database Connection Test');
  console.log('========================================\n');
  
  // 環境変数の確認
  console.log('1. Environment Configuration:');
  console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
  console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ Configured' : '❌ Not configured');
  console.log('   DEV_DATABASE_URL:', process.env.DEV_DATABASE_URL ? '✅ Configured' : '❌ Not configured');
  console.log('   TEST_DATABASE_URL:', process.env.TEST_DATABASE_URL ? '✅ Configured' : '❌ Not configured');
  console.log();
  
  // 基本接続テスト
  console.log('2. Basic Connection Test:');
  try {
    const connected = await db.testConnection();
    if (connected) {
      console.log('   ✅ Database connection successful');
    } else {
      console.log('   ❌ Database connection failed');
      return;
    }
  } catch (error) {
    console.log('   ❌ Connection error:', error.message);
    return;
  }
  console.log();
  
  // クエリ実行テスト
  console.log('3. Query Execution Test:');
  try {
    const result = await db.query('SELECT 1 + 1 as result');
    console.log('   ✅ Simple query executed:', result.rows[0].result === 2 ? 'Correct' : 'Incorrect');
  } catch (error) {
    console.log('   ❌ Query execution failed:', error.message);
  }
  console.log();
  
  // データベース情報の取得
  console.log('4. Database Information:');
  try {
    const versionResult = await db.query('SELECT version()');
    console.log('   Version:', versionResult.rows[0].version);
    
    const currentDbResult = await db.query('SELECT current_database()');
    console.log('   Current Database:', currentDbResult.rows[0].current_database);
    
    const currentUserResult = await db.query('SELECT current_user');
    console.log('   Current User:', currentUserResult.rows[0].current_user);
  } catch (error) {
    console.log('   ❌ Failed to get database info:', error.message);
  }
  console.log();
  
  // テーブル存在確認
  console.log('5. Table Check:');
  try {
    const tablesResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      LIMIT 5
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log('   Existing tables:');
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('   No tables found in public schema');
    }
  } catch (error) {
    console.log('   ❌ Failed to check tables:', error.message);
  }
  console.log();
  
  // トランザクションテスト
  console.log('6. Transaction Test:');
  try {
    await db.transaction(async (client) => {
      // 一時テーブルを作成
      await client.query(`
        CREATE TEMP TABLE test_transaction (
          id SERIAL PRIMARY KEY,
          value TEXT
        )
      `);
      
      // データを挿入
      await client.query(
        'INSERT INTO test_transaction (value) VALUES ($1)',
        ['Transaction test successful']
      );
      
      // データを取得
      const result = await client.query('SELECT * FROM test_transaction');
      console.log('   ✅ Transaction executed successfully');
      console.log('   Test data:', result.rows[0].value);
    });
  } catch (error) {
    console.log('   ❌ Transaction failed:', error.message);
  }
  console.log();
  
  // ヘルパー関数のテスト
  console.log('7. Helper Functions Test:');
  try {
    // EXISTS確認
    const migrationTableExists = await db.exists(
      'information_schema.tables',
      "table_name = $1 AND table_schema = 'public'",
      ['migrations']
    );
    console.log('   Migrations table exists:', migrationTableExists ? '✅ Yes' : '❌ No');
    
    // COUNT確認
    const tableCount = await db.count(
      'information_schema.tables',
      "table_schema = 'public'"
    );
    console.log('   Total tables in public schema:', tableCount);
  } catch (error) {
    console.log('   ❌ Helper function test failed:', error.message);
  }
  console.log();
  
  // プール情報
  console.log('8. Connection Pool Information:');
  try {
    const pool = db.initializePool();
    console.log('   Total connections:', pool.totalCount);
    console.log('   Idle connections:', pool.idleCount);
    console.log('   Waiting requests:', pool.waitingCount);
  } catch (error) {
    console.log('   ❌ Failed to get pool info:', error.message);
  }
  
  console.log('\n========================================');
  console.log('Test Complete');
  console.log('========================================');
};

// テストを実行
runTests()
  .then(() => {
    console.log('\n✅ All tests completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  })
  .finally(() => {
    // プールを閉じる
    db.closePool();
  });