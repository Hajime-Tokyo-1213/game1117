// Zaico統合クライアント（セキュア版）
// 全てのZaico API操作を統一したインターフェースで提供

const ZAICO_API_BASE_URL = '/api/zaico';

// 統一されたAPI呼び出し基盤関数
const callZaicoApi = async (endpoint, method = 'GET', data = null) => {
  try {
    const url = `${ZAICO_API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }
    
    console.log(`=== Zaico API呼び出し (統合クライアント) ===`);
    console.log(`${method} ${url}`);
    if (data) console.log('送信データ:', data);
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { error: errorText };
      }
      
      console.error('Zaico API エラーレスポンス:', errorData);
      throw new Error(errorData.error?.message || errorData.message || errorData.error || `HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Zaico API応答:', result);
    
    // 標準化されたレスポンスフォーマットから実際のデータを取得
    if (result.success && result.data) {
      return result.data;
    }
    
    return result;
    
  } catch (error) {
    console.error('Zaico API呼び出しエラー:', error);
    throw error;
  }
};

// 統一された Zaico クライアントオブジェクト
export const zaicoClient = {
  // 在庫関連
  getInventories: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `/inventories?${queryString}` : '/inventories';
    return await callZaicoApi(endpoint);
  },

  getInventory: async (id) => {
    return await callZaicoApi(`/inventories/${id}`);
  },

  createInventory: async (inventoryData) => {
    return await callZaicoApi('/inventories', 'POST', inventoryData);
  },

  updateInventory: async (id, inventoryData) => {
    return await callZaicoApi(`/inventories/${id}`, 'PUT', inventoryData);
  },

  deleteInventory: async (id) => {
    return await callZaicoApi(`/inventories/${id}`, 'DELETE');
  },

  // 入庫関連
  getPurchases: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `/purchases?${queryString}` : '/purchases';
    return await callZaicoApi(endpoint);
  },

  createPurchase: async (purchaseData) => {
    return await callZaicoApi('/purchases', 'POST', purchaseData);
  },

  // 出庫関連
  getPackingSlips: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = queryString ? `/packing_slips?${queryString}` : '/packing_slips';
    return await callZaicoApi(endpoint);
  },

  getPackingSlip: async (id) => {
    return await callZaicoApi(`/packing_slips/${id}`);
  },

  createPackingSlip: async (packingSlipData) => {
    return await callZaicoApi('/packing_slips', 'POST', packingSlipData);
  },

  getPackingSlipItems: async (packingSlipId) => {
    return await callZaicoApi(`/packing_slips/${packingSlipId}/items`);
  },

  // ページネーション対応の全件取得
  getAllInventories: async (maxPages = Infinity) => {
    const allInventories = [];
    let currentPage = 1;
    let hasNextPage = true;

    while (hasNextPage && currentPage <= maxPages) {
      console.log(`ページ ${currentPage} を取得中...`);
      
      const result = await zaicoClient.getInventories({ 
        page: currentPage, 
        per_page: 1000 
      });
      
      const inventories = Array.isArray(result.data) ? result.data : (Array.isArray(result) ? result : []);
      
      if (inventories.length > 0) {
        allInventories.push(...inventories);
        console.log(`ページ ${currentPage}: ${inventories.length}件取得`);
      }
      
      // 次のページがあるかチェック
      hasNextPage = inventories.length >= 1000 && currentPage < maxPages;
      currentPage++;
      
      // API負荷軽減のための待機
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    console.log(`総取得数: ${allInventories.length}件、取得ページ数: ${currentPage - 1}ページ`);
    return allInventories;
  }
};

// プロジェクトデータをZaico形式に変換する統一関数
export const convertProjectToZaico = (projectItem) => {
  console.log('=== zaico変換前のデータ ===');
  console.log('projectItem:', projectItem);

  const zaicoData = {
    title: projectItem.title || projectItem.consoleLabel || projectItem.softwareName || 'ゲーム商品',
    quantity: String(projectItem.quantity || 0),
    category: projectItem.category || 'ゲーム機',
    state: projectItem.condition || 'S',
    place: projectItem.location || 'ZAICO倉庫',
    etc: projectItem.notes || '',
    optional_attributes: [
      {
        name: '仕入単価',
        value: String(projectItem.acquisitionPrice || projectItem.buybackPrice || 0)
      },
      {
        name: '買取単価',
        value: String(projectItem.buybackPrice || 0)
      },
      {
        name: '査定ランク',
        value: projectItem.assessedRank || '未評価'
      },
      {
        name: '管理番号',
        value: (projectItem.managementNumbers || []).join(', ')
      },
      {
        name: '登録日',
        value: projectItem.registeredDate || new Date().toISOString().split('T')[0]
      }
    ]
  };

  console.log('=== zaico変換後のデータ ===');
  console.log('zaicoData:', zaicoData);

  return zaicoData;
};

// Zaicoデータをプロジェクト形式に変換
export const convertZaicoToProject = (zaicoItem) => {
  return {
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
    buybackPrice: 0,
    acquisitionPrice: 0,
    registeredDate: new Date().toISOString(),
    colorLabel: '',
    managementNumbers: [`ZAICO-${zaicoItem.id}`],
    notes: `Zaicoから同期: ${zaicoItem.memo || ''}`,
    createdAt: new Date().toISOString()
  };
};

// ===== 既存のzaicoApi.jsとの完全互換性を維持するエクスポート =====
// callZaicoApi関数は既に定義済みなので、そのままエクスポート

// 高レベル操作関数（既存のzaicoApi.jsとの互換性維持）
export const createInventoryInZaico = async (projectItem) => {
  try {
    console.log('=== zaico在庫データ作成開始 ===');
    console.log('projectItem:', projectItem);

    const zaicoData = convertProjectToZaico(projectItem);
    const inventoryResult = await zaicoClient.createInventory(zaicoData);
    
    console.log('在庫データ作成結果:', inventoryResult);
    const createdInventoryId = inventoryResult?.data_id ?? inventoryResult?.id;
    if (!createdInventoryId) {
      throw new Error('在庫データの作成に失敗しました（idが取得できません）');
    }

    // プロジェクトの在庫データにzaicoIdを保存
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    const inventoryIndex = inventoryData.findIndex(inv => inv.id === projectItem.id);
    if (inventoryIndex !== -1) {
      inventoryData[inventoryIndex].zaicoId = createdInventoryId;
      localStorage.setItem('inventory', JSON.stringify(inventoryData));
      console.log('zaicoIdを在庫データに保存:', createdInventoryId);
    }

    return {
      inventory: inventoryResult,
      purchase: null
    };
  } catch (error) {
    console.error('zaico在庫データ作成エラー:', error);
    throw error;
  }
};

export const createPurchaseInZaico = async (projectItem) => {
  try {
    console.log('=== zaico入庫データ作成開始 ===');
    console.log('projectItem:', projectItem);

    // まず在庫データを作成
    const inventoryResult = await createInventoryInZaico(projectItem);
    const createdInventoryId = inventoryResult.inventory?.data_id ?? inventoryResult.inventory?.id;

    // 入庫データ作成は一時的にスキップ（互換性のため）
    const purchaseResult = { 
      success: true, 
      message: '入庫データ作成を一時的にスキップ',
      data_id: 'skipped'
    };

    return {
      inventory: inventoryResult.inventory,
      purchase: purchaseResult
    };
  } catch (error) {
    console.error('zaico入庫データ作成エラー:', error);
    throw error;
  }
};

export const updateInventoryInZaico = async (projectItem) => {
  try {
    if (!projectItem.zaicoId) {
      throw new Error('zaicoIdが設定されていません');
    }

    const zaicoData = convertProjectToZaico(projectItem);
    const result = await zaicoClient.updateInventory(projectItem.zaicoId, zaicoData);
    return result;
  } catch (error) {
    console.error('zaico在庫データ更新エラー:', error);
    throw error;
  }
};

export const getInventoriesFromZaico = async (maxPages = Infinity) => {
  try {
    return await zaicoClient.getAllInventories(maxPages);
  } catch (error) {
    console.error('zaico在庫データ取得エラー:', error);
    throw error;
  }
};

export const getPackingSlipsFromZaico = async (page = 1) => {
  try {
    const result = await zaicoClient.getPackingSlips({ page });
    return result;
  } catch (error) {
    console.error('zaico出庫データ取得エラー:', error);
    throw error;
  }
};

export const getOutboundItemsFromZaico = async (page = 1, startDate = null, endDate = null) => {
  try {
    console.log('=== zaico出庫物品データ取得開始 ===');
    console.log('取得期間:', startDate, '〜', endDate);
    
    const params = { page };
    if (startDate && endDate) {
      params.start_date = startDate;
      params.end_date = endDate;
    }
    
    const result = await zaicoClient.getPackingSlips(params);
    console.log('zaico出庫物品データ取得結果:', result);
    
    // packing_slipsのレスポンスをdeliveries形式に変換
    const packingSlips = result.data || result;
    const allDeliveries = [];
    
    packingSlips.forEach(packingSlip => {
      if (packingSlip.deliveries && Array.isArray(packingSlip.deliveries)) {
        packingSlip.deliveries.forEach(delivery => {
          allDeliveries.push({
            ...delivery,
            customer_name: packingSlip.customer_name,
            packing_slip_id: packingSlip.id,
            packing_slip_num: packingSlip.num,
            packing_slip_status: packingSlip.status,
            packing_slip_delivery_date: packingSlip.delivery_date,
            packing_slip_memo: packingSlip.memo
          });
        });
      }
    });
    
    // 日付フィルタリング
    let filteredDeliveries = allDeliveries;
    if (startDate && endDate) {
      filteredDeliveries = allDeliveries.filter(delivery => {
        const deliveryDate = delivery.delivery_date || delivery.packing_slip_delivery_date;
        if (!deliveryDate) return false;
        
        const date = new Date(deliveryDate);
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        return date >= start && date <= end;
      });
    }
    
    console.log('変換後の出庫物品データ:', filteredDeliveries);
    return filteredDeliveries;
  } catch (error) {
    console.error('zaico出庫物品データ取得エラー:', error);
    throw error;
  }
};

export const createOutboundItemInZaico = async (saleData) => {
  try {
    console.log('=== zaico出庫データ作成開始 ===');
    console.log('saleData:', saleData);

    await new Promise(resolve => setTimeout(resolve, 100));

    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    console.log('取得した在庫データ数:', inventoryData.length);
    let targetInventory = null;

    if (saleData.inventoryId) {
      targetInventory = inventoryData.find(inv => inv.id === saleData.inventoryId);
    }
    if (!targetInventory) {
      targetInventory = inventoryData.find(inv =>
        inv.title === saleData.title ||
        inv.consoleLabel === saleData.title ||
        inv.softwareName === saleData.title
      );
    }

    if (!targetInventory) {
      console.warn('対応する在庫データが見つかりません。出庫をスキップします。');
      return { success: false, message: '対応する在庫データが見つかりません' };
    }

    if (!targetInventory.zaicoId) {
      console.warn('在庫データにzaicoIdが設定されていません。出庫をスキップします。');
      return { success: false, message: '在庫データにzaicoIdが設定されていません' };
    }

    const zaicoInventoryId = targetInventory.zaicoId;
    console.log('対象在庫のzaicoId:', zaicoInventoryId);

    const packingSlipData = {
      num: `SLIP-${Date.now()}`,
      customer_name: saleData.customerName || saleData.buyerName || '顧客',
      status: 'completed_delivery',
      delivery_date: new Date().toISOString().split('T')[0],
      memo: `${saleData.salesChannel || '販売'}: ${saleData.title} | 査定ランク: ${targetInventory.assessedRank || ''} | 担当者: ${saleData.performedBy || ''} | 販売チャネル: ${saleData.salesChannel || '販売'}${saleData.shippingCountry ? ` | 配送先国: ${saleData.shippingCountry}` : ''} | 配送料: ${saleData.shippingFee || 0}`,
      deliveries: [
        {
          inventory_id: zaicoInventoryId,
          quantity: Number(saleData.quantity) || 1,
          unit_price: Number(saleData.salePrice) || 0,
          estimated_delivery_date: saleData.estimatedDeliveryDate || undefined,
          etc: saleData.itemMemo || undefined
        }
      ]
    };

    console.log('=== zaico出庫データ送信 ===');
    console.log('packingSlipData:', packingSlipData);

    const result = await zaicoClient.createPackingSlip(packingSlipData);

    console.log('=== zaico出庫登録成功 ===');
    console.log('出庫データ作成結果:', result);

    return result;
  } catch (error) {
    console.error('zaico出庫登録エラー:', error);
    throw error;
  }
};

// 後方互換性のためのエクスポート
export const getOutboundItemDetailsFromZaico = async (packingSlipId) => {
  try {
    return await zaicoClient.getPackingSlipItems(packingSlipId);
  } catch (error) {
    console.error('zaico出庫物品詳細データ取得エラー:', error);
    return [];
  }
};

export const getStocktakeHistoryFromZaico = async (inventoryId) => {
  console.warn('getStocktakeHistoryFromZaico は廃止されました。Zaico APIの制限により利用できません。');
  return null;
};

// リトライ機能付きのAPI呼び出し
export const callZaicoApiWithRetry = async (endpoint, method = 'GET', data = null, maxRetries = 3) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await callZaicoApi(endpoint, method, data);
    } catch (error) {
      lastError = error;
      console.warn(`zaico API呼び出し失敗 (${i + 1}/${maxRetries}):`, error);
      
      if (i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};

// 同期活動をログに記録
export const logSyncActivity = (action, status, details = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    action,
    status,
    details
  };
  
  console.log('zaico同期ログ:', logEntry);
  
  const existingLogs = JSON.parse(localStorage.getItem('zaicoSyncLogs') || '[]');
  existingLogs.push(logEntry);
  
  if (existingLogs.length > 100) {
    existingLogs.splice(0, existingLogs.length - 100);
  }
  
  localStorage.setItem('zaicoSyncLogs', JSON.stringify(existingLogs));
};

// デフォルトエクスポート（統合クライアント）
export default {
  ...zaicoClient,
  // 高レベル操作関数
  createInventoryInZaico,
  createPurchaseInZaico,
  updateInventoryInZaico,
  getInventoriesFromZaico,
  getPackingSlipsFromZaico,
  getOutboundItemsFromZaico,
  createOutboundItemInZaico,
  getOutboundItemDetailsFromZaico,
  getStocktakeHistoryFromZaico,
  callZaicoApiWithRetry,
  logSyncActivity,
  // ユーティリティ関数
  convertProjectToZaico,
  convertZaicoToProject
};