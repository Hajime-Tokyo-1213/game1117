import React, { useState, useEffect } from 'react';
import { 
  getOutboundItemsFromZaico, 
  getOutboundItemDetailsFromZaico,
  logSyncActivity 
} from '../utils/zaicoApi';
import { syncExistingInventoryWithZaico, syncZaicoToProject, checkInventoryZaicoIds } from '../utils/zaicoSyncHelper';
import { clearProjectInventory, clearZaicoInventory, clearAllData, confirmDataClear } from '../utils/dataCleaner';
import './ZaicoSyncManager.css';

const ZaicoSyncManager = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState('');
  const [syncLogs, setSyncLogs] = useState([]);
  
  // 自動同期用の状態
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  
  // 日本時間で今日の日付を取得（YYYY-MM-DD形式）
  const getTodayStringJST = () => {
    const now = new Date();
    // 日本時間に変換（UTC+9時間）
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstTime = new Date(now.getTime() + jstOffset);
    const year = jstTime.getUTCFullYear();
    const month = String(jstTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // 日本時間で1ヶ月前の日付を取得（YYYY-MM-DD形式）
  const getOneMonthAgoStringJST = () => {
    const now = new Date();
    // 日本時間に変換（UTC+9時間）
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstTime = new Date(now.getTime() + jstOffset);
    
    // 1ヶ月前を計算
    const oneMonthAgo = new Date(jstTime);
    oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1);
    
    const year = oneMonthAgo.getUTCFullYear();
    const month = String(oneMonthAgo.getUTCMonth() + 1).padStart(2, '0');
    const day = String(oneMonthAgo.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // 出庫同期用の日付範囲
  const [syncDateRange, setSyncDateRange] = useState({
    startDate: getTodayStringJST(),
    endDate: getTodayStringJST()
  });
  
  // 在庫同期用の日付範囲（デフォルト: 1ヶ月前〜今日）
  const [inventoryDateRange, setInventoryDateRange] = useState({
    startDate: getOneMonthAgoStringJST(),
    endDate: getTodayStringJST()
  });

  // ログを読み込む関数
  const loadSyncLogs = () => {
    const logs = JSON.parse(localStorage.getItem('zaicoSyncLogs') || '[]');
    setSyncLogs(logs.slice(-10)); // 最新10件のみ表示
  };

  // 最終同期日時を取得
  useEffect(() => {
    const lastSync = localStorage.getItem('zaicoLastSyncTime');
    if (lastSync) {
      setLastSyncTime(new Date(lastSync).toLocaleString('ja-JP'));
    }
    
    // 同期ログを取得
    loadSyncLogs();
  }, []);

  // 出庫データの増分同期
  const handleSyncOutboundItems = async () => {
    setIsLoading(true);
    setSyncStatus('同期処理中...');
    
    try {
      // 前回同期日時を取得
      const lastSyncTime = localStorage.getItem('zaicoLastSyncTime');
      const lastSyncDate = lastSyncTime ? new Date(lastSyncTime) : new Date(0);
      
      // zaicoから出庫データを取得
      const outboundItems = await getOutboundItemsFromZaico();
      console.log('取得した出庫データ:', outboundItems);
      
      // 前回同期以降のデータをフィルタリング
      const newOutboundItems = outboundItems.filter(item => {
        const itemDate = new Date(item.created_at || item.updated_at);
        return itemDate > lastSyncDate;
      });
      
      console.log('新規出庫データ:', newOutboundItems);
      
      let syncCount = 0;
      let errorCount = 0;
      
      // 各出庫データを処理
      console.log('=== 出庫データ処理開始 ===');
      console.log('処理対象の出庫データ数:', newOutboundItems.length);
      
      for (const outboundItem of newOutboundItems) {
        try {
          console.log('処理中の出庫データ:', outboundItem);
          
          // 出庫番号で対応する注文を特定
          const salesRequests = JSON.parse(localStorage.getItem('salesRequests') || '[]');
          console.log('現在の販売依頼数:', salesRequests.length);
          
          const matchingRequest = salesRequests.find(request => 
            request.trackingNumber === outboundItem.code ||
            request.requestNumber === outboundItem.code
          );
          
          console.log('マッチした注文:', matchingRequest);
          
          if (matchingRequest) {
            // ステータスを「発送済み」に更新
            const updatedRequests = salesRequests.map(req => 
              req.requestNumber === matchingRequest.requestNumber
                ? { ...req, status: 'shipped', shippedDate: outboundItem.outbound_date }
                : req
            );
            localStorage.setItem('salesRequests', JSON.stringify(updatedRequests));
            syncCount++;
            console.log('ステータス更新完了:', matchingRequest.requestNumber);
          } else {
            console.log('対応する注文が見つかりません:', outboundItem.code);
          }
        } catch (error) {
          console.error('出庫データ処理エラー:', error);
          errorCount++;
        }
      }
      
      // 最終同期日時を更新
      localStorage.setItem('zaicoLastSyncTime', new Date().toISOString());
      setLastSyncTime(new Date().toLocaleString('ja-JP'));
      
      const statusMessage = `出庫データ同期完了: ${syncCount}件更新, ${errorCount}件エラー`;
      setSyncStatus(statusMessage);
      logSyncActivity('outbound_sync', 'success', { syncCount, errorCount });
      loadSyncLogs(); // ログを即座に更新
      
    } catch (error) {
      setSyncStatus(`同期エラー: ${error.message}`);
      logSyncActivity('outbound_sync', 'error', { error: error.message });
      loadSyncLogs(); // ログを即座に更新
    } finally {
      setIsLoading(false);
    }
  };

  // 既存在庫をZaicoと同期
  const handleSyncExistingInventory = async () => {
    setIsLoading(true);
    setSyncStatus('既存在庫同期中...');
    
    try {
      const result = await syncExistingInventoryWithZaico();
      if (result.success) {
        const metaUpdates = result.metadataUpdateCount || 0;
        setSyncStatus(`既存在庫同期完了: zaicoId設定${result.syncCount}件, 作成日補完${metaUpdates}件`);
        logSyncActivity('existing_inventory_sync', 'success', { syncCount: result.syncCount, metadataUpdateCount: metaUpdates });
        loadSyncLogs(); // ログを即座に更新
      } else {
        setSyncStatus(`既存在庫同期エラー: ${result.error}`);
        logSyncActivity('existing_inventory_sync', 'error', { error: result.error });
        loadSyncLogs(); // ログを即座に更新
      }
    } catch (error) {
      setSyncStatus(`既存在庫同期エラー: ${error.message}`);
      logSyncActivity('existing_inventory_sync', 'error', { error: error.message });
      loadSyncLogs(); // ログを即座に更新
    } finally {
      setIsLoading(false);
    }
  };

  // Zaico → プロジェクト同期（全件）
  const handleSyncZaicoToProject = async () => {
    setIsLoading(true);
    setSyncStatus('Zaico → プロジェクト同期中...');
    
    try {
      const result = await syncZaicoToProject();
      if (result.success) {
        const statusMessage = `Zaico → プロジェクト同期完了: ${result.syncCount}件追加, ${result.skippedCount || 0}件スキップ, ${result.deletedCount || 0}件削除（フィルタ後: ${result.filteredCount || 0}件、総数: ${result.totalCount}件）`;
        setSyncStatus(statusMessage);
        logSyncActivity('zaico_to_project_sync', 'success', { 
          syncCount: result.syncCount,
          skippedCount: result.skippedCount || 0,
          deletedCount: result.deletedCount || 0,
          totalCount: result.totalCount,
          filteredCount: result.filteredCount || 0
        });
        loadSyncLogs(); // ログを即座に更新
      } else {
        setSyncStatus(`Zaico → プロジェクト同期エラー: ${result.error}`);
        logSyncActivity('zaico_to_project_sync', 'error', { error: result.error });
        loadSyncLogs(); // ログを即座に更新
      }
    } catch (error) {
      setSyncStatus(`Zaico → プロジェクト同期エラー: ${error.message}`);
      logSyncActivity('zaico_to_project_sync', 'error', { error: error.message });
      loadSyncLogs(); // ログを即座に更新
    } finally {
      setIsLoading(false);
    }
  };

  // Zaico → プロジェクト同期（日付範囲指定）
  const handleSyncZaicoToProjectWithDateRange = async () => {
    if (!inventoryDateRange.startDate || !inventoryDateRange.endDate) {
      alert('開始日と終了日を入力してください');
      return;
    }

    setIsLoading(true);
    setSyncStatus(`Zaico → プロジェクト同期中（${inventoryDateRange.startDate} 〜 ${inventoryDateRange.endDate}）...`);
    
    try {
      const result = await syncZaicoToProject(inventoryDateRange);
      if (result.success) {
        const statusMessage = `Zaico → プロジェクト同期完了（日付範囲: ${inventoryDateRange.startDate} 〜 ${inventoryDateRange.endDate}）: ${result.syncCount}件追加, ${result.skippedCount || 0}件スキップ, ${result.deletedCount || 0}件削除（フィルタ後: ${result.filteredCount || 0}件、総数: ${result.totalCount}件）`;
        setSyncStatus(statusMessage);
        logSyncActivity('zaico_to_project_sync_daterange', 'success', { 
          syncCount: result.syncCount,
          skippedCount: result.skippedCount || 0,
          deletedCount: result.deletedCount || 0,
          totalCount: result.totalCount,
          filteredCount: result.filteredCount || 0,
          dateRange: `${inventoryDateRange.startDate} 〜 ${inventoryDateRange.endDate}`
        });
        loadSyncLogs(); // ログを即座に更新
      } else {
        setSyncStatus(`Zaico → プロジェクト同期エラー: ${result.error}`);
        logSyncActivity('zaico_to_project_sync_daterange', 'error', { error: result.error });
        loadSyncLogs(); // ログを即座に更新
      }
    } catch (error) {
      setSyncStatus(`Zaico → プロジェクト同期エラー: ${error.message}`);
      logSyncActivity('zaico_to_project_sync_daterange', 'error', { error: error.message });
      loadSyncLogs(); // ログを即座に更新
    } finally {
      setIsLoading(false);
    }
  };

  // Zaico出庫同期（販売記録作成）
  const handleZaicoOutboundSync = async () => {
    if (!syncDateRange.startDate || !syncDateRange.endDate) {
      alert('開始日と終了日を入力してください');
      return;
    }

    setIsLoading(true);
    setSyncStatus('Zaico出庫同期中...');
    
    try {
      console.log('=== Zaico出庫同期開始 ===');
      console.log('同期期間:', syncDateRange.startDate, '〜', syncDateRange.endDate);
      
      // 1. Zaicoから出庫データを取得
      const outboundItems = await getOutboundItemsFromZaico(1, syncDateRange.startDate, syncDateRange.endDate);
      console.log('取得した出庫データ:', outboundItems);
      
      if (!outboundItems || outboundItems.length === 0) {
        setSyncStatus('同期対象の出庫データがありません');
        return;
      }
      
      // 2. プロジェクト在庫データを取得
      const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
      const salesHistory = JSON.parse(localStorage.getItem('salesHistory') || '[]');
      
      let syncCount = 0;
      let errorCount = 0;
      
      // 3. 重複を避けるため、既に処理済みの出庫物品を追跡
      const processedItems = new Set();
      const processedCombinations = new Set();
      
      // 各出庫物品データを処理
      for (const item of outboundItems) {
        try {
          // 重複チェック（より厳密）- 商品名、価格、日付、顧客名の組み合わせで判定
          const itemKey = `${item.packing_slip_id}-${item.inventory_id}`;
          const combinationKey = `${item.title}-${item.unit_price}-${item.delivery_date}-${item.customer_name || item.buyer_name || item.recipient_name || 'Zaico同期'}`;
          
          if (processedItems.has(itemKey) || processedCombinations.has(combinationKey)) {
            console.log('重複スキップ:', itemKey, combinationKey);
            continue;
          }
          processedItems.add(itemKey);
          processedCombinations.add(combinationKey);
          
          console.log('=== 出庫物品データ詳細 ===');
          console.log('item:', item);
          console.log('item.packing_slip_id:', item.packing_slip_id);
          console.log('item.inventory_id:', item.inventory_id);
          console.log('item.title:', item.title);
          console.log('item.quantity:', item.quantity);
          console.log('item.unit_price:', item.unit_price);
          console.log('item.status:', item.status);
          console.log('item.delivery_date:', item.delivery_date);
          console.log('item.customer_name:', item.customer_name);
          console.log('item.buyer_name:', item.buyer_name);
          console.log('item.recipient_name:', item.recipient_name);
          
          // 4. プロジェクト在庫とマッチング
          console.log('=== 在庫マッチング開始 ===');
          console.log('プロジェクト在庫数:', inventoryData.length);
          console.log('プロジェクト在庫サンプル:', inventoryData.slice(0, 3).map(inv => ({
            id: inv.id,
            title: inv.title,
            consoleLabel: inv.consoleLabel,
            zaicoId: inv.zaicoId
          })));
          
          const matchingInventory = inventoryData.find(inv => {
            const zaicoIdMatch = inv.zaicoId === item.inventory_id;
            const titleMatch = inv.title === item.title;
            const consoleLabelMatch = inv.consoleLabel === item.title;
            
            console.log(`在庫 ${inv.id} マッチング結果:`, {
              zaicoIdMatch,
              titleMatch,
              consoleLabelMatch,
              invZaicoId: inv.zaicoId,
              outboundInventoryId: item.inventory_id,
              invTitle: inv.title,
              outboundTitle: item.title
            });
            
            return zaicoIdMatch || titleMatch || consoleLabelMatch;
          });
          
          console.log('マッチング結果:', matchingInventory ? '見つかった' : '見つからない');
          
          if (matchingInventory) {
            // 5. 販売記録を作成
            // 顧客名を取得（複数のフィールドから確認）
            const customerName = item.customer_name || item.buyer_name || item.recipient_name || 'Zaico同期';
            
            const saleRecord = {
              id: `SALE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              inventoryItemId: matchingInventory.id,
              productType: matchingInventory.productType,
              manufacturer: matchingInventory.manufacturer,
              manufacturerLabel: matchingInventory.manufacturerLabel,
              console: matchingInventory.console,
              consoleLabel: matchingInventory.consoleLabel,
              color: matchingInventory.color,
              colorLabel: matchingInventory.colorLabel,
              softwareName: matchingInventory.softwareName,
              assessedRank: matchingInventory.assessedRank,
              quantity: item.quantity || 1,
              acquisitionPrice: matchingInventory.acquisitionPrice || matchingInventory.buybackPrice,
              soldPrice: item.unit_price || matchingInventory.buybackPrice,
              shippingFee: 0,
              profit: (item.unit_price || matchingInventory.buybackPrice) - (matchingInventory.acquisitionPrice || matchingInventory.buybackPrice),
              salesChannel: 'zaico_sync',
              ebayRecordNumber: null,
              soldTo: customerName,
              soldAt: item.delivery_date || new Date().toISOString(),
              managementNumbers: matchingInventory.managementNumbers?.slice(0, item.quantity || 1) || []
            };
            
            // 6. 在庫数量を減らす
            if (matchingInventory.quantity >= item.quantity) {
              matchingInventory.quantity -= item.quantity;
              console.log('在庫数量を減らしました:', {
                before: matchingInventory.quantity + item.quantity,
                after: matchingInventory.quantity,
                reduced: item.quantity
              });
            } else {
              console.warn('在庫数量不足:', {
                available: matchingInventory.quantity,
                requested: item.quantity
              });
            }
            
            // 7. 古物台帳に記録（Zaico出庫同期用 - 販売情報のみ）
            const ledgerEntry = {
              id: `LEDGER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              date: new Date().toISOString().split('T')[0],
              type: 'sale',
              productType: matchingInventory.productType,
              manufacturer: matchingInventory.manufacturer,
              manufacturerLabel: matchingInventory.manufacturerLabel,
              console: matchingInventory.console,
              consoleLabel: matchingInventory.consoleLabel,
              color: matchingInventory.color,
              colorLabel: matchingInventory.colorLabel,
              softwareName: matchingInventory.softwareName,
              assessedRank: matchingInventory.assessedRank,
              quantity: item.quantity,
              // Zaico出庫同期では代価、相手方氏名、相手方住所は表示しない
              price: '-', // 代価は表示しない
              customerName: '-', // 相手方氏名は表示しない
              customerAddress: '-', // 相手方住所は表示しない
              customerOccupation: '-',
              customerAge: '-',
              saleDate: new Date(item.delivery_date).toLocaleDateString('ja-JP'),
              salePrice: item.unit_price,
              buyer: customerName,
              status: 'sold',
              managementNumbers: matchingInventory.managementNumbers?.slice(0, item.quantity || 1) || []
            };
            
            // 古物台帳データを取得・更新（salesHistoryと同期）
            const ledgerData = JSON.parse(localStorage.getItem('ledger') || '[]');
            ledgerData.push(ledgerEntry);
            localStorage.setItem('ledger', JSON.stringify(ledgerData));
            
            console.log('古物台帳記録完了:', ledgerEntry.id);
            console.log('古物台帳記録詳細:', ledgerEntry);
            
            salesHistory.push(saleRecord);
            syncCount++;
            console.log('販売記録作成完了:', saleRecord.id);
            console.log('販売記録詳細:', saleRecord);
            console.log('古物台帳記録完了:', ledgerEntry.id);
            console.log('古物台帳記録詳細:', ledgerEntry);
          } else {
            console.warn('=== マッチング失敗 ===');
            console.warn('出庫データ:', {
              packing_slip_id: item.packing_slip_id,
              title: item.title,
              inventory_id: item.inventory_id
            });
            console.warn('利用可能な在庫データ:', inventoryData.map(inv => ({
              id: inv.id,
              title: inv.title,
              consoleLabel: inv.consoleLabel,
              zaicoId: inv.zaicoId
            })));
            errorCount++;
          }
        } catch (error) {
          console.error('出庫データ処理エラー:', error);
          errorCount++;
        }
      }
      
      // 6. 在庫データと販売履歴を保存
      localStorage.setItem('inventory', JSON.stringify(inventoryData));
      localStorage.setItem('salesHistory', JSON.stringify(salesHistory));
      
      const statusMessage = `Zaico出庫同期完了: ${syncCount}件の販売記録を作成, ${errorCount}件のエラー`;
      setSyncStatus(statusMessage);
      logSyncActivity('zaico_outbound_sync', 'success', { 
        syncCount, 
        errorCount,
        dateRange: `${syncDateRange.startDate} 〜 ${syncDateRange.endDate}`
      });
      loadSyncLogs(); // ログを即座に更新
      
      // 古物台帳の更新を通知
      console.log('=== 古物台帳更新通知 ===');
      console.log('同期完了: 古物台帳を再読み込みしてください');
      
      console.log('=== Zaico出庫同期完了 ===');
      console.log('同期件数:', syncCount, 'エラー件数:', errorCount);
      
    } catch (error) {
      setSyncStatus(`Zaico出庫同期エラー: ${error.message}`);
      logSyncActivity('zaico_outbound_sync', 'error', { error: error.message });
      loadSyncLogs(); // ログを即座に更新
      console.error('Zaico出庫同期エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 在庫データのzaicoId状況を確認
  const handleCheckInventoryStatus = () => {
    const status = checkInventoryZaicoIds();
    setSyncStatus(`在庫状況: 総数${status.total}件, zaicoId設定済み${status.withZaicoId}件, 未設定${status.withoutZaicoId}件`);
    logSyncActivity('inventory_status_check', 'success', status);
    loadSyncLogs(); // ログを即座に更新
  };

  // プロジェクトデータのみクリア
  const handleClearProjectData = () => {
    if (!confirm('プロジェクトのデータをクリアしますか？\n（Zaicoのデータは残ります）')) {
      return;
    }
    
    const result = clearProjectInventory();
    if (result.success) {
      setSyncStatus(result.message);
      logSyncActivity('project_data_clear', 'success', {});
      loadSyncLogs(); // ログを即座に更新
    } else {
      setSyncStatus(`データクリアエラー: ${result.error}`);
      logSyncActivity('project_data_clear', 'error', { error: result.error });
      loadSyncLogs(); // ログを即座に更新
    }
  };

  // データ状況を確認
  const handleCheckDataStatus = () => {
    const status = confirmDataClear();
    setSyncStatus(`データ状況: 在庫${status.inventory}件, 履歴${status.inventoryHistory}件, 販売台帳${status.salesLedger}件, 申請${status.allApplications}件, 同期ログ${status.zaicoSyncLogs}件`);
    logSyncActivity('data_status_check', 'success', status);
    loadSyncLogs(); // ログを即座に更新
  };

  // 同期ログをクリア
  const handleClearLogs = () => {
    localStorage.removeItem('zaicoSyncLogs');
    setSyncLogs([]);
    setSyncStatus('同期ログをクリアしました');
  };

  return (
    <div className="zaico-sync-manager">
      <h2>🔄 Zaico同期管理</h2>
      
      {/* ステータス表示 */}
      <div className="sync-status">
        <p><strong>ステータス:</strong> {syncStatus}</p>
        {lastSyncTime && <p><strong>最終同期:</strong> {lastSyncTime}</p>}
      </div>

      {/* メイン同期セクション - 横3列レイアウト */}
      <div className="sync-sections-grid">
        
        {/* 在庫同期セクション */}
        <div className="sync-section-card">
          <h3>📦 在庫同期</h3>
          <div className="sync-actions">
            <button 
              onClick={handleSyncZaicoToProject}
              disabled={isLoading}
              className="sync-button zaico-to-project"
            >
              Zaico → プロジェクト（全件）
            </button>
            <div className="date-range-inputs">
              <div className="input-group">
                <label>開始日:</label>
                <input
                  type="date"
                  value={inventoryDateRange.startDate}
                  onChange={(e) => setInventoryDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  disabled={isLoading}
                />
              </div>
              <div className="input-group">
                <label>終了日:</label>
                <input
                  type="date"
                  value={inventoryDateRange.endDate}
                  onChange={(e) => setInventoryDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  disabled={isLoading}
                />
              </div>
            </div>
            <button 
              onClick={handleSyncZaicoToProjectWithDateRange}
              disabled={isLoading || !inventoryDateRange.startDate || !inventoryDateRange.endDate}
              className="sync-button zaico-to-project-daterange"
            >
              📦 Zaico → プロジェクト（日付範囲指定）
            </button>
            <button 
              onClick={handleSyncExistingInventory}
              disabled={isLoading}
              className="sync-button"
              style={{ display: 'none' }}
            >
              既存在庫を同期
            </button>
          </div>
        </div>

        {/* 出庫同期セクション */}
        <div className="sync-section-card">
          <h3>🚚 出庫同期</h3>
          <div className="sync-actions">
            <button 
              onClick={handleSyncOutboundItems}
              disabled={isLoading}
              className="sync-button"
              style={{ display: 'none' }}
            >
              発送済み商品を同期
            </button>
            <div className="date-range-inputs">
              <div className="input-group">
                <label>開始日:</label>
                <input
                  type="date"
                  value={syncDateRange.startDate}
                  onChange={(e) => setSyncDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  disabled={isLoading}
                />
              </div>
              <div className="input-group">
                <label>終了日:</label>
                <input
                  type="date"
                  value={syncDateRange.endDate}
                  onChange={(e) => setSyncDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  disabled={isLoading}
                />
              </div>
            </div>
            <button 
              onClick={handleZaicoOutboundSync}
              disabled={isLoading || !syncDateRange.startDate || !syncDateRange.endDate}
              className="sync-button zaico-outbound"
            >
              📦 Zaico出庫同期
            </button>
          </div>
        </div>

        {/* 管理・確認セクション */}
        <div className="sync-section-card">
          <h3>🔧 管理・確認</h3>
          <div className="sync-actions">
            <button 
              onClick={handleCheckInventoryStatus}
              className="check-button"
            >
              在庫状況確認
            </button>
            <button 
              onClick={handleCheckDataStatus}
              className="check-button"
            >
              データ状況確認
            </button>
            <button 
              onClick={handleClearProjectData}
              className="clear-button"
            >
              プロジェクトデータクリア
            </button>
            <button 
              onClick={handleClearLogs}
              className="clear-button"
            >
              同期ログクリア
            </button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="loading">
          <p>処理中...</p>
        </div>
      )}

      {/* 同期履歴表示 - コンパクト版 */}
      <div className="sync-history-compact">
        <h3>📋 同期履歴</h3>
        
        <div className="history-grid">
          {/* 在庫同期履歴 */}
          <div className="history-section">
            <h4>📦 在庫同期</h4>
            <div className="history-items">
              {syncLogs
                .filter(log => log.action.includes('zaico_to_project_sync') || log.action.includes('existing_inventory_sync'))
                .slice(0, 2)
                .map((log, index) => (
                  <div key={index} className={`history-item ${log.status}`}>
                    <span className="history-type">
                      {log.action.includes('zaico_to_project_sync') ? 'Zaico → プロジェクト' : '既存在庫同期'}
                    </span>
                    <span className="history-time">
                      {new Date(log.timestamp).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`history-result ${log.status}`}>
                      {log.status === 'success' ? '✓' : '✗'}
                      {log.details?.count && ` ${log.details.count}件`}
                    </span>
                  </div>
                ))}
              {syncLogs.filter(log => log.action.includes('zaico_to_project_sync') || log.action.includes('existing_inventory_sync')).length === 0 && (
                <div className="no-history">履歴なし</div>
              )}
            </div>
          </div>

          {/* 出庫同期履歴 */}
          <div className="history-section">
            <h4>🚚 出庫同期</h4>
            <div className="history-items">
              {syncLogs
                .filter(log => log.action.includes('outbound') || log.action.includes('出庫') || log.action.includes('発送'))
                .slice(0, 2)
                .map((log, index) => (
                  <div key={index} className={`history-item ${log.status}`}>
                    <span className="history-type">
                      {log.action.includes('Zaico') ? 'Zaico → プロジェクト' : 'プロジェクト → Zaico'}
                    </span>
                    <span className="history-time">
                      {new Date(log.timestamp).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`history-result ${log.status}`}>
                      {log.status === 'success' ? '✓' : '✗'}
                      {log.details?.count && ` ${log.details.count}件`}
                    </span>
                  </div>
                ))}
              {syncLogs.filter(log => log.action.includes('outbound') || log.action.includes('出庫') || log.action.includes('発送')).length === 0 && (
                <div className="no-history">履歴なし</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZaicoSyncManager;
