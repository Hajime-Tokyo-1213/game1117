import React, { useState, useEffect } from 'react';
import { manufacturers, colors, conditions } from '../data/gameConsoles';
import { getAllConsoles } from '../utils/productMaster';
import { searchEbaySalesRecord } from '../utils/googleSheetsApi';
import { recordLedgerSale } from '../utils/ledgerRecords';
import { GOOGLE_SHEETS_CONFIG } from '../config/googleSheets';
import './Inventory.css';

const Inventory = () => {
  const [inventory, setInventory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // ページネーション関連
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showInStockOnly, setShowInStockOnly] = useState(false);
  
  // 表示モード
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'detail'
  const [selectedItem, setSelectedItem] = useState(null);
  
  // eBay販売フォーム
  const [showSalesForm, setShowSalesForm] = useState(false);
  const [salesFormData, setSalesFormData] = useState({
    salesChannel: 'direct', // 'direct' or 'ebay'
    ebayRecordNumber: '',
    buyerName: '',
    soldPrice: 0,
    shippingFee: 0,
    quantity: 1,
    performedBy: ''
  });
  
  // 在庫追加モーダル関連
  const [showAddModal, setShowAddModal] = useState(false);
  const [sourceType, setSourceType] = useState(null); // null, 'customer', 'supplier'
  const [availableConsoles, setAvailableConsoles] = useState([]);
  const [allGameConsoles, setAllGameConsoles] = useState({});
  
  // フォームデータ
  const [formData, setFormData] = useState({
    productType: 'console',
    manufacturer: '',
    console: '',
    color: '',
    softwareName: '',
    condition: '',
    assessedRank: '',
    quantity: 1,
    acquisitionPrice: 0,
    // 顧客買取の場合
    customerName: '',
    customerEmail: '',
    // 業者仕入れの場合
    supplierName: '',
    invoiceNumber: '',
    // 共通
    notes: ''
  });

  // 在庫データを読み込み
  useEffect(() => {
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    setInventory(inventoryData);
    setAllGameConsoles(getAllConsoles());
  }, []);

  // eBay販売記録の自動入力機能
  const handleEbayRecordSearch = async () => {
    if (!salesFormData.ebayRecordNumber.trim()) {
      alert('eBay販売記録番号を入力してください');
      return;
    }

    try {
      console.log('=== eBay販売記録検索開始 ===');
      console.log('検索番号:', salesFormData.ebayRecordNumber);
      
      const record = await searchEbaySalesRecord(salesFormData.ebayRecordNumber);
      
      if (record) {
        // 販売フォームに自動入力
        setSalesFormData(prev => ({
          ...prev,
          buyerName: record.customerName,
          soldPrice: record.price,
          quantity: record.quantity
        }));
        
        console.log('eBay販売記録を自動入力しました:', record);
        alert(`✅ eBay販売記録を取得しました\n商品名: ${record.productName}\n価格: ¥${record.price.toLocaleString()}\n顧客名: ${record.customerName}`);
      } else {
        alert('❌ 該当するeBay販売記録が見つかりませんでした');
      }
    } catch (error) {
      console.error('eBay販売記録検索エラー:', error);
      
      // エラーメッセージを詳細に表示
      let errorMessage = `❌ eBay販売記録の取得に失敗しました\n\n`;
      
      if (error.message.includes('スプレッドシートが見つかりません')) {
        errorMessage += `🔍 問題: スプレッドシートが見つかりません\n`;
        errorMessage += `📋 解決方法: スプレッドシートIDを確認してください\n`;
        errorMessage += `🔗 現在のID: ${GOOGLE_SHEETS_CONFIG.SPREADSHEET_ID}`;
      } else if (error.message.includes('APIキーが無効')) {
        errorMessage += `🔑 問題: APIキーが無効またはアクセス権限がありません\n`;
        errorMessage += `📋 解決方法: Google Cloud ConsoleでAPIキーを確認してください`;
      } else if (error.message.includes('接続できません')) {
        errorMessage += `🌐 問題: Google Sheets APIに接続できません\n`;
        errorMessage += `📋 解決方法: インターネット接続とAPIキーを確認してください`;
      } else {
        errorMessage += `📋 エラー詳細: ${error.message}`;
      }
      
      alert(errorMessage);
    }
  };

  const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const totalValue = inventory.reduce((sum, item) => sum + (item.buybackPrice * item.quantity), 0);
  const averagePrice = totalItems > 0 ? Math.round(totalValue / totalItems) : 0;

  // フィルタリング
  const filteredInventory = inventory.filter(item => {
    // 商品名検索（機種名、ソフト名、カラー、管理番号を含む）
    const managementNumbersText = item.managementNumbers ? item.managementNumbers.join(' ') : '';
    const searchText = `${item.consoleLabel || ''} ${item.softwareName || ''} ${item.colorLabel || ''} ${managementNumbersText}`.toLowerCase();
    const matchesSearch = searchText.includes(searchTerm.toLowerCase());
    
    // 商品タイプフィルター
    const matchesProductType = !productTypeFilter || item.productType === productTypeFilter;
    
    // メーカーフィルター
    const matchesManufacturer = !manufacturerFilter || item.manufacturer === manufacturerFilter;
    
    // ランクフィルター
    const matchesRank = !rankFilter || item.assessedRank === rankFilter;
    
    // ステータスフィルター
    const itemStatus = item.status || 'in_stock';
    const matchesStatus = !statusFilter || itemStatus === statusFilter;
    
    // 在庫ありのみフィルター
    const hasStock = item.quantity > 0;
    const matchesStockFilter = !showInStockOnly || hasStock;
    
    return matchesSearch && matchesProductType && matchesManufacturer && matchesRank && matchesStatus && matchesStockFilter;
  });

  // ページネーション計算
  const totalPages = Math.ceil(filteredInventory.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedInventory = filteredInventory.slice(startIndex, endIndex);

  // ページ変更時の処理
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    // ページ変更時にスクロールをトップに戻す
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ページサイズ変更時の処理
  const handlePageSizeChange = (newPageSize) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // ページサイズ変更時は1ページ目に戻る
  };

  // スマートページネーション: 表示するページ番号のリストを生成
  const getPaginationPages = () => {
    const pages = [];
    const maxVisiblePages = 7; // 表示する最大ページ数
    const sidePages = 2; // 現在ページの前後に表示するページ数

    if (totalPages <= maxVisiblePages) {
      // ページ数が少ない場合は全て表示
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // 常に最初のページを表示
    pages.push(1);

    let startPage = Math.max(2, currentPage - sidePages);
    let endPage = Math.min(totalPages - 1, currentPage + sidePages);

    // 前の省略記号が必要か
    if (startPage > 2) {
      pages.push('ellipsis-start');
    }

    // 現在ページ周辺のページを追加
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    // 後の省略記号が必要か
    if (endPage < totalPages - 1) {
      pages.push('ellipsis-end');
    }

    // 常に最後のページを表示
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  const handleExportData = () => {
    const format = prompt('エクスポート形式を選択してください:\n1. CSV\n2. Excel\n3. PDF', '1');
    if (format) {
      const formatName = format === '1' ? 'CSV' : format === '2' ? 'Excel' : 'PDF';
      alert(`在庫データを${formatName}形式でエクスポートしました`);
    }
  };

  const handleViewDetails = (item) => {
    setSelectedItem(item);
    setViewMode('detail');
  };

  const handleBackToList = () => {
    setSelectedItem(null);
    setViewMode('list');
    setShowSalesForm(false);
    setSalesFormData({
      salesChannel: 'direct',
      ebayRecordNumber: '',
      buyerName: '',
      soldPrice: 0,
      shippingFee: 0
    });
  };

  // ステータス変更（eBay販売・発送済み）
  const handleStatusChange = (itemId, newStatus, salesData = {}) => {
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    const updatedInventory = inventoryData.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          status: newStatus,
          ...salesData,
          statusUpdatedAt: new Date().toISOString()
        };
      }
      return item;
    });
    
    localStorage.setItem('inventory', JSON.stringify(updatedInventory));
    setInventory(updatedInventory);
    
    // 選択中のアイテムも更新
    if (selectedItem && selectedItem.id === itemId) {
      const updated = updatedInventory.find(item => item.id === itemId);
      setSelectedItem(updated);
    }
    
    alert(`ステータスを「${getStatusLabel(newStatus)}」に変更しました`);
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'in_stock': return '在庫中';
      case 'reserved': return '予約済み';
      case 'shipped': return '発送済み';
      default: return '在庫中';
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'in_stock': return 'status-in-stock';
      case 'reserved': return 'status-reserved';
      case 'shipped': return 'status-shipped';
      case 'out_of_stock': return 'status-out-of-stock';
      default: return 'status-in-stock';
    }
  };

  // 販売処理（発送済みに変更）
  const handleMarkAsShipped = () => {
    if (!selectedItem) return;

    // バリデーション
    if (salesFormData.salesChannel === 'ebay' && !salesFormData.ebayRecordNumber) {
      alert('eBayセールスレコード番号を入力してください');
      return;
    }

    if (!salesFormData.buyerName) {
      alert('購入者名を入力してください');
      return;
    }

    const quantity = salesFormData.quantity || 1;
    if (quantity < 1 || quantity > selectedItem.quantity) {
      alert(`販売数量は1から${selectedItem.quantity}の間で指定してください`);
      return;
    }

    if (!salesFormData.performedBy) {
      alert('担当者名を入力してください');
      return;
    }

    if (!confirm(`${quantity}点を発送済みにしますか？`)) {
      return;
    }

    // 在庫を更新
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    const salesHistory = JSON.parse(localStorage.getItem('salesHistory') || '[]');
    const inventoryHistory = JSON.parse(localStorage.getItem('inventoryHistory') || '[]');
    
    let updatedInventory = inventoryData.map(item => {
      if (item.id === selectedItem.id) {
        const newQuantity = item.quantity - quantity;
        
        // 管理番号を割り当て（販売する数量分）
        const soldManagementNumbers = (item.managementNumbers || []).slice(0, quantity);
        const remainingManagementNumbers = (item.managementNumbers || []).slice(quantity);
        
        // 販売履歴を作成
        const saleRecord = {
          id: `SALE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          inventoryItemId: item.id,
          productType: item.productType,
          manufacturer: item.manufacturer,
          manufacturerLabel: item.manufacturerLabel,
          console: item.console,
          consoleLabel: item.consoleLabel,
          color: item.color,
          colorLabel: item.colorLabel,
          softwareName: item.softwareName,
          assessedRank: item.assessedRank,
          quantity: quantity,
          acquisitionPrice: item.acquisitionPrice || item.buybackPrice,
          soldPrice: salesFormData.soldPrice || item.buybackPrice,
          shippingFee: salesFormData.shippingFee || 0,
          profit: (salesFormData.soldPrice || item.buybackPrice) - (item.acquisitionPrice || item.buybackPrice),
          salesChannel: salesFormData.salesChannel,
          ebayRecordNumber: salesFormData.salesChannel === 'ebay' ? salesFormData.ebayRecordNumber : null,
          soldTo: salesFormData.buyerName,
          soldAt: new Date().toISOString(),
          managementNumbers: soldManagementNumbers
        };
        salesHistory.push(saleRecord);

        recordLedgerSale({
          inventoryItem: item,
          saleId: saleRecord.id,
          quantity,
          priceJPY: (salesFormData.soldPrice || item.buybackPrice || 0) * quantity,
          priceUSD: 0,
          shippingFeeJPY: salesFormData.shippingFee || 0,
          shippingFeeUSD: 0,
          eventDate: saleRecord.soldAt,
          buyer: { name: salesFormData.buyerName },
          salesChannel: salesFormData.salesChannel,
          staff: salesFormData.performedBy || '',
          managementNumbers: soldManagementNumbers,
          notes: salesFormData.salesChannel === 'ebay' && salesFormData.ebayRecordNumber
            ? `eBayレコード: ${salesFormData.ebayRecordNumber}`
            : ''
        });
        
        // 在庫変更履歴を記録
        inventoryHistory.push({
          itemId: item.id,
          type: 'remove',
          change: quantity,
          beforeQuantity: item.quantity,
          afterQuantity: newQuantity,
          date: new Date().toISOString(),
          performedBy: salesFormData.performedBy || 'スタッフ',
          reason: `販売処理（${salesFormData.salesChannel === 'ebay' ? 'eBay' : '直接販売'}）`,
          relatedTransaction: {
            type: 'sale',
            saleId: saleRecord.id,
            buyer: salesFormData.buyerName
          }
        });
        
        return {
          ...item,
          quantity: newQuantity,
          managementNumbers: remainingManagementNumbers,
          statusUpdatedAt: new Date().toISOString()
        };
      }
      return item;
    });
    
    // 在庫が0になったアイテムも記録として残す（削除しない）
    
    localStorage.setItem('inventory', JSON.stringify(updatedInventory));
    localStorage.setItem('salesHistory', JSON.stringify(salesHistory));
    localStorage.setItem('inventoryHistory', JSON.stringify(inventoryHistory));
    
    setInventory(updatedInventory);
    setShowSalesForm(false);
    setSalesFormData({
      salesChannel: 'direct',
      ebayRecordNumber: '',
      buyerName: '',
      soldPrice: 0,
      shippingFee: 0,
      quantity: 1,
      performedBy: ''
    });
    
    // 一覧画面に戻る
    setViewMode('list');
    setSelectedItem(null);
    
    alert(`${quantity}点の販売処理が完了しました`);
  };

  // 在庫変更履歴を取得（localStorageから）
  const getInventoryHistory = (itemId) => {
    const history = JSON.parse(localStorage.getItem('inventoryHistory') || '[]');
    return history.filter(h => h.itemId === itemId).sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  // 関連する買取・販売記録を取得（在庫推移を含む）
  const getRelatedTransactions = (item) => {
    const transactions = [];
    const inventoryHistory = JSON.parse(localStorage.getItem('inventoryHistory') || '[]');
    const itemHistory = inventoryHistory.filter(h => h.itemId === item.id);
    
    // 買取記録（初回登録）
    if (item.applicationNumber) {
      const applications = JSON.parse(localStorage.getItem('allApplications') || '[]');
      const app = applications.find(a => a.applicationNumber === item.applicationNumber);
      if (app) {
        const addHistory = itemHistory.find(h => h.type === 'add' && h.relatedTransaction?.applicationNumber === item.applicationNumber);
        transactions.push({
          type: 'buyback',
          date: item.registeredDate || app.date,
          party: app.customer.name,
          status: app.status,
          applicationNumber: item.applicationNumber,
          stockChange: addHistory ? `+${addHistory.change}台` : `+${item.quantity}台`,
          stockAfter: addHistory?.afterQuantity || item.quantity,
          performedBy: addHistory?.performedBy
        });
      }
    }
    
    // 販売記録（新しいsalesHistory）
    const salesHistory = JSON.parse(localStorage.getItem('salesHistory') || '[]');
    const itemSales = salesHistory.filter(s => s.inventoryItemId === item.id);
    itemSales.forEach(sale => {
      const saleHistory = itemHistory.find(h => 
        h.type === 'remove' && h.relatedTransaction?.saleId === sale.id
      );
      
      transactions.push({
        type: 'sales',
        date: sale.soldAt,
        party: sale.soldTo,
        status: 'completed',
        saleId: sale.id,
        salesChannel: sale.salesChannel === 'ebay' ? 'eBay販売' : '直接販売',
        ebayRecordNumber: sale.ebayRecordNumber,
        quantity: sale.quantity,
        stockChange: `-${sale.quantity}台`,
        stockAfter: saleHistory?.afterQuantity,
        performedBy: saleHistory?.performedBy,
        soldPrice: sale.soldPrice,
        profit: sale.profit,
        managementNumbers: sale.managementNumbers || []
      });
    });
    
    // 販売記録（旧salesLedger - 後方互換性のため残す）
    const salesLedger = JSON.parse(localStorage.getItem('salesLedger') || '[]');
    const sales = salesLedger.filter(s => 
      s.items && s.items.some(si => si.inventoryId === item.id)
    );
    sales.forEach(sale => {
      const saleItem = sale.items.find(si => si.inventoryId === item.id);
      const saleHistory = itemHistory.find(h => 
        h.type === 'sale' && h.relatedTransaction?.requestNumber === sale.requestNumber
      );
      
      transactions.push({
        type: 'sales',
        date: sale.soldDate || sale.date,
        party: sale.customer.name,
        status: 'completed',
        requestNumber: sale.requestNumber,
        stockChange: saleItem ? `-${saleItem.quantity}台` : '-',
        stockAfter: saleHistory?.afterQuantity,
        performedBy: saleHistory?.performedBy
      });
    });
    
    return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  // モーダルを開く
  const handleOpenAddModal = () => {
    setShowAddModal(true);
    setSourceType(null);
    resetForm();
  };

  // モーダルを閉じる
  const handleCloseModal = () => {
    setShowAddModal(false);
    setSourceType(null);
    resetForm();
  };

  // フォームをリセット
  const resetForm = () => {
    setFormData({
      productType: 'console',
      manufacturer: '',
      console: '',
      color: '',
      softwareName: '',
      condition: '',
      assessedRank: '',
      quantity: 1,
      acquisitionPrice: 0,
      customerName: '',
      customerEmail: '',
      supplierName: '',
      invoiceNumber: '',
      notes: ''
    });
    setAvailableConsoles([]);
  };

  // メーカー変更時に機種リストを更新
  const handleManufacturerChange = (manufacturerValue) => {
    setFormData({
      ...formData,
      manufacturer: manufacturerValue,
      console: ''
    });
    
    if (manufacturerValue && allGameConsoles[manufacturerValue]) {
      setAvailableConsoles(allGameConsoles[manufacturerValue]);
    } else {
      setAvailableConsoles([]);
    }
  };

  // フォーム入力変更
  const handleFormChange = (field, value) => {
    setFormData({
      ...formData,
      [field]: value
    });
  };

  // 在庫追加処理
  const handleAddInventory = () => {
    // バリデーション
    if (!formData.manufacturer || !formData.console || !formData.assessedRank || !formData.acquisitionPrice) {
      alert('必須項目を入力してください');
      return;
    }

    if (formData.productType === 'software' && !formData.softwareName) {
      alert('ソフト名を入力してください');
      return;
    }

    if (sourceType === 'customer' && !formData.customerName) {
      alert('顧客名を入力してください');
      return;
    }

    if (sourceType === 'supplier' && !formData.supplierName) {
      alert('仕入れ先を選択してください');
      return;
    }

    // ラベル取得
    const manufacturerLabel = manufacturers.find(m => m.value === formData.manufacturer)?.label;
    const consoleLabel = availableConsoles.find(c => c.value === formData.console)?.label;
    const conditionLabel = formData.condition ? conditions.find(c => c.value === formData.condition)?.label : '';

    // 在庫アイテム作成
    const inventoryItem = {
      id: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceType: sourceType,
      applicationNumber: `MANUAL-${Date.now()}`,
      
      // 商品情報
      productType: formData.productType,
      manufacturer: formData.manufacturer,
      manufacturerLabel: manufacturerLabel,
      console: formData.console,
      consoleLabel: consoleLabel,
      color: formData.color || '',
      colorLabel: formData.color || '',
      softwareName: formData.softwareName || '',
      condition: formData.condition || '',
      conditionLabel: conditionLabel || '',
      assessedRank: formData.assessedRank,
      quantity: formData.quantity,
      acquisitionPrice: formData.acquisitionPrice,
      buybackPrice: formData.acquisitionPrice, // 互換性のため
      
      // 仕入れ元情報
      ...(sourceType === 'customer' ? {
        customer: {
          name: formData.customerName,
          email: formData.customerEmail || ''
        }
      } : {}),
      
      ...(sourceType === 'supplier' ? {
        supplier: {
          name: formData.supplierName,
          invoiceNumber: formData.invoiceNumber || ''
        }
      } : {}),
      
      // メタ情報
      registeredDate: new Date().toISOString(),
      notes: formData.notes || ''
    };

    // 在庫に追加
    const inventoryData = JSON.parse(localStorage.getItem('inventory') || '[]');
    inventoryData.push(inventoryItem);
    localStorage.setItem('inventory', JSON.stringify(inventoryData));
    
    // 在庫変更履歴を記録
    const inventoryHistory = JSON.parse(localStorage.getItem('inventoryHistory') || '[]');
    inventoryHistory.push({
      itemId: inventoryItem.id,
      type: 'add',
      change: formData.quantity,
      beforeQuantity: 0,
      afterQuantity: formData.quantity,
      date: new Date().toISOString(),
      performedBy: 'スタッフ（手動登録）',
      reason: sourceType === 'customer' 
        ? `顧客買取（${formData.customerName}）` 
        : `業者仕入れ（${formData.supplierName}）`,
      relatedTransaction: {
        type: sourceType,
        reference: sourceType === 'supplier' ? formData.invoiceNumber : formData.customerEmail
      }
    });
    localStorage.setItem('inventoryHistory', JSON.stringify(inventoryHistory));

    // 画面更新
    setInventory(inventoryData);
    alert('在庫を追加しました');
    handleCloseModal();
  };

  return (
    <div className="inventory-container">
      {viewMode === 'list' ? (
        <>
      <h1>在庫管理サマリー</h1>
      <p className="subtitle">在庫全体の概要を確認できます</p>

      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon">📦</div>
          <div className="card-value">{totalItems}</div>
          <div className="card-label">総在庫数</div>
        </div>
        <div className="summary-card">
          <div className="card-icon">💰</div>
          <div className="card-value">¥{totalValue.toLocaleString()}</div>
          <div className="card-label">在庫評価額</div>
        </div>
        <div className="summary-card">
          <div className="card-icon">📈</div>
          <div className="card-value">¥{averagePrice.toLocaleString()}</div>
          <div className="card-label">平均単価</div>
        </div>
        <div className="summary-card">
          <div className="card-icon">🎮</div>
          <div className="card-value">{inventory.length}</div>
          <div className="card-label">商品種別数</div>
        </div>
      </div>

      <div className="action-buttons">
        <button onClick={handleOpenAddModal} className="add-inventory-button">➕ 在庫を手動追加</button>
        <button onClick={handleExportData}>データエクスポート</button>
        <button className="secondary">データ更新</button>
      </div>

      <div className="filter-section">
        <h3>🔍 フィルター</h3>
        <div className="filter-controls">
          <div className="form-group stock-filter-group">
            <div className="stock-filter-checkbox">
              <input 
                type="checkbox" 
                id="stock-filter"
                checked={showInStockOnly} 
                onChange={(e) => setShowInStockOnly(e.target.checked)}
              />
              <label htmlFor="stock-filter">
                在庫ありのみ表示
              </label>
            </div>
          </div>
          <div className="form-group">
            <label>商品検索</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="機種名、ソフト名、カラー、管理番号で検索"
            />
          </div>
          <div className="form-group">
            <label>商品タイプ</label>
            <select value={productTypeFilter} onChange={(e) => setProductTypeFilter(e.target.value)}>
              <option value="">全て</option>
              <option value="console">🎮 ゲーム本体</option>
              <option value="software">💿 ゲームソフト</option>
            </select>
          </div>
          <div className="form-group">
            <label>メーカー</label>
            <select value={manufacturerFilter} onChange={(e) => setManufacturerFilter(e.target.value)}>
              <option value="">全て</option>
              {manufacturers.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>査定ランク</label>
            <select value={rankFilter} onChange={(e) => setRankFilter(e.target.value)}>
              <option value="">全て</option>
              <option value="S">S（極美品）</option>
              <option value="A">A（美品）</option>
              <option value="B">B（良品）</option>
              <option value="C">C（難あり）</option>
            </select>
          </div>
          <div className="form-group">
            <label>ステータス</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">全て</option>
              <option value="in_stock">📦 在庫中</option>
              <option value="reserved">📋 予約済み</option>
              <option value="shipped">✈️ 発送済み</option>
            </select>
          </div>
        </div>
      </div>

      {/* ページネーション設定 */}
      <div className="pagination-controls">
        <div className="pagination-info">
          <span>表示件数: </span>
          <select value={pageSize} onChange={(e) => handlePageSizeChange(Number(e.target.value))}>
            <option value={10}>10件</option>
            <option value={20}>20件</option>
            <option value={50}>50件</option>
            <option value={100}>100件</option>
          </select>
          <span>（{filteredInventory.length}件中 {startIndex + 1}-{Math.min(endIndex, filteredInventory.length)}件を表示）</span>
        </div>
      </div>

      <h2>📦 商品別在庫一覧（{filteredInventory.length}件）</h2>
      
      {filteredInventory.length === 0 ? (
        <div className="empty-inventory">
          <div className="empty-icon">📦</div>
          <p>在庫データがありません</p>
          <p className="empty-hint">買取査定ページから「在庫に登録」すると、こちらに表示されます</p>
        </div>
      ) : (
        <table className="inventory-table">
          <thead>
            <tr>
              <th>管理番号</th>
              <th>商品タイプ</th>
              <th>メーカー</th>
              <th>機種/ソフト名</th>
              <th>カラー</th>
              <th>ランク</th>
              <th>ステータス</th>
              <th>数量</th>
              <th>買取単価</th>
              <th>登録日</th>
            </tr>
          </thead>
          <tbody>
            {paginatedInventory.map(item => {
              // 管理番号の表示テキストを生成
              let managementNumberDisplay = '-';
              if (item.managementNumbers && item.managementNumbers.length > 0) {
                const numbers = item.managementNumbers;
                if (numbers.length === 1) {
                  managementNumberDisplay = numbers[0];
                } else {
                  const first = numbers[0];
                  const last = numbers[numbers.length - 1];
                  const firstSeq = first.split('_').pop();
                  const lastSeq = last.split('_').pop();
                  const baseNumber = first.substring(0, first.lastIndexOf('_') + 1);
                  managementNumberDisplay = `${baseNumber}${firstSeq}~${lastSeq}`;
                }
              }
              
              return (
              <tr key={item.id} onClick={() => handleViewDetails(item)}>
                <td className="management-number-cell">
                  {managementNumberDisplay !== '-' ? (
                    <span className="management-number-badge-inv">{managementNumberDisplay}</span>
                  ) : (
                    <span className="no-management-number">-</span>
                  )}
                </td>
                <td>
                  <span className="type-badge">
                    {item.productType === 'console' ? '🎮 本体' : '💿 ソフト'}
                  </span>
                </td>
                <td className="manufacturer-cell">{item.manufacturerLabel}</td>
                <td className="product-name">
                  {item.productType === 'software' ? (
                    <>
                      <div className="software-name">{item.softwareName}</div>
                      <div className="console-name">{item.consoleLabel}</div>
                    </>
                  ) : (
                    <div>{item.consoleLabel}</div>
                  )}
                </td>
                <td className="color-cell">
                  {item.colorLabel ? (
                    <span className="color-badge">{item.colorLabel}</span>
                  ) : (
                    <span className="no-color">-</span>
                  )}
                </td>
                <td>
                  <span className={`rank-badge rank-${item.assessedRank.toLowerCase()}`}>
                    {item.assessedRank}
                  </span>
                </td>
                <td>
                  <span className={`status-badge ${getStatusBadgeClass(item.quantity > 0 ? (item.status || 'in_stock') : 'out_of_stock')}`}>
                    {item.quantity > 0 ? getStatusLabel(item.status || 'in_stock') : '在庫なし'}
                  </span>
                </td>
                <td className="quantity-cell">{item.quantity}</td>
                <td className="price-cell">¥{item.buybackPrice.toLocaleString()}</td>
                <td className="date-cell">
                  <div className="date-display">
                    {new Date(item.registeredDate).toLocaleDateString('ja-JP')}
                    {item.zaicoOriginalDate && (
                      <div className="zaico-original-date-small">
                        Zaico: {new Date(item.zaicoOriginalDate).toLocaleDateString('ja-JP')}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan="7">合計</td>
              <td>{filteredInventory.reduce((sum, item) => sum + item.quantity, 0)}</td>
              <td>-</td>
              <td>-</td>
            </tr>
          </tfoot>
        </table>
      )}

      {/* 在庫追加モーダル */}
      {showAddModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📦 在庫を手動追加</h2>
              <button className="modal-close" onClick={handleCloseModal}>×</button>
            </div>

            <div className="modal-body">
              {/* 仕入れ元選択 */}
              {!sourceType && (
                <div className="source-type-selection">
                  <h3>仕入れ元を選択してください</h3>
                  <div className="source-buttons">
                    <button 
                      className="source-btn customer-btn"
                      onClick={() => setSourceType('customer')}
                    >
                      <div className="source-icon">👤</div>
                      <h4>顧客からの買取</h4>
                      <p>個人のお客様から買い取った商品</p>
                    </button>
                    <button 
                      className="source-btn supplier-btn"
                      onClick={() => setSourceType('supplier')}
                    >
                      <div className="source-icon">🏢</div>
                      <h4>業者から仕入れ</h4>
                      <p>駿河屋などの業者から仕入れた商品</p>
                    </button>
                  </div>
                </div>
              )}

              {/* 顧客買取フォーム */}
              {sourceType === 'customer' && (
                <div className="add-inventory-form">
                  <button className="back-to-source" onClick={() => setSourceType(null)}>
                    ← 仕入れ元選択に戻る
                  </button>
                  
                  <h3>👤 顧客買取 - 在庫登録</h3>
                  
                  <div className="form-section-group">
                    <h4>📦 商品情報</h4>
                    
                    <div className="form-row">
                      <div className="form-group">
                        <label>商品タイプ *</label>
                        <div className="radio-group">
                          <label>
                            <input
                              type="radio"
                              value="console"
                              checked={formData.productType === 'console'}
                              onChange={(e) => handleFormChange('productType', e.target.value)}
                            />
                            🎮 ゲーム本体
                          </label>
                          <label>
                            <input
                              type="radio"
                              value="software"
                              checked={formData.productType === 'software'}
                              onChange={(e) => handleFormChange('productType', e.target.value)}
                            />
                            💿 ゲームソフト
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>メーカー *</label>
                        <select 
                          value={formData.manufacturer}
                          onChange={(e) => handleManufacturerChange(e.target.value)}
                        >
                          <option value="">選択してください</option>
                          {manufacturers.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>機種 *</label>
                        <select 
                          value={formData.console}
                          onChange={(e) => handleFormChange('console', e.target.value)}
                          disabled={!formData.manufacturer}
                        >
                          <option value="">選択してください</option>
                          {availableConsoles.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {formData.productType === 'console' && (
                      <div className="form-row">
                        <div className="form-group">
                          <label>カラー（任意）</label>
                          <select 
                            value={formData.color}
                            onChange={(e) => handleFormChange('color', e.target.value)}
                          >
                            <option value="">選択しない</option>
                            {colors.map(color => (
                              <option key={color} value={color}>{color}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {formData.productType === 'software' && (
                      <div className="form-row">
                        <div className="form-group">
                          <label>ソフト名 *</label>
                          <input
                            type="text"
                            value={formData.softwareName}
                            onChange={(e) => handleFormChange('softwareName', e.target.value)}
                            placeholder="例: ゼルダの伝説 ティアーズ オブ ザ キングダム"
                          />
                        </div>
                      </div>
                    )}

                    <div className="form-row">
                      <div className="form-group">
                        <label>状態（任意）</label>
                        <select 
                          value={formData.condition}
                          onChange={(e) => handleFormChange('condition', e.target.value)}
                        >
                          <option value="">選択しない</option>
                          {conditions.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>査定ランク *</label>
                        <select 
                          value={formData.assessedRank}
                          onChange={(e) => handleFormChange('assessedRank', e.target.value)}
                        >
                          <option value="">選択してください</option>
                          <option value="S">S（極美品）</option>
                          <option value="A">A（美品）</option>
                          <option value="B">B（良品）</option>
                          <option value="C">C（難あり）</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>数量 *</label>
                        <input
                          type="number"
                          min="1"
                          value={formData.quantity}
                          onChange={(e) => handleFormChange('quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>

                      <div className="form-group">
                        <label>買取単価（円）*</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={formData.acquisitionPrice}
                          onChange={(e) => handleFormChange('acquisitionPrice', parseInt(e.target.value) || 0)}
                          placeholder="25000"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-section-group">
                    <h4>👤 顧客情報（簡易版）</h4>
                    
                    <div className="form-row">
                      <div className="form-group">
                        <label>顧客名 *</label>
                        <input
                          type="text"
                          value={formData.customerName}
                          onChange={(e) => handleFormChange('customerName', e.target.value)}
                          placeholder="山田太郎"
                        />
                      </div>

                      <div className="form-group">
                        <label>メールアドレス（任意）</label>
                        <input
                          type="email"
                          value={formData.customerEmail}
                          onChange={(e) => handleFormChange('customerEmail', e.target.value)}
                          placeholder="yamada@example.com"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>備考（任意）</label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => handleFormChange('notes', e.target.value)}
                          placeholder="特記事項があれば入力してください"
                          rows="3"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="modal-footer">
                    <button className="btn-secondary" onClick={handleCloseModal}>キャンセル</button>
                    <button className="btn-primary" onClick={handleAddInventory}>✅ 在庫に追加</button>
                  </div>
                </div>
              )}

              {/* 業者仕入れフォーム */}
              {sourceType === 'supplier' && (
                <div className="add-inventory-form">
                  <button className="back-to-source" onClick={() => setSourceType(null)}>
                    ← 仕入れ元選択に戻る
                  </button>
                  
                  <h3>🏢 業者仕入れ - 在庫登録</h3>
                  
                  <div className="form-section-group">
                    <h4>📦 商品情報</h4>
                    
                    <div className="form-row">
                      <div className="form-group">
                        <label>商品タイプ *</label>
                        <div className="radio-group">
                          <label>
                            <input
                              type="radio"
                              value="console"
                              checked={formData.productType === 'console'}
                              onChange={(e) => handleFormChange('productType', e.target.value)}
                            />
                            🎮 ゲーム本体
                          </label>
                          <label>
                            <input
                              type="radio"
                              value="software"
                              checked={formData.productType === 'software'}
                              onChange={(e) => handleFormChange('productType', e.target.value)}
                            />
                            💿 ゲームソフト
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>メーカー *</label>
                        <select 
                          value={formData.manufacturer}
                          onChange={(e) => handleManufacturerChange(e.target.value)}
                        >
                          <option value="">選択してください</option>
                          {manufacturers.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>機種 *</label>
                        <select 
                          value={formData.console}
                          onChange={(e) => handleFormChange('console', e.target.value)}
                          disabled={!formData.manufacturer}
                        >
                          <option value="">選択してください</option>
                          {availableConsoles.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {formData.productType === 'console' && (
                      <div className="form-row">
                        <div className="form-group">
                          <label>カラー（任意）</label>
                          <select 
                            value={formData.color}
                            onChange={(e) => handleFormChange('color', e.target.value)}
                          >
                            <option value="">選択しない</option>
                            {colors.map(color => (
                              <option key={color} value={color}>{color}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    {formData.productType === 'software' && (
                      <div className="form-row">
                        <div className="form-group">
                          <label>ソフト名 *</label>
                          <input
                            type="text"
                            value={formData.softwareName}
                            onChange={(e) => handleFormChange('softwareName', e.target.value)}
                            placeholder="例: ゼルダの伝説 ティアーズ オブ ザ キングダム"
                          />
                        </div>
                      </div>
                    )}

                    <div className="form-row">
                      <div className="form-group">
                        <label>状態（任意）</label>
                        <select 
                          value={formData.condition}
                          onChange={(e) => handleFormChange('condition', e.target.value)}
                        >
                          <option value="">選択しない</option>
                          {conditions.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>査定ランク *</label>
                        <select 
                          value={formData.assessedRank}
                          onChange={(e) => handleFormChange('assessedRank', e.target.value)}
                        >
                          <option value="">選択してください</option>
                          <option value="S">S（極美品）</option>
                          <option value="A">A（美品）</option>
                          <option value="B">B（良品）</option>
                          <option value="C">C（難あり）</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>数量 *</label>
                        <input
                          type="number"
                          min="1"
                          value={formData.quantity}
                          onChange={(e) => handleFormChange('quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>

                      <div className="form-group">
                        <label>仕入れ単価（円）*</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={formData.acquisitionPrice}
                          onChange={(e) => handleFormChange('acquisitionPrice', parseInt(e.target.value) || 0)}
                          placeholder="30000"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-section-group">
                    <h4>🏢 仕入れ先情報</h4>
                    
                    <div className="form-row">
                      <div className="form-group">
                        <label>仕入れ先 *</label>
                        <select
                          value={formData.supplierName}
                          onChange={(e) => handleFormChange('supplierName', e.target.value)}
                        >
                          <option value="">選択してください</option>
                          <option value="駿河屋">駿河屋</option>
                          <option value="ブックオフ">ブックオフ</option>
                          <option value="じゃんぱら">じゃんぱら</option>
                          <option value="ソフマップ">ソフマップ</option>
                          <option value="ハードオフ">ハードオフ</option>
                          <option value="その他">その他</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>伝票番号（任意）</label>
                        <input
                          type="text"
                          value={formData.invoiceNumber}
                          onChange={(e) => handleFormChange('invoiceNumber', e.target.value)}
                          placeholder="SRG-2024-001"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>備考（任意）</label>
                        <textarea
                          value={formData.notes}
                          onChange={(e) => handleFormChange('notes', e.target.value)}
                          placeholder="特記事項があれば入力してください"
                          rows="3"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="modal-footer">
                    <button className="btn-secondary" onClick={handleCloseModal}>キャンセル</button>
                    <button className="btn-primary" onClick={handleAddInventory}>✅ 在庫に追加</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      ) : (
        /* 個別管理台帳画面 */
        <div className="item-detail-view">
          <div className="detail-header">
            <h1>📋 個別管理台帳</h1>
            <button className="back-btn" onClick={handleBackToList}>
              ← 在庫一覧に戻る
            </button>
          </div>

          {selectedItem && (
            <>
              {/* 商品情報カード */}
              <div className="detail-card">
                <h2>🎮 商品情報</h2>
                <div className="detail-grid">
                  {(() => {
                    // 管理番号の表示ロジック
                    const numbers = selectedItem.managementNumbers;
                    
                    // 管理番号がない場合はスキップ
                    if (!numbers || numbers.length === 0) {
                      return null;
                    }
                    
                    let displayText = '';
                    if (numbers.length === 1) {
                      displayText = numbers[0];
                    } else {
                      try {
                        const first = numbers[0];
                        const last = numbers[numbers.length - 1];
                        const firstSeq = first.split('_').pop();
                        const lastSeq = last.split('_').pop();
                        const baseNumber = first.substring(0, first.lastIndexOf('_') + 1);
                        displayText = `${baseNumber}${firstSeq}~${lastSeq} (${numbers.length}点)`;
                      } catch (e) {
                        // エラーの場合は全て表示
                        displayText = numbers.join(', ');
                      }
                    }
                    
                    return (
                      <div className="detail-row highlight-row">
                        <span className="detail-label">🏷️ 管理番号:</span>
                        <span className="detail-value management-number-large">
                          {displayText}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="detail-row">
                    <span className="detail-label">商品ID:</span>
                    <span className="detail-value">{selectedItem.id}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">商品タイプ:</span>
                    <span className="detail-value">
                      {selectedItem.productType === 'console' ? 'ゲーム本体' : 'ゲームソフト'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">メーカー:</span>
                    <span className="detail-value">{selectedItem.manufacturerLabel}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">機種:</span>
                    <span className="detail-value">{selectedItem.consoleLabel}</span>
                  </div>
                  {selectedItem.colorLabel && (
                    <div className="detail-row">
                      <span className="detail-label">カラー:</span>
                      <span className="detail-value">{selectedItem.colorLabel}</span>
                    </div>
                  )}
                  {selectedItem.softwareName && (
                    <div className="detail-row">
                      <span className="detail-label">ソフト名:</span>
                      <span className="detail-value">{selectedItem.softwareName}</span>
                    </div>
                  )}
                  {selectedItem.conditionLabel && (
                    <div className="detail-row">
                      <span className="detail-label">状態:</span>
                      <span className="detail-value">{selectedItem.conditionLabel}</span>
                    </div>
                  )}
                  {selectedItem.accessoriesLabel && (
                    <div className="detail-row">
                      <span className="detail-label">付属品:</span>
                      <span className="detail-value">{selectedItem.accessoriesLabel}</span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="detail-label">査定ランク:</span>
                    <span className={`rank-badge rank-${selectedItem.assessedRank?.toLowerCase()}`}>
                      {selectedItem.assessedRank}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">現在在庫数:</span>
                    <span className="detail-value highlight">{selectedItem.quantity}台</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">仕入れ単価:</span>
                    <span className="detail-value">¥{(selectedItem.acquisitionPrice || selectedItem.buybackPrice || 0).toLocaleString()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">登録日:</span>
                    <span className="detail-value">
                      {new Date(selectedItem.registeredDate).toLocaleString('ja-JP')}
                      {selectedItem.zaicoOriginalDate && (
                        <div className="zaico-original-date">
                          Zaico登録: {new Date(selectedItem.zaicoOriginalDate).toLocaleDateString('ja-JP')}
                        </div>
                      )}
                    </span>
                  </div>
                </div>
                
                {/* 管理番号の詳細リスト（複数ある場合） */}
                {selectedItem.managementNumbers && selectedItem.managementNumbers.length > 1 && (
                  <div className="management-numbers-detail">
                    <h3>📋 管理番号一覧 ({selectedItem.managementNumbers.length}点)</h3>
                    <div className="management-numbers-grid">
                      {selectedItem.managementNumbers.map((number, idx) => (
                        <div key={idx} className="management-number-item">
                          <span className="number-index">{idx + 1}.</span>
                          <span className="number-value">{number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ステータスと販売情報 */}
              <div className="detail-card">
                <h2>📊 ステータス</h2>
                <div className="status-info-section">
                  <div className="status-header-row">
                    <div className="current-status">
                      <span className="status-label">現在のステータス:</span>
                      <span className={`status-badge-large ${getStatusBadgeClass(selectedItem.quantity > 0 ? (selectedItem.status || 'in_stock') : 'out_of_stock')}`}>
                        {selectedItem.quantity > 0 ? getStatusLabel(selectedItem.status || 'in_stock') : '在庫なし'}
                      </span>
                    </div>
                    
                    {/* 在庫中の場合のみ販売ボタン表示 */}
                    {(selectedItem.status || 'in_stock') === 'in_stock' && !showSalesForm && (
                      <button 
                        className="btn-start-sales" 
                        onClick={() => {
                          setShowSalesForm(true);
                          setSalesFormData({
                            salesChannel: 'direct',
                            ebayRecordNumber: '',
                            buyerName: '',
                            soldPrice: 0,
                            shippingFee: 0,
                            quantity: 1,
                            performedBy: ''
                          });
                        }}
                      >
                        📤 eBay販売処理を開始
                      </button>
                    )}
                  </div>
                  
                  {/* 販売フォーム */}
                  {(selectedItem.status || 'in_stock') === 'in_stock' && showSalesForm && (
                    <div className="sales-action-section">
                      <div className="sales-form">
                          <h3>販売情報の入力</h3>
                          
                          <div className="form-group full-width">
                            <label>販売チャネル *</label>
                            <div className="radio-group-horizontal">
                              <label className="radio-label">
                                <input
                                  type="radio"
                                  value="direct"
                                  checked={salesFormData.salesChannel === 'direct'}
                                  onChange={(e) => setSalesFormData({...salesFormData, salesChannel: e.target.value})}
                                />
                                🏪 直接販売
                              </label>
                              <label className="radio-label">
                                <input
                                  type="radio"
                                  value="ebay"
                                  checked={salesFormData.salesChannel === 'ebay'}
                                  onChange={(e) => setSalesFormData({...salesFormData, salesChannel: e.target.value})}
                                />
                                🌐 eBay販売
                              </label>
                            </div>
                          </div>

                          {salesFormData.salesChannel === 'ebay' && (
                            <div className="form-group">
                              <label>eBayセールスレコード番号 *</label>
                              <div className="ebay-record-search">
                                <input
                                  type="text"
                                  value={salesFormData.ebayRecordNumber}
                                  onChange={(e) => setSalesFormData({...salesFormData, ebayRecordNumber: e.target.value})}
                                  placeholder="例: 123-45678-90123"
                                  className="ebay-record-input"
                                />
                                <button 
                                  type="button"
                                  onClick={handleEbayRecordSearch}
                                  className="ebay-search-btn"
                                  disabled={!salesFormData.ebayRecordNumber.trim()}
                                >
                                  🔍 検索
                                </button>
                              </div>
                              <small className="input-hint">eBayの注文番号を入力して「検索」ボタンを押すと、Googleスプレッドシートから自動で情報を取得します</small>
                            </div>
                          )}

                          <div className="form-row-sales">
                            <div className="form-group">
                              <label>購入者名 *</label>
                              <input
                                type="text"
                                value={salesFormData.buyerName}
                                onChange={(e) => setSalesFormData({...salesFormData, buyerName: e.target.value})}
                                placeholder="John Smith"
                              />
                            </div>

                            <div className="form-group">
                              <label>販売数量 *</label>
                              <input
                                type="number"
                                min="1"
                                max={selectedItem.quantity}
                                value={salesFormData.quantity}
                                onChange={(e) => setSalesFormData({...salesFormData, quantity: parseInt(e.target.value) || 1})}
                                placeholder="1"
                              />
                              <small className="input-hint">現在の在庫: {selectedItem.quantity}点</small>
                            </div>
                          </div>

                          <div className="form-row-sales">
                            <div className="form-group">
                              <label>販売価格（円）</label>
                              <input
                                type="number"
                                value={salesFormData.soldPrice || selectedItem.buybackPrice}
                                onChange={(e) => setSalesFormData({...salesFormData, soldPrice: parseInt(e.target.value) || 0})}
                                placeholder="0"
                              />
                            </div>

                            <div className="form-group">
                              <label>送料（円）</label>
                              <input
                                type="number"
                                value={salesFormData.shippingFee}
                                onChange={(e) => setSalesFormData({...salesFormData, shippingFee: parseInt(e.target.value) || 0})}
                                placeholder="0"
                              />
                            </div>
                          </div>

                          <div className="form-group">
                            <label>担当者名 *</label>
                            <input
                              type="text"
                              value={salesFormData.performedBy}
                              onChange={(e) => setSalesFormData({...salesFormData, performedBy: e.target.value})}
                              placeholder="山田 太郎"
                            />
                          </div>

                          <div className="form-actions-sales">
                            <button 
                              className="btn-cancel-sales" 
                              onClick={() => {
                                setShowSalesForm(false);
                                setSalesFormData({
                                  salesChannel: 'direct',
                                  ebayRecordNumber: '',
                                  buyerName: '',
                                  soldPrice: 0,
                                  shippingFee: 0,
                                  quantity: 1,
                                  performedBy: ''
                                });
                              }}
                            >
                              キャンセル
                            </button>
                            <button 
                              className="btn-mark-shipped" 
                              onClick={handleMarkAsShipped}
                            >
                              ✈️ 発送済みにする
                            </button>
                          </div>
                      </div>
                    </div>
                  )}

                  {/* 発送済みの場合は販売情報を表示 */}
                  {selectedItem.status === 'shipped' && (
                    <div className="sales-info-display">
                      <h3>📤 販売情報</h3>
                      <div className="sales-detail-grid">
                        <div className="sales-detail-row">
                          <span className="detail-label">販売チャネル:</span>
                          <span className="detail-value">
                            {selectedItem.salesChannel === 'ebay' ? '🌐 eBay販売' : '🏪 直接販売'}
                          </span>
                        </div>
                        {selectedItem.ebayRecordNumber && (
                          <div className="sales-detail-row">
                            <span className="detail-label">eBayレコード番号:</span>
                            <span className="detail-value ebay-record">{selectedItem.ebayRecordNumber}</span>
                          </div>
                        )}
                        <div className="sales-detail-row">
                          <span className="detail-label">購入者:</span>
                          <span className="detail-value">{selectedItem.soldTo}</span>
                        </div>
                        <div className="sales-detail-row">
                          <span className="detail-label">販売価格:</span>
                          <span className="detail-value">¥{(selectedItem.soldPrice || 0).toLocaleString()}</span>
                        </div>
                        {selectedItem.shippingFee > 0 && (
                          <div className="sales-detail-row">
                            <span className="detail-label">送料:</span>
                            <span className="detail-value">¥{selectedItem.shippingFee.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="sales-detail-row">
                          <span className="detail-label">発送日時:</span>
                          <span className="detail-value">
                            {new Date(selectedItem.soldAt).toLocaleString('ja-JP')}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 仕入れ元情報 */}
              <div className="detail-card">
                <h2>📥 仕入れ元情報</h2>
                <div className="detail-grid">
                  <div className="detail-row">
                    <span className="detail-label">仕入れ元タイプ:</span>
                    <span className="detail-value">
                      {selectedItem.sourceType === 'customer' ? '👤 顧客買取' : '🏢 業者仕入れ'}
                    </span>
                  </div>
                  {selectedItem.sourceType === 'customer' && selectedItem.customer && (
                    <>
                      <div className="detail-row">
                        <span className="detail-label">顧客名:</span>
                        <span className="detail-value">{selectedItem.customer.name}</span>
                      </div>
                      {selectedItem.customer.birthDate && (
                        <div className="detail-row">
                          <span className="detail-label">生年月日:</span>
                          <span className="detail-value">{selectedItem.customer.birthDate}</span>
                        </div>
                      )}
                      {selectedItem.customer.occupation && (
                        <div className="detail-row">
                          <span className="detail-label">職業:</span>
                          <span className="detail-value">{selectedItem.customer.occupation}</span>
                        </div>
                      )}
                      <div className="detail-row">
                        <span className="detail-label">電話番号:</span>
                        <span className="detail-value">{selectedItem.customer.phone || '-'}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">メールアドレス:</span>
                        <span className="detail-value">{selectedItem.customer.email}</span>
                      </div>
                      {selectedItem.customer.postalCode && (
                        <div className="detail-row">
                          <span className="detail-label">郵便番号:</span>
                          <span className="detail-value">{selectedItem.customer.postalCode}</span>
                        </div>
                      )}
                      {selectedItem.customer.address && (
                        <div className="detail-row">
                          <span className="detail-label">住所:</span>
                          <span className="detail-value">{selectedItem.customer.address}</span>
                        </div>
                      )}
                    </>
                  )}
                  {selectedItem.sourceType === 'supplier' && selectedItem.supplier && (
                    <>
                      <div className="detail-row">
                        <span className="detail-label">仕入れ先:</span>
                        <span className="detail-value">{selectedItem.supplier.name}</span>
                      </div>
                      {selectedItem.invoiceNumber && (
                        <div className="detail-row">
                          <span className="detail-label">伝票番号:</span>
                          <span className="detail-value">{selectedItem.invoiceNumber}</span>
                        </div>
                      )}
                    </>
                  )}
                  {selectedItem.applicationNumber && (
                    <div className="detail-row">
                      <span className="detail-label">申込番号:</span>
                      <span className="detail-value">{selectedItem.applicationNumber}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 取引履歴・在庫推移 */}
              <div className="detail-card">
                <h2>📊 取引履歴・在庫推移</h2>
                {getRelatedTransactions(selectedItem).length === 0 ? (
                  <div className="empty-history">
                    <p>取引履歴がありません</p>
                  </div>
                ) : (
                  <div className="transaction-timeline">
                    {getRelatedTransactions(selectedItem).map((trans, index) => (
                      <div key={index} className="timeline-item">
                        <div className="timeline-dot"></div>
                        <div className="timeline-content">
                          <div className="timeline-header">
                            <span className={`trans-type-badge ${trans.type}`}>
                              {trans.type === 'buyback' ? '📥 買取' : '📤 販売'}
                            </span>
                            <span className="trans-date">
                              {new Date(trans.date).toLocaleString('ja-JP')}
                            </span>
                          </div>
                          <div className="timeline-details">
                            {/* 買取の場合 */}
                            {trans.type === 'buyback' && (
                              <>
                                <p><strong>取引先:</strong> {trans.party}</p>
                                {trans.applicationNumber && (
                                  <p><strong>申込番号:</strong> {trans.applicationNumber}</p>
                                )}
                              </>
                            )}
                            
                            {/* 販売の場合 */}
                            {trans.type === 'sales' && (
                              <>
                                <div className="transaction-inline-info">
                                  <span><strong>取引先:</strong> {trans.party}</span>
                                  {trans.salesChannel && (
                                    <span><strong>販売チャネル:</strong> {trans.salesChannel}</span>
                                  )}
                                  {trans.ebayRecordNumber && (
                                    <span><strong>eBayレコード番号:</strong> {trans.ebayRecordNumber}</span>
                                  )}
                                </div>
                                
                                {trans.soldPrice && trans.quantity && (
                                  <div className="transaction-inline-info">
                                    <span><strong>販売価格:</strong> ¥{trans.soldPrice.toLocaleString()} × {trans.quantity}台 = ¥{(trans.soldPrice * trans.quantity).toLocaleString()}</span>
                                    {trans.profit !== undefined && (
                                      <span className={trans.profit >= 0 ? 'profit-positive' : 'profit-negative'}>
                                        <strong>総利益:</strong> ¥{(trans.profit * trans.quantity).toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                            
                            {trans.requestNumber && (
                              <p><strong>リクエスト番号:</strong> {trans.requestNumber}</p>
                            )}
                            {trans.managementNumbers && trans.managementNumbers.length > 0 && (
                              <div className="management-numbers-in-history">
                                <strong>🏷️ 管理番号:</strong>
                                <div className="management-numbers-list">
                                  {trans.managementNumbers.map((number, idx) => (
                                    <span key={idx} className="management-number-tag">
                                      {number}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="stock-change-info">
                              <span className={`stock-change ${trans.type === 'buyback' ? 'increase' : 'decrease'}`}>
                                在庫変動: {trans.stockChange}
                              </span>
                              {trans.stockAfter !== undefined && (
                                <span className="stock-after">
                                  → 在庫: {trans.stockAfter}台
                                </span>
                              )}
                            </div>
                            {trans.performedBy && (
                              <p className="performed-by">👤 担当者: {trans.performedBy}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ページネーションボタン */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            onClick={() => handlePageChange(currentPage - 1)} 
            disabled={currentPage === 1}
            className="pagination-btn"
            aria-label="前のページ"
          >
            ← 前へ
          </button>
          
          <div className="pagination-numbers">
            {getPaginationPages().map((page, index) => {
              if (page === 'ellipsis-start' || page === 'ellipsis-end') {
                return (
                  <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                    ...
                  </span>
                );
              }
              return (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`pagination-number ${currentPage === page ? 'active' : ''}`}
                  aria-label={`ページ ${page}`}
                  aria-current={currentPage === page ? 'page' : undefined}
                >
                  {page}
                </button>
              );
            })}
          </div>
          
          <button 
            onClick={() => handlePageChange(currentPage + 1)} 
            disabled={currentPage === totalPages}
            className="pagination-btn"
            aria-label="次のページ"
          >
            次へ →
          </button>
          
          <div className="pagination-info-mobile">
            <span>{currentPage} / {totalPages}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;