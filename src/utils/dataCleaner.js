// データクリーンアップユーティリティ
import zaicoClient from './zaicoClient';

// プロジェクトの在庫データをクリア
export const clearProjectInventory = () => {
  try {
    localStorage.removeItem('inventory');
    localStorage.removeItem('inventoryHistory');
    localStorage.removeItem('salesLedger');
    localStorage.removeItem('allApplications');
    localStorage.removeItem('zaicoSyncLogs');
    localStorage.removeItem('zaicoLastSyncTime');

    console.log('プロジェクトの在庫データをクリアしました');
    return { success: true, message: 'プロジェクトの在庫データをクリアしました' };
  } catch (error) {
    console.error('データクリアエラー:', error);
    return { success: false, error: error.message };
  }
};

// Zaicoの在庫データをクリア
export const clearZaicoInventory = async () => {
  try {
    console.log('=== Zaico在庫データクリア開始 ===');
    
    // Zaicoから在庫データを取得
    const zaicoInventory = await zaicoClient.getInventoriesFromZaico();
    console.log('削除対象の在庫数:', zaicoInventory.length);
    
    let deletedCount = 0;
    let errorCount = 0;
    
    // 各在庫データを削除
    for (const item of zaicoInventory) {
      try {
        await zaicoClient.callZaicoApi(`/inventories/${item.id}`, 'DELETE');
        deletedCount++;
        console.log(`削除完了: ${item.title} (ID: ${item.id})`);
      } catch (error) {
        errorCount++;
        console.error(`削除エラー: ${item.title} (ID: ${item.id})`, error);
      }
    }
    
    console.log(`Zaico在庫データクリア完了: ${deletedCount}件削除, ${errorCount}件エラー`);
    return { 
      success: true, 
      deletedCount, 
      errorCount,
      message: `Zaico在庫データをクリアしました: ${deletedCount}件削除, ${errorCount}件エラー`
    };
  } catch (error) {
    console.error('Zaico在庫データクリアエラー:', error);
    return { success: false, error: error.message };
  }
};

// プロジェクトデータの状況を確認
export const confirmDataClear = () => {
  try {
    const inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
    const inventoryHistory = JSON.parse(localStorage.getItem('inventoryHistory') || '[]');
    const salesLedger = JSON.parse(localStorage.getItem('salesLedger') || '[]');
    const allApplications = JSON.parse(localStorage.getItem('allApplications') || '[]');
    const zaicoSyncLogs = JSON.parse(localStorage.getItem('zaicoSyncLogs') || '[]');
    
    return {
      inventory: inventory.length,
      inventoryHistory: inventoryHistory.length,
      salesLedger: salesLedger.length,
      allApplications: allApplications.length,
      zaicoSyncLogs: zaicoSyncLogs.length
    };
  } catch (error) {
    console.error('データ状況確認エラー:', error);
    return { success: false, error: error.message };
  }
};

// すべてのデータをクリア（プロジェクト + Zaico）
export const clearAllData = async () => {
  try {
    console.log('=== 全データクリア開始 ===');
    
    // プロジェクトデータをクリア
    const projectResult = clearProjectInventory();
    console.log('プロジェクトデータクリア結果:', projectResult);
    
    // Zaicoデータをクリア
    const zaicoResult = await clearZaicoInventory();
    console.log('Zaicoデータクリア結果:', zaicoResult);
    
    if (projectResult.success && zaicoResult.success) {
      console.log('全データクリア完了');
      return { 
        success: true, 
        message: `全データクリア完了: プロジェクト${projectResult.message}, Zaico${zaicoResult.message}`,
        projectDeleted: projectResult,
        zaicoDeleted: zaicoResult
      };
    } else {
      console.error('全データクリアエラー');
      return { 
        success: false, 
        error: `プロジェクト: ${projectResult.error || 'OK'}, Zaico: ${zaicoResult.error || 'OK'}` 
      };
    }
  } catch (error) {
    console.error('全データクリアエラー:', error);
    return { success: false, error: error.message };
  }
};
