// データクリーンアップユーティリティ
// セキュリティ改修に伴う古いデータの除去

/**
 * APIキー関連データを完全に削除
 * セキュリティ改修によりAPIキーがフロントエンドで管理されなくなったため、
 * 既存のlocalStorageから関連データを削除する
 */
export const cleanupApiKeyData = () => {
  console.log('=== APIキーデータクリーンアップ開始 ===');
  
  const apiKeyRelatedKeys = [
    'zaicoApiKey',           // メインのAPIキー
    'apiKey',                // 汎用APIキー
    'zaico_api_key',         // アンダースコア形式
    'ZAICO_API_KEY',         // 大文字形式
    'zaico-api-key',         // ハイフン形式
    'zaico_token',           // トークン形式
    'zaicoToken',            // キャメルケース
    'api_token',             // 汎用トークン
    'apiToken',              // キャメルケーストークン
    'authToken',             // 認証トークン
    'access_token',          // アクセストークン
    'accessToken'            // キャメルケースアクセストークン
  ];
  
  let removedCount = 0;
  const removedKeys = [];
  
  apiKeyRelatedKeys.forEach(key => {
    const value = localStorage.getItem(key);
    if (value !== null) {
      localStorage.removeItem(key);
      removedKeys.push(key);
      removedCount++;
      console.log(`削除: ${key} = ${value.substring(0, 10)}...`);
    }
  });
  
  console.log(`APIキーデータクリーンアップ完了: ${removedCount}件削除`);
  if (removedKeys.length > 0) {
    console.log('削除されたキー:', removedKeys);
  }
  
  return {
    removedCount,
    removedKeys,
    timestamp: new Date().toISOString()
  };
};

/**
 * セキュリティ関連の古いデータを削除
 * パスワードハッシュ化や認証方式変更に伴う古いデータの除去
 */
export const cleanupSecurityData = () => {
  console.log('=== セキュリティデータクリーンアップ開始 ===');
  
  const securityRelatedKeys = [
    'userPassword',          // 古いパスワード保存
    'plainPassword',         // プレーンテキストパスワード
    'password',              // 汎用パスワード
    'auth_password',         // 認証パスワード
    'loginPassword',         // ログインパスワード
    'tempPassword',          // 一時パスワード
    'rememberPassword'       // パスワード記憶機能
  ];
  
  let removedCount = 0;
  const removedKeys = [];
  
  securityRelatedKeys.forEach(key => {
    const value = localStorage.getItem(key);
    if (value !== null) {
      localStorage.removeItem(key);
      removedKeys.push(key);
      removedCount++;
      console.log(`セキュリティデータ削除: ${key}`);
    }
  });
  
  console.log(`セキュリティデータクリーンアップ完了: ${removedCount}件削除`);
  
  return {
    removedCount,
    removedKeys,
    timestamp: new Date().toISOString()
  };
};

/**
 * 開発・デバッグ用の一時データを削除
 */
export const cleanupDebugData = () => {
  console.log('=== デバッグデータクリーンアップ開始 ===');
  
  const debugKeys = [];
  let removedCount = 0;
  
  // localStorage内の全キーをチェック
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && (
      key.startsWith('debug_') ||
      key.startsWith('test_') ||
      key.startsWith('dev_') ||
      key.includes('_debug') ||
      key.includes('_test') ||
      key === 'debugMode' ||
      key === 'devMode'
    )) {
      const value = localStorage.getItem(key);
      localStorage.removeItem(key);
      debugKeys.push(key);
      removedCount++;
      console.log(`デバッグデータ削除: ${key}`);
    }
  }
  
  console.log(`デバッグデータクリーンアップ完了: ${removedCount}件削除`);
  
  return {
    removedCount,
    removedKeys: debugKeys,
    timestamp: new Date().toISOString()
  };
};

/**
 * 完全なデータクリーンアップを実行
 * APIキー、セキュリティ、デバッグ関連のデータを一括削除
 */
export const runCompleteCleanup = () => {
  console.log('=== 完全データクリーンアップ開始 ===');
  
  const results = {
    apiKeys: cleanupApiKeyData(),
    security: cleanupSecurityData(),
    debug: cleanupDebugData(),
    startTime: new Date().toISOString()
  };
  
  const totalRemoved = results.apiKeys.removedCount + 
                      results.security.removedCount + 
                      results.debug.removedCount;
  
  console.log(`=== 完全データクリーンアップ完了 ===`);
  console.log(`総削除件数: ${totalRemoved}件`);
  
  results.endTime = new Date().toISOString();
  results.totalRemoved = totalRemoved;
  
  return results;
};

/**
 * クリーンアップ結果をlocalStorageに記録
 * （管理者がクリーンアップの実行状況を確認できるよう）
 */
export const logCleanupResults = (results) => {
  try {
    const cleanupLog = {
      ...results,
      version: '1.0',
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    localStorage.setItem('cleanupLog', JSON.stringify(cleanupLog));
    console.log('クリーンアップ結果をログに記録しました');
  } catch (error) {
    console.error('クリーンアップログの記録に失敗:', error);
  }
};

export default {
  cleanupApiKeyData,
  cleanupSecurityData,
  cleanupDebugData,
  runCompleteCleanup,
  logCleanupResults
};