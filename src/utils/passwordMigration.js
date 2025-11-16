// パスワード移行ユーティリティ
// 既存の平文パスワードからハッシュ化パスワードへの段階的移行を管理

import { hashPassword, verifyPassword, validatePassword } from './passwordHash.js';

// 移行状態の定義
export const MIGRATION_STATUS = {
  NOT_MIGRATED: 'not_migrated',        // 未移行（平文パスワード）
  MIGRATED: 'migrated',                // 移行済み（ハッシュ化済み）
  MIGRATION_FAILED: 'migration_failed', // 移行失敗
  SKIP_MIGRATION: 'skip_migration'     // 移行スキップ（特殊なケース）
};

/**
 * ユーザーのパスワードが移行を必要とするかチェック
 * @param {object} user - ユーザーオブジェクト
 * @returns {boolean} 移行が必要かどうか
 */
export const needsMigration = (user) => {
  if (!user || !user.password) {
    console.warn('パスワード移行判定: ユーザーまたはパスワードが不正です', user);
    return false;
  }

  // 既に移行済みとマークされている場合
  if (user.passwordMigrationStatus === MIGRATION_STATUS.MIGRATED) {
    return false;
  }

  // 移行スキップとマークされている場合
  if (user.passwordMigrationStatus === MIGRATION_STATUS.SKIP_MIGRATION) {
    return false;
  }

  // bcryptハッシュの判定（より厳密なチェック）
  const bcryptPattern = /^\$2[abyxy]\$\d{1,2}\$.{53}$/;
  const isHashed = bcryptPattern.test(user.password);
  
  // ハッシュ化されていない、または移行ステータスが未移行の場合
  if (!isHashed || user.passwordMigrationStatus === MIGRATION_STATUS.NOT_MIGRATED) {
    console.log(`パスワード移行が必要: ${user.email || user.id} (ハッシュ化: ${isHashed}, ステータス: ${user.passwordMigrationStatus})`);
    return true;
  }

  return false;
};

/**
 * ユーザーのパスワードを移行する
 * @param {object} user - 移行対象のユーザー
 * @param {string} plainPassword - 平文パスワード
 * @returns {Promise<object>} 移行結果
 */
export const migratePassword = async (user, plainPassword) => {
  console.log('=== パスワード移行処理開始 ===');
  console.log(`ユーザー: ${user.email || user.id}`);

  try {
    if (!needsMigration(user)) {
      console.log('移行不要: 既にハッシュ化済みまたはスキップ対象');
      return {
        success: true,
        migrated: false,
        reason: 'migration_not_needed',
        hashedPassword: user.password
      };
    }

    // パスワード検証（平文パスワードが正しいかチェック）
    if (user.password !== plainPassword) {
      console.error('移行失敗: 提供された平文パスワードが既存パスワードと一致しません');
      return {
        success: false,
        migrated: false,
        error: 'password_mismatch',
        reason: '平文パスワードが一致しません'
      };
    }

    // パスワードバリデーション
    const validation = validatePassword(plainPassword);
    if (!validation.isValid) {
      console.warn('移行警告: パスワードが現在の要件を満たしていません', validation.errors);
      // 既存ユーザーの場合は警告のみで移行を継続
    }

    // ハッシュ化実行
    console.log('パスワードハッシュ化開始');
    const hashedPassword = await hashPassword(plainPassword);
    console.log('パスワードハッシュ化完了');

    // 移行成功
    const result = {
      success: true,
      migrated: true,
      hashedPassword,
      migrationTimestamp: new Date().toISOString(),
      originalPasswordLength: plainPassword.length,
      passwordValidation: validation
    };

    console.log('パスワード移行成功');
    return result;

  } catch (error) {
    console.error('パスワード移行エラー:', error);
    return {
      success: false,
      migrated: false,
      error: error.message,
      reason: 'migration_error'
    };
  }
};

/**
 * ユーザーデータに移行状態を設定
 * @param {object} user - ユーザーオブジェクト
 * @param {object} migrationResult - 移行結果
 * @returns {object} 更新されたユーザーオブジェクト
 */
export const updateUserWithMigrationResult = (user, migrationResult) => {
  const updatedUser = { ...user };

  if (migrationResult.success && migrationResult.migrated) {
    // 移行成功
    updatedUser.password = migrationResult.hashedPassword;
    updatedUser.passwordMigrationStatus = MIGRATION_STATUS.MIGRATED;
    updatedUser.passwordMigrationDate = migrationResult.migrationTimestamp;
    updatedUser.passwordHashMethod = 'bcrypt';
    updatedUser.lastPasswordUpdate = migrationResult.migrationTimestamp;
    
    // バリデーション結果も保存（警告があった場合）
    if (migrationResult.passwordValidation && !migrationResult.passwordValidation.isValid) {
      updatedUser.passwordValidationWarnings = migrationResult.passwordValidation.errors;
    }
  } else {
    // 移行失敗
    updatedUser.passwordMigrationStatus = MIGRATION_STATUS.MIGRATION_FAILED;
    updatedUser.passwordMigrationError = migrationResult.error;
    updatedUser.passwordMigrationAttempts = (user.passwordMigrationAttempts || 0) + 1;
    updatedUser.lastMigrationAttempt = new Date().toISOString();
  }

  return updatedUser;
};

/**
 * 全ユーザーの移行状況を分析
 * @param {Array} users - ユーザーリスト
 * @returns {object} 移行統計
 */
export const analyzeMigrationStatus = (users) => {
  console.log('=== パスワード移行状況分析開始 ===');

  const stats = {
    total: users.length,
    migrated: 0,
    needsMigration: 0,
    migrationFailed: 0,
    skipMigration: 0,
    unknown: 0,
    details: []
  };

  users.forEach(user => {
    const userStatus = {
      id: user.id,
      email: user.email,
      migrationNeeded: needsMigration(user),
      currentStatus: user.passwordMigrationStatus || 'unknown',
      hasValidPassword: !!user.password,
      isHashedPassword: user.password && user.password.startsWith('$2')
    };

    if (userStatus.currentStatus === MIGRATION_STATUS.MIGRATED || userStatus.isHashedPassword) {
      stats.migrated++;
    } else if (userStatus.migrationNeeded) {
      stats.needsMigration++;
    } else if (userStatus.currentStatus === MIGRATION_STATUS.MIGRATION_FAILED) {
      stats.migrationFailed++;
    } else if (userStatus.currentStatus === MIGRATION_STATUS.SKIP_MIGRATION) {
      stats.skipMigration++;
    } else {
      stats.unknown++;
    }

    stats.details.push(userStatus);
  });

  // パーセンテージ計算
  stats.migrationRate = stats.total > 0 ? (stats.migrated / stats.total * 100).toFixed(1) : 0;
  stats.pendingRate = stats.total > 0 ? (stats.needsMigration / stats.total * 100).toFixed(1) : 0;

  console.log('移行状況分析結果:', {
    総ユーザー数: stats.total,
    移行済み: stats.migrated,
    移行必要: stats.needsMigration,
    移行失敗: stats.migrationFailed,
    移行率: `${stats.migrationRate}%`
  });

  return stats;
};

/**
 * 一括移行準備チェック
 * @param {Array} users - ユーザーリスト
 * @returns {object} 一括移行の準備状況
 */
export const prepareBatchMigration = (users) => {
  console.log('=== 一括移行準備チェック開始 ===');

  const migrationCandidates = users.filter(user => needsMigration(user));
  const problems = [];

  // 問題のあるユーザーをチェック
  migrationCandidates.forEach(user => {
    if (!user.password) {
      problems.push({
        user: user.email || user.id,
        issue: 'パスワードが設定されていません',
        severity: 'high'
      });
    } else if (user.password.length < 1) {
      problems.push({
        user: user.email || user.id,
        issue: 'パスワードが空です',
        severity: 'high'
      });
    } else if (user.passwordMigrationAttempts && user.passwordMigrationAttempts > 3) {
      problems.push({
        user: user.email || user.id,
        issue: '移行試行回数が上限を超えています',
        severity: 'medium'
      });
    }
  });

  const result = {
    totalUsers: users.length,
    migrationCandidates: migrationCandidates.length,
    readyForMigration: migrationCandidates.length - problems.length,
    problems,
    estimatedMigrationTime: migrationCandidates.length * 2, // 概算（秒）
    recommendations: []
  };

  // 推奨事項
  if (problems.length > 0) {
    result.recommendations.push('問題のあるユーザーアカウントを先に修正してください');
  }
  
  if (migrationCandidates.length > 100) {
    result.recommendations.push('大量のユーザーがいるため、段階的な移行を検討してください');
  }

  if (migrationCandidates.length > 0) {
    result.recommendations.push('移行前にデータベースのバックアップを取ってください');
  }

  console.log('一括移行準備結果:', result);
  return result;
};

/**
 * 移行ログの記録
 * @param {string} action - アクション名
 * @param {object} details - 詳細情報
 */
export const logMigrationActivity = (action, details = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    details,
    version: '1.0'
  };

  console.log('パスワード移行ログ:', logEntry);

  try {
    const existingLogs = JSON.parse(localStorage.getItem('passwordMigrationLogs') || '[]');
    existingLogs.push(logEntry);

    // ログサイズ制限（最新100件まで）
    if (existingLogs.length > 100) {
      existingLogs.splice(0, existingLogs.length - 100);
    }

    localStorage.setItem('passwordMigrationLogs', JSON.stringify(existingLogs));
  } catch (error) {
    console.error('移行ログの保存に失敗:', error);
  }
};

/**
 * 移行ログの取得
 * @returns {Array} 移行ログ一覧
 */
export const getMigrationLogs = () => {
  try {
    return JSON.parse(localStorage.getItem('passwordMigrationLogs') || '[]');
  } catch (error) {
    console.error('移行ログの読み込みに失敗:', error);
    return [];
  }
};

/**
 * 特定ユーザーの移行履歴取得
 * @param {string} userId - ユーザーID
 * @returns {Array} そのユーザーの移行履歴
 */
export const getUserMigrationHistory = (userId) => {
  const allLogs = getMigrationLogs();
  return allLogs.filter(log => 
    log.details.userId === userId || 
    log.details.userEmail === userId ||
    log.details.user === userId
  );
};

export default {
  needsMigration,
  migratePassword,
  updateUserWithMigrationResult,
  analyzeMigrationStatus,
  prepareBatchMigration,
  logMigrationActivity,
  getMigrationLogs,
  getUserMigrationHistory,
  MIGRATION_STATUS
};