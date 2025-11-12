// Zaico同期ヘルパー関数
import { getInventoriesFromZaico, logSyncActivity } from './zaicoApi';

// 既存在庫をZaicoと同期
export const syncExistingInventoryWithZaico = async () => {
  try {
    console.log('=== 既存在庫同期開始 ===');
    
    // プロジェクトの在庫データを取得
    const projectInventory = JSON.parse(localStorage.getItem('inventory') || '[]');
    console.log('プロジェクト在庫数:', projectInventory.length);
    
    // Zaicoの在庫データを全件取得（ページネーション対応）
    const zaicoInventory = await getInventoriesFromZaico();
    console.log('Zaico在庫数:', zaicoInventory.length);
    const zaicoInventoryById = new Map(zaicoInventory.map(item => [item.id, item]));
    
    let syncCount = 0;
    let metadataUpdateCount = 0;
    
    // プロジェクト在庫をループしてzaicoIdを設定
    for (const projectItem of projectInventory) {
      if (projectItem.zaicoId) {
        console.log(`既にzaicoIdが設定済み: ${projectItem.title}`);
        const existingZaicoItem = zaicoInventoryById.get(projectItem.zaicoId);
        if (existingZaicoItem && !projectItem.zaicoOriginalDate) {
          projectItem.zaicoOriginalDate = existingZaicoItem.created_at || existingZaicoItem.updated_at || null;
          console.log(`zaicoOriginalDateを補完: ${projectItem.title} -> ${projectItem.zaicoOriginalDate}`);
          metadataUpdateCount++;
        }
        continue;
      }
      
      // Zaico在庫とマッチング
      const matchingZaicoItem = zaicoInventory.find(zaicoItem => 
        zaicoItem.title === projectItem.title ||
        zaicoItem.title === projectItem.consoleLabel ||
        zaicoItem.title === projectItem.softwareName
      );
      
      if (matchingZaicoItem) {
        // zaicoIdを設定
        projectItem.zaicoId = matchingZaicoItem.id;
        projectItem.zaicoOriginalDate = matchingZaicoItem.created_at || matchingZaicoItem.updated_at || null;
        syncCount++;
        console.log(`zaicoIdを設定: ${projectItem.title} -> ${matchingZaicoItem.id}`);
      }
    }
    
    // 更新された在庫データを保存
    localStorage.setItem('inventory', JSON.stringify(projectInventory));
    
    console.log(`同期完了: zaicoId設定${syncCount}件, 作成日補完${metadataUpdateCount}件`);
    return { success: true, syncCount, metadataUpdateCount };
    
  } catch (error) {
    console.error('既存在庫同期エラー:', error);
    return { success: false, error: error.message };
  }
};

// 在庫データのzaicoId状況を確認
export const checkInventoryZaicoIds = () => {
  const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
  
  const total = inventoryData.length;
  const withZaicoId = inventoryData.filter(item => item.zaicoId).length;
  const withoutZaicoId = total - withZaicoId;
  
  return {
    total,
    withZaicoId,
    withoutZaicoId
  };
};

// Zaico側の在庫データをプロジェクト側に同期
export const syncZaicoToProject = async (dateRange = null) => {
  try {
    console.log('=== Zaico → プロジェクト同期開始 ===');
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      console.log(`フィルタリング条件: 在庫数量1以上、日付範囲: ${dateRange.startDate} 〜 ${dateRange.endDate}`);
    } else {
      console.log('フィルタリング条件: 在庫数量1以上');
    }
    
    // zaicoの在庫データを全件取得（ページネーション対応）
    const zaicoInventory = await getInventoriesFromZaico();
    console.log('zaico在庫数（フィルタリング前）:', zaicoInventory.length);
    
    // フィルタリング: 数量0のものは除外、数量1以上のものは取り込み対象
    let filteredZaicoInventory = zaicoInventory.filter(zaicoItem => {
      const quantity = parseInt(zaicoItem.quantity) || 0;
      
      // 数量0のものは除外
      if (quantity === 0) {
        console.log(`数量0のため除外: ${zaicoItem.title} (zaicoId: ${zaicoItem.id})`);
        return false;
      }
      
      // 数量1以上のものは取り込み対象
      console.log(`✓ 取り込み対象: ${zaicoItem.title} (zaicoId: ${zaicoItem.id}, 数量: ${quantity})`);
      return true;
    });
    
    // 日付範囲が指定されている場合は、日付でフィルタリング
    if (dateRange && dateRange.startDate && dateRange.endDate) {
      const startDate = new Date(dateRange.startDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);
      
      const beforeDateFilter = filteredZaicoInventory.length;
      filteredZaicoInventory = filteredZaicoInventory.filter(zaicoItem => {
        // created_atまたはupdated_atでフィルタリング
        const itemDate = new Date(zaicoItem.created_at || zaicoItem.updated_at);
        
        if (itemDate >= startDate && itemDate <= endDate) {
          console.log(`✓ 日付範囲内: ${zaicoItem.title} (日付: ${itemDate.toLocaleDateString('ja-JP')})`);
          return true;
        } else {
          console.log(`× 日付範囲外: ${zaicoItem.title} (日付: ${itemDate.toLocaleDateString('ja-JP')})`);
          return false;
        }
      });
      
      console.log(`日付フィルタリング: ${beforeDateFilter}件 → ${filteredZaicoInventory.length}件`);
    }
    
    console.log('zaico在庫数（フィルタリング後）:', filteredZaicoInventory.length);
    
    // プロジェクトの既存在庫データを取得
    const existingProjectInventory = JSON.parse(localStorage.getItem('inventory') || '[]');
    console.log('プロジェクト既存在庫数:', existingProjectInventory.length);
    
    let syncCount = 0;
    let skippedCount = 0;
    const newProjectInventory = [...existingProjectInventory];
    
    // フィルタリングされたzaicoの在庫データをループ
    for (const zaicoItem of filteredZaicoInventory) {
      // 既にプロジェクト側に存在するかチェック
      const existingItem = newProjectInventory.find(projectItem => 
        projectItem.zaicoId === zaicoItem.id
      );
      
      if (existingItem) {
        console.log(`既に存在: ${zaicoItem.title} (zaicoId: ${zaicoItem.id})`);
        skippedCount++;
        continue;
      }
      
      // Zaicoの仕入単価を取得（optional_attributesから）
      let zaicoPurchasePrice = 0;
      if (zaicoItem.optional_attributes && Array.isArray(zaicoItem.optional_attributes)) {
        const priceAttribute = zaicoItem.optional_attributes.find(attr => 
          attr.name === '仕入単価' || attr.name === 'purchase_price' || attr.name === '仕入価格'
        );
        
        if (priceAttribute && priceAttribute.value) {
          zaicoPurchasePrice = parseFloat(priceAttribute.value) || 0;
        }
      }
      
      // プロジェクト形式の在庫データを作成
      const projectItem = {
        id: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        zaicoId: zaicoItem.id,
        title: zaicoItem.title,
        consoleLabel: zaicoItem.title,
        softwareName: zaicoItem.title,
        quantity: parseInt(zaicoItem.quantity) || 0,
        sourceType: 'zaico_import',
        importDate: new Date().toISOString(),
        category: zaicoItem.category || 'ゲーム機',
        manufacturer: zaicoItem.manufacturer || '不明',
        condition: zaicoItem.state || 'S',
        location: zaicoItem.place || 'ZAICO倉庫',
        assessedRank: '未評価',
        status: 'in_stock',
        buybackPrice: zaicoPurchasePrice,
        acquisitionPrice: zaicoPurchasePrice,
        registeredDate: new Date().toISOString(),
        zaicoOriginalDate: zaicoItem.created_at || zaicoItem.updated_at,
        colorLabel: '',
        managementNumbers: [`ZAICO-${zaicoItem.id}`],
        notes: `Zaicoから同期: ${zaicoItem.memo || ''}${zaicoPurchasePrice > 0 ? ` | 仕入単価: ¥${zaicoPurchasePrice.toLocaleString()}` : ''}`,
        createdAt: new Date().toISOString()
      };
      
      newProjectInventory.push(projectItem);
      syncCount++;
      console.log(`新規追加: ${zaicoItem.title} (zaicoId: ${zaicoItem.id}, 数量: ${projectItem.quantity})`);
    }
    
    // Zaicoで削除された商品をプロジェクトからも削除（フィルタリング後のリストを使用）
    const zaicoIds = filteredZaicoInventory.map(item => item.id);
    const originalCount = newProjectInventory.length;
    
    // Zaicoに存在しない商品をフィルタリング
    const filteredInventory = newProjectInventory.filter(item => {
      // Zaico同期商品（zaicoIdがある）のみチェック
      if (item.zaicoId && !zaicoIds.includes(item.zaicoId)) {
        console.log(`Zaicoで削除された商品を削除: ${item.title} (zaicoId: ${item.zaicoId})`);
        return false;
      }
      return true;
    });
    
    const deletedCount = originalCount - filteredInventory.length;
    
    // 更新された在庫データを保存
    localStorage.setItem('inventory', JSON.stringify(filteredInventory));
    
    console.log(`=== 同期完了 ===`);
    console.log(`取り込み対象: ${filteredZaicoInventory.length}件`);
    console.log(`新規追加: ${syncCount}件`);
    console.log(`既存スキップ: ${skippedCount}件`);
    console.log(`削除: ${deletedCount}件`);
    console.log(`総在庫数: ${filteredInventory.length}件`);
    
    return { 
      success: true, 
      syncCount, 
      skippedCount,
      deletedCount,
      totalCount: filteredInventory.length,
      filteredCount: filteredZaicoInventory.length
    };
    
  } catch (error) {
    console.error('Zaico → プロジェクト同期エラー:', error);
    
    return { success: false, error: error.message };
  }
};
