// パスワード移行進捗追跡ユーティリティ
// 移行プロセスの監視と統計情報の提供

import { getMigrationLogs } from './passwordMigration.js';

/**
 * 移行進捗の統計情報を取得
 * @returns {object} 進捗統計
 */
export const getMigrationProgress = () => {
  const logs = getMigrationLogs();
  
  const stats = {
    totalAttempts: 0,
    successfulMigrations: 0,
    failedMigrations: 0,
    uniqueUsers: new Set(),
    migrationsByDate: {},
    recentActivity: [],
    migrationRate: 0,
    averageTimeToMigrate: 0
  };

  // ログを解析
  logs.forEach(log => {
    if (log.action === 'login_attempt_with_plain_password') {
      stats.totalAttempts++;
      if (log.details.userId) {
        stats.uniqueUsers.add(log.details.userId);
      }
    }
    
    if (log.action === 'password_migration_success') {
      stats.successfulMigrations++;
      const date = new Date(log.timestamp).toLocaleDateString();
      stats.migrationsByDate[date] = (stats.migrationsByDate[date] || 0) + 1;
    }
    
    if (log.action === 'password_migration_failed') {
      stats.failedMigrations++;
    }
  });

  // 最近のアクティビティ（最新10件）
  stats.recentActivity = logs
    .filter(log => 
      log.action.includes('migration') || 
      log.action === 'login_attempt_with_plain_password'
    )
    .slice(-10)
    .reverse();

  // 移行率の計算
  if (stats.totalAttempts > 0) {
    stats.migrationRate = (stats.successfulMigrations / stats.totalAttempts * 100).toFixed(1);
  }

  stats.uniqueUsersCount = stats.uniqueUsers.size;
  delete stats.uniqueUsers; // Setオブジェクトは削除

  return stats;
};

/**
 * 特定期間の移行統計を取得
 * @param {Date} startDate - 開始日
 * @param {Date} endDate - 終了日
 * @returns {object} 期間統計
 */
export const getMigrationStatsByPeriod = (startDate, endDate) => {
  const logs = getMigrationLogs();
  
  const filteredLogs = logs.filter(log => {
    const logDate = new Date(log.timestamp);
    return logDate >= startDate && logDate <= endDate;
  });

  const stats = {
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    },
    totalMigrations: 0,
    successfulMigrations: 0,
    failedMigrations: 0,
    dailyBreakdown: {}
  };

  filteredLogs.forEach(log => {
    if (log.action === 'password_migration_success') {
      stats.successfulMigrations++;
      stats.totalMigrations++;
      
      const date = new Date(log.timestamp).toLocaleDateString();
      if (!stats.dailyBreakdown[date]) {
        stats.dailyBreakdown[date] = { success: 0, failed: 0 };
      }
      stats.dailyBreakdown[date].success++;
    }
    
    if (log.action === 'password_migration_failed') {
      stats.failedMigrations++;
      stats.totalMigrations++;
      
      const date = new Date(log.timestamp).toLocaleDateString();
      if (!stats.dailyBreakdown[date]) {
        stats.dailyBreakdown[date] = { success: 0, failed: 0 };
      }
      stats.dailyBreakdown[date].failed++;
    }
  });

  return stats;
};

/**
 * 移行進捗レポートを生成
 * @returns {string} フォーマット済みレポート
 */
export const generateMigrationReport = () => {
  const progress = getMigrationProgress();
  const today = new Date();
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStats = getMigrationStatsByPeriod(lastWeek, today);

  const report = `
==============================================
パスワード移行進捗レポート
生成日時: ${new Date().toLocaleString('ja-JP')}
==============================================

【全体統計】
- 移行試行回数: ${progress.totalAttempts}
- 成功移行数: ${progress.successfulMigrations}
- 失敗移行数: ${progress.failedMigrations}
- 移行成功率: ${progress.migrationRate}%
- ユニークユーザー数: ${progress.uniqueUsersCount}

【過去7日間の統計】
- 総移行数: ${weekStats.totalMigrations}
- 成功: ${weekStats.successfulMigrations}
- 失敗: ${weekStats.failedMigrations}

【日別移行数】
${Object.entries(weekStats.dailyBreakdown)
  .map(([date, stats]) => `${date}: 成功 ${stats.success}, 失敗 ${stats.failed}`)
  .join('\n')}

【最近のアクティビティ】
${progress.recentActivity
  .map(activity => `${new Date(activity.timestamp).toLocaleString('ja-JP')} - ${activity.action}`)
  .join('\n')}
==============================================
`;

  return report;
};

/**
 * 移行進捗をコンソールに表示
 */
export const displayMigrationProgress = () => {
  const progress = getMigrationProgress();
  
  console.log('=== パスワード移行進捗 ===');
  console.log(`移行成功率: ${progress.migrationRate}%`);
  console.log(`成功: ${progress.successfulMigrations} / 試行: ${progress.totalAttempts}`);
  console.log(`ユニークユーザー: ${progress.uniqueUsersCount}`);
  
  if (progress.recentActivity.length > 0) {
    console.log('\n最新の移行:');
    const latest = progress.recentActivity[0];
    console.log(`${new Date(latest.timestamp).toLocaleString('ja-JP')} - ${latest.action}`);
  }
};

export default {
  getMigrationProgress,
  getMigrationStatsByPeriod,
  generateMigrationReport,
  displayMigrationProgress
};