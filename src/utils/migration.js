// アプリケーションマイグレーションユーティリティ
// バージョン管理されたデータ移行とクリーンアップを実行

import { runCompleteCleanup, logCleanupResults } from './dataCleanup.js';

// マイグレーションバージョン定義
const CURRENT_MIGRATION_VERSION = '1.0';
const MIGRATION_VERSION_KEY = 'migrationVersion';

/**
 * マイグレーションバージョンを取得
 */
export const getCurrentMigrationVersion = () => {
  return localStorage.getItem(MIGRATION_VERSION_KEY) || '0.0';
};

/**
 * マイグレーションバージョンを設定
 */
export const setMigrationVersion = (version) => {
  localStorage.setItem(MIGRATION_VERSION_KEY, version);
  console.log(`マイグレーションバージョンを設定: ${version}`);
};

/**
 * バージョン比較ユーティリティ
 * @param {string} version1 
 * @param {string} version2 
 * @returns {number} -1: version1 < version2, 0: equal, 1: version1 > version2
 */
const compareVersions = (version1, version2) => {
  const v1Parts = version1.split('.').map(num => parseInt(num, 10));
  const v2Parts = version2.split('.').map(num => parseInt(num, 10));
  
  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part < v2Part) return -1;
    if (v1Part > v2Part) return 1;
  }
  
  return 0;
};

/**
 * マイグレーション v1.0: APIキー削除とセキュリティデータクリーンアップ
 */
const migration_v1_0 = () => {
  console.log('=== マイグレーション v1.0 実行開始 ===');
  console.log('目的: APIキーの完全削除とセキュリティデータクリーンアップ');
  
  try {
    const results = runCompleteCleanup();
    logCleanupResults(results);
    
    console.log('マイグレーション v1.0 実行完了');
    return {
      success: true,
      version: '1.0',
      description: 'APIキー削除とセキュリティデータクリーンアップ',
      results,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('マイグレーション v1.0 実行エラー:', error);
    return {
      success: false,
      version: '1.0',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * マイグレーション実行関数のマッピング
 */
const migrations = {
  '1.0': migration_v1_0
};

/**
 * 必要なマイグレーションを実行
 */
export const runMigrations = () => {
  console.log('=== マイグレーション実行開始 ===');
  
  const currentVersion = getCurrentMigrationVersion();
  console.log(`現在のマイグレーションバージョン: ${currentVersion}`);
  console.log(`最新のマイグレーションバージョン: ${CURRENT_MIGRATION_VERSION}`);
  
  // バージョン比較
  if (compareVersions(currentVersion, CURRENT_MIGRATION_VERSION) >= 0) {
    console.log('マイグレーション不要: 既に最新バージョンです');
    return {
      executed: false,
      reason: '既に最新バージョン',
      currentVersion,
      targetVersion: CURRENT_MIGRATION_VERSION
    };
  }
  
  const executedMigrations = [];
  let hasError = false;
  
  // 実行すべきマイグレーションを順次実行
  Object.keys(migrations).forEach(version => {
    if (compareVersions(currentVersion, version) < 0) {
      console.log(`マイグレーション ${version} を実行中...`);
      
      const migrationResult = migrations[version]();
      executedMigrations.push(migrationResult);
      
      if (migrationResult.success) {
        setMigrationVersion(version);
        console.log(`マイグレーション ${version} 完了`);
      } else {
        console.error(`マイグレーション ${version} 失敗:`, migrationResult.error);
        hasError = true;
        return; // エラーがあれば後続のマイグレーションは実行しない
      }
    }
  });
  
  const finalVersion = getCurrentMigrationVersion();
  console.log(`=== マイグレーション実行完了 ===`);
  console.log(`最終バージョン: ${finalVersion}`);
  
  return {
    executed: true,
    executedMigrations,
    hasError,
    initialVersion: currentVersion,
    finalVersion,
    targetVersion: CURRENT_MIGRATION_VERSION,
    timestamp: new Date().toISOString()
  };
};

/**
 * マイグレーション強制実行（開発・デバッグ用）
 */
export const forceMigration = (version = CURRENT_MIGRATION_VERSION) => {
  console.warn('=== マイグレーション強制実行 ===');
  console.warn(`強制実行バージョン: ${version}`);
  
  if (migrations[version]) {
    const result = migrations[version]();
    if (result.success) {
      setMigrationVersion(version);
    }
    return result;
  } else {
    console.error(`マイグレーション ${version} が見つかりません`);
    return {
      success: false,
      error: `Migration ${version} not found`
    };
  }
};

/**
 * マイグレーション状態をリセット（開発・デバッグ用）
 */
export const resetMigrationVersion = () => {
  console.warn('=== マイグレーションバージョンリセット ===');
  localStorage.removeItem(MIGRATION_VERSION_KEY);
  console.warn('マイグレーションバージョンがリセットされました');
};

/**
 * マイグレーション状態を取得
 */
export const getMigrationStatus = () => {
  const currentVersion = getCurrentMigrationVersion();
  const needsMigration = compareVersions(currentVersion, CURRENT_MIGRATION_VERSION) < 0;
  
  return {
    currentVersion,
    latestVersion: CURRENT_MIGRATION_VERSION,
    needsMigration,
    availableMigrations: Object.keys(migrations),
    lastChecked: new Date().toISOString()
  };
};

export default {
  runMigrations,
  getCurrentMigrationVersion,
  setMigrationVersion,
  forceMigration,
  resetMigrationVersion,
  getMigrationStatus
};