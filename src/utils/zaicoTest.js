// zaico連携機能のテスト用ユーティリティ
import { createInventoryInZaico, getInventoriesFromZaico, updateInventoryInZaico, logSyncActivity } from './zaicoClient';

// テスト用の在庫データ
const testInventoryItem = {
  id: 'TEST-INV-001',
  productType: 'console',
  manufacturer: 'sony',
  manufacturerLabel: 'ソニー',
  console: 'ps5',
  consoleLabel: 'PlayStation 5',
  color: 'white',
  colorLabel: 'ホワイト',
  condition: 'excellent',
  conditionLabel: '美品',
  assessedRank: 'A',
  quantity: 1,
  acquisitionPrice: 50000,
  buybackPrice: 45000,
  managementNumbers: ['TEST-MGMT-001'],
  notes: 'テスト用商品'
};

// zaico連携機能のテスト
export const testZaicoIntegration = async () => {
  console.log('=== zaico連携機能テスト開始 ===');
  
  try {
    // 1. 在庫登録テスト（仕入れ単価付き）
    console.log('1. 在庫登録テスト（仕入れ単価: ¥50,000）...');
    const createResult = await createInventoryInZaico(testInventoryItem);
    console.log('在庫登録結果:', createResult);
    console.log('仕入れ単価が設定されているか確認:', createResult.optional_attributes?.find(attr => attr.name === '仕入価格')?.value);
    
    // 2. 在庫取得テスト
    console.log('2. 在庫取得テスト...');
    const inventories = await getInventoriesFromZaico();
    console.log('取得した在庫数:', inventories.length);
    
    // 3. 仕入れ単価の更新テスト
    if (createResult.id) {
      console.log('3. 仕入れ単価更新テスト...');
      const updatedItem = {
        ...testInventoryItem,
        acquisitionPrice: 55000, // 仕入れ単価を更新
        buybackPrice: 50000
      };
      const updateResult = await updateInventoryInZaico(createResult.id, updatedItem);
      console.log('仕入れ単価更新結果:', updateResult);
    }
    
    // 4. ログ機能テスト
    console.log('4. ログ機能テスト...');
    logSyncActivity('test', 'success', { 
      testData: 'テストデータ',
      purchasePrice: testInventoryItem.acquisitionPrice 
    });
    
    console.log('=== zaico連携機能テスト完了 ===');
    return true;
    
  } catch (error) {
    console.error('zaico連携テストエラー:', error);
    logSyncActivity('test', 'error', { error: error.message });
    return false;
  }
};

// 同期ログの表示
export const showSyncLogs = () => {
  const logs = JSON.parse(localStorage.getItem('zaicoSyncLogs') || '[]');
  console.log('=== 同期ログ ===');
  logs.forEach((log, index) => {
    console.log(`${index + 1}. [${log.timestamp}] ${log.action} - ${log.status}`);
    if (log.details) {
      console.log('   詳細:', log.details);
    }
  });
};

// テスト用の在庫データをクリア
export const clearTestData = () => {
  localStorage.removeItem('zaicoSyncLogs');
  console.log('テストデータをクリアしました');
};

export default {
  testZaicoIntegration,
  showSyncLogs,
  clearTestData
};
