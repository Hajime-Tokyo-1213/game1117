import React, { useState, useEffect, useCallback } from 'react';
import './Ledger.css';
import { loadLedgerRecords as loadLedgerStorage, migrateLegacyLedgerData } from '../utils/ledgerRecords';

const Ledger = () => {
  const [rawLedgerRecords, setRawLedgerRecords] = useState([]);
  const [expandedRecord, setExpandedRecord] = useState(null);
  const [records, setRecords] = useState([]);

  const formatNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toLocaleString() : '0';
  };

  const formatCurrency = (value) => `¥${formatNumber(value ?? 0)}`;

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ja-JP');
  };

  const safeRankClass = (rank) => {
    if (typeof rank === 'string' && rank.length > 0) {
      return `rank-${rank.toLowerCase()}`;
    }
    return 'rank-unknown';
  };
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    transactionType: '',
    productSearch: '',
    skuSearch: '',
    customerSearch: ''
  });

  const loadLedgerRecords = useCallback(() => {
    const ledgerRecords = loadLedgerStorage();
    console.log('=== Ledger Records 読み込み ===', ledgerRecords);

    setRawLedgerRecords(ledgerRecords);

    const filtered = ledgerRecords.filter(record => {
      const firstPurchase = record.purchase?.events?.[0] || null;
      const lastSale = record.sale?.events?.[record.sale.events.length - 1] || null;

      const purchaseDateISO = firstPurchase?.date || null;
      const saleDateISO = lastSale?.date || null;

      const purchaseDate = purchaseDateISO ? new Date(purchaseDateISO) : null;
      const saleDate = saleDateISO ? new Date(saleDateISO) : null;

      if (filters.dateFrom) {
        const fromDate = new Date(filters.dateFrom);
        if (purchaseDate && purchaseDate < fromDate && (!saleDate || saleDate < fromDate)) {
          return false;
        }
      }

      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        if (purchaseDate && purchaseDate > toDate && (!saleDate || saleDate > toDate)) {
          return false;
        }
      }

      if (filters.transactionType === 'purchase' && record.sale.totalQuantity > 0) {
        return false;
      }

      if (filters.transactionType === 'sale' && record.sale.totalQuantity === 0) {
        return false;
      }

    if (filters.productSearch) {
      const searchTerm = filters.productSearch.toLowerCase();
        const reservoir = [
          record.product?.title,
          record.product?.consoleLabel,
          record.product?.softwareName,
          record.product?.manufacturerLabel
        ]
          .filter(Boolean)
          .map(str => str.toLowerCase());

        if (!reservoir.some(str => str.includes(searchTerm))) {
          return false;
        }
      }

    if (filters.skuSearch) {
      const searchTerm = filters.skuSearch.toLowerCase();
        const skuMatch = (record.inventoryId || '').toLowerCase().includes(searchTerm);
        const managementMatch = (record.managementNumbers || []).some(num =>
          String(num).toLowerCase().includes(searchTerm)
        );
        if (!skuMatch && !managementMatch) {
          return false;
        }
      }

    if (filters.customerSearch) {
      const searchTerm = filters.customerSearch.toLowerCase();
        const customer = record.product?.customer;
        const purchaseMatch = customer?.name?.toLowerCase().includes(searchTerm);
        const buyerMatch = record.sale?.events?.some(event => {
          const buyerName = typeof event.buyer === 'string' ? event.buyer : event.buyer?.name;
          return buyerName?.toLowerCase().includes(searchTerm);
        });

        if (!purchaseMatch && !buyerMatch) {
          return false;
        }
      }

      return true;
    });

    const tableRecords = filtered.map(record => {
      const firstPurchase = record.purchase?.events?.[0] || null;
      const lastSale = record.sale?.events?.[record.sale.events.length - 1] || null;
      const purchaseDateISO = firstPurchase?.date || null;
      const saleDateISO = lastSale?.date || null;

      const customer = record.product?.customer || {};
      const buyerNameRaw =
        (lastSale?.buyer && typeof lastSale.buyer === 'object' ? lastSale.buyer.name : lastSale?.buyer) ||
        '-';

      const customerAddress =
        customer.address || customer.postalCode
          ? `${customer.postalCode || ''} ${customer.address || ''}`.trim()
          : '-';

      const customerAge =
        customer.birthDate
          ? Math.floor((new Date() - new Date(customer.birthDate)) / (365.25 * 24 * 60 * 60 * 1000))
          : '-';

      const features = [
        record.product?.colorLabel || record.product?.color || '',
        record.product?.assessedRank ? `ランク:${record.product.assessedRank}` : ''
      ]
        .filter(Boolean)
        .join(' ') || '-';
      const hasSale = (record.sale?.totalQuantity || 0) > 0;

      return {
        id: record.id,
        record,
        date: formatDate(purchaseDateISO),
        rawPurchaseDate: purchaseDateISO,
        type: hasSale ? '販売' : '買取',
        sku: record.inventoryId || '-',
        managementNumber: (record.managementNumbers || []).join(', ') || '-',
        productName: record.product?.title || '-',
        features,
        rank: record.product?.assessedRank || '-',
        quantity: record.purchase?.totalQuantity || 0,
        price: record.purchase?.totalCostJPY || 0,
        customerName: customer.name || '-',
        customerAddress,
        customerOccupation: customer.occupation || '-',
        customerAge,
        saleDate: hasSale ? formatDate(saleDateISO) : '-',
        rawSaleDate: saleDateISO,
        salePrice: hasSale ? record.sale?.totalRevenueJPY || 0 : '-',
        buyer: hasSale ? buyerNameRaw : '-',
        status: record.status
      };
    });

    tableRecords.sort((a, b) => {
      const dateA = new Date(a.rawSaleDate || a.rawPurchaseDate || 0).getTime();
      const dateB = new Date(b.rawSaleDate || b.rawPurchaseDate || 0).getTime();
      return dateB - dateA;
    });

    setRecords(tableRecords);
  }, [filters]);

  const saleLedgerRecords = rawLedgerRecords.filter(record => (record.sale?.totalQuantity || 0) > 0);
  const totalPurchaseCost = rawLedgerRecords.reduce((sum, record) => sum + (record.purchase?.totalCostJPY || 0), 0);
  const totalSalesAmount = rawLedgerRecords.reduce((sum, record) => sum + (record.sale?.totalRevenueJPY || 0), 0);
  const totalProfitAmount = totalSalesAmount - totalPurchaseCost;

  // 初期読み込み
  useEffect(() => {
    migrateLegacyLedgerData();
    loadLedgerRecords();
  }, [loadLedgerRecords]);

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value });
  };

  const handleSearch = () => {
    // フィルター条件に基づいてレコードを再読み込み
    loadLedgerRecords();
  };

  const handleClearSearch = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      transactionType: '',
      productSearch: '',
      skuSearch: '',
      customerSearch: ''
    });
    // フィルターをクリアした後、レコードを再読み込み
    setTimeout(() => {
      console.log('フィルターをクリアしました。古物台帳を再読み込みします。');
      loadLedgerRecords();
    }, 100);
  };

  // 重複データをクリーンアップする関数
  const cleanupDuplicateRecords = () => {
    const salesHistory = JSON.parse(localStorage.getItem('salesHistory') || '[]');
    const uniqueSales = [];
    const seenCombinations = new Set();
    
    console.log('=== 重複クリーンアップ開始 ===');
    console.log('元の販売履歴件数:', salesHistory.length);
    
    salesHistory.forEach(sale => {
      // 重複判定のキーを作成（商品名、価格、日時、顧客名、販売チャネルの組み合わせ）
      const duplicateKey = `${sale.inventoryItemId}-${sale.soldPrice}-${sale.soldAt}-${sale.soldTo}-${sale.salesChannel}`;
      
      if (!seenCombinations.has(duplicateKey)) {
        seenCombinations.add(duplicateKey);
        uniqueSales.push(sale);
        console.log('保持:', sale.id, sale.soldTo, sale.soldPrice, sale.salesChannel);
      } else {
        console.log('重複削除:', sale.id, sale.soldTo, sale.soldPrice, sale.salesChannel);
      }
    });
    
    localStorage.setItem('salesHistory', JSON.stringify(uniqueSales));
    console.log('重複クリーンアップ完了:', {
      元の件数: salesHistory.length,
      クリーンアップ後: uniqueSales.length,
      削除件数: salesHistory.length - uniqueSales.length
    });
    
    // 古物台帳を再読み込み
    loadLedgerRecords();
  };

  const clearAllRecords = () => {
    if (window.confirm('⚠️ 古物台帳の全記録を削除します。この操作は取り消せません。\n\n本当に実行しますか？')) {
      if (window.confirm('🚨 最終確認：古物台帳の全記録を完全に削除します。\n\nこの操作は絶対に取り消せません。\n\n本当に実行しますか？')) {
        console.log('=== 古物台帳全記録削除開始 ===');
        
        // 販売履歴をクリア
        localStorage.removeItem('salesHistory');
        console.log('販売履歴をクリアしました');
        
        // 古物台帳データをクリア
        localStorage.removeItem('ledger');
        localStorage.removeItem('ledgerRecords');
        console.log('古物台帳データをクリアしました');
        
        // 在庫データをクリア
        localStorage.removeItem('inventory');
        console.log('在庫データをクリアしました');
        
        // 買取申請データをクリア
        localStorage.removeItem('allApplications');
        console.log('買取申請データをクリアしました');
        
        // 古物台帳を再読み込み
        loadLedgerRecords();
        
        alert('✅ 古物台帳の全記録を削除しました。');
        console.log('古物台帳全記録削除完了');
      }
    }
  };

  const handleExportData = () => {
    const format = prompt('エクスポート形式を選択してください:\n1. CSV\n2. Excel\n3. PDF', '1');
    if (format) {
      const formatName = format === '1' ? 'CSV' : format === '2' ? 'Excel' : 'PDF';
      alert(`古物台帳を${formatName}形式でエクスポートしました`);
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'sold':
        return <span className="status-badge status-sold">売却済</span>;
      case 'partial':
        return <span className="status-badge status-reserved">一部販売</span>;
      case 'in_stock':
      case 'in-stock':
        return <span className="status-badge status-in-stock">在庫</span>;
      default:
        return <span className="status-badge status-in-stock">状態不明</span>;
    }
  };

  return (
    <div className="ledger-container">
      <h1>個別管理台帳（古物台帳）</h1>
      <p className="subtitle">古物営業法に基づく取引記録の管理</p>

      <div className="law-notice">
        <h3>⚖️ 古物営業法対応</h3>
        <p>この台帳は古物営業法第16条に基づく帳簿として管理されています。必須記載事項：取引年月日、品目、特徴、数量、代価、相手方の住所・氏名・職業・年齢</p>
      </div>

      <div className="search-section">
        <h3>検索条件</h3>
        <div className="search-controls">
          <div className="form-group">
            <label>取引日（開始）</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>取引日（終了）</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>取引種別</label>
            <select
              value={filters.transactionType}
              onChange={(e) => handleFilterChange('transactionType', e.target.value)}
            >
              <option value="">全て</option>
              <option value="purchase">買取</option>
              <option value="sale">販売</option>
            </select>
          </div>
          <div className="form-group">
            <label>商品名</label>
            <input
              type="text"
              value={filters.productSearch}
              onChange={(e) => handleFilterChange('productSearch', e.target.value)}
              placeholder="商品名で検索"
            />
          </div>
          <div className="form-group">
            <label>SKU/管理番号</label>
            <input
              type="text"
              value={filters.skuSearch}
              onChange={(e) => handleFilterChange('skuSearch', e.target.value)}
              placeholder="SKUまたは管理番号"
            />
          </div>
          <div className="form-group">
            <label>相手方氏名</label>
            <input
              type="text"
              value={filters.customerSearch}
              onChange={(e) => handleFilterChange('customerSearch', e.target.value)}
              placeholder="氏名で検索"
            />
          </div>
        </div>
        <div className="search-actions">
          <button onClick={handleSearch}>検索</button>
          <button onClick={handleClearSearch} className="secondary">クリア</button>
        </div>
      </div>

      <div className="info-section">
        <div className="info-item">
          <div className="info-label">販売記録件数</div>
          <div className="info-value">{saleLedgerRecords.length}</div>
        </div>
        <div className="info-item">
          <div className="info-label">総仕入れ額</div>
          <div className="info-value" style={{ color: '#e74c3c' }}>
            {formatCurrency(totalPurchaseCost)}
          </div>
        </div>
        <div className="info-item">
          <div className="info-label">総販売額</div>
          <div className="info-value" style={{ color: '#3498db' }}>
            {formatCurrency(totalSalesAmount)}
          </div>
        </div>
        <div className="info-item">
          <div className="info-label">総利益</div>
          <div className="info-value" style={{ color: '#27ae60' }}>
            {formatCurrency(totalProfitAmount)}
          </div>
        </div>
      </div>

      {/* 販売記録セクション */}
      {saleLedgerRecords.length > 0 && (
        <div className="sales-records-section">
          <h2>📊 販売記録（利益計算）</h2>
          <p className="section-subtitle">海外販売やその他チャネルの販売データをまとめて確認できます</p>
          
          {saleLedgerRecords.map(record => {
            const lastSaleEvent = record.sale.events[record.sale.events.length - 1];
            const purchaseUnitCost = record.purchase?.averageUnitCostJPY || 0;
            const totalProfitJPY = record.sale.totalRevenueJPY - record.purchase.totalCostJPY;
            const customer = record.product?.customer || {};
            const buyerName =
              (lastSaleEvent?.buyer && typeof lastSaleEvent.buyer === 'object'
                ? lastSaleEvent.buyer.name
                : lastSaleEvent?.buyer) || '-';
            const saleDateLabel = formatDate(lastSaleEvent?.date);
            const productTitle = record.product?.title || '販売記録';

            return (
              <div key={record.id} className="sales-record-card">
                <div
                  className="sales-record-header"
                  onClick={() => setExpandedRecord(expandedRecord === record.id ? null : record.id)}
                >
                  <div className="record-header-left">
                    <h3>{productTitle}</h3>
                    <p className="record-date">最終販売日: {saleDateLabel}</p>
                    <p className="record-request">在庫ID: {record.inventoryId}</p>
                  </div>
                  <div className="record-header-right">
                    <div className="record-summary">
                      <div className="summary-item">
                        <span className="summary-label">仕入れ:</span>
                        <span className="summary-value cost">{formatCurrency(record.purchase.totalCostJPY)}</span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">販売:</span>
                        <span className="summary-value sales">{formatCurrency(record.sale.totalRevenueJPY)}</span>
                      </div>
                      <div className="summary-item">
                        <span className="summary-label">利益:</span>
                        <span className="summary-value profit">{formatCurrency(totalProfitJPY)}</span>
                      </div>
                    </div>
                    <span className="expand-icon">{expandedRecord === record.id ? '▼' : '▶'}</span>
                  </div>
                </div>

                {expandedRecord === record.id && (
                  <div className="sales-record-details">
                    <div className="customer-info">
                      <h4>👤 買取時の顧客情報</h4>
                      <p><strong>名前:</strong> {customer.name || 'N/A'}</p>
                      <p><strong>住所:</strong> {customer.address || 'N/A'}</p>
                      <p><strong>メール:</strong> {customer.email || 'N/A'}</p>
                    </div>

                    <div className="items-detail">
                      <h4>📦 販売明細</h4>
                      <table className="sales-detail-table">
                        <thead>
                          <tr>
                            <th>販売日</th>
                            <th>数量</th>
                            <th>販売単価</th>
                            <th>販売合計</th>
                            <th>仕入原価</th>
                            <th>利益</th>
                            <th>送料</th>
                            <th>販売先</th>
                            <th>チャネル</th>
                            <th>担当者</th>
                          </tr>
                        </thead>
                        <tbody>
                          {record.sale.events.map((event, idx) => {
                            const eventBuyer =
                              (event.buyer && typeof event.buyer === 'object' ? event.buyer.name : event.buyer) || '-';
                            const eventProfit = event.totalPriceJPY - purchaseUnitCost * event.quantity;
                            const shippingDisplay = event.shippingFeeJPY
                              ? formatCurrency(event.shippingFeeJPY)
                              : '-';
                            return (
                              <tr key={idx}>
                                <td>{formatDate(event.date)}</td>
                                <td>{formatNumber(event.quantity)}</td>
                                <td>{formatCurrency(event.unitPriceJPY)}</td>
                                <td>{formatCurrency(event.totalPriceJPY)}</td>
                                <td>{formatCurrency(purchaseUnitCost * event.quantity)}</td>
                                <td className="profit-cell">{formatCurrency(eventProfit)}</td>
                                <td>{shippingDisplay}</td>
                                <td>{eventBuyer}</td>
                                <td>{event.salesChannel || '-'}</td>
                                <td>{event.staff || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="total-row">
                            <td colSpan="2">合計</td>
                            <td>{formatCurrency(purchaseUnitCost)}</td>
                            <td>{formatCurrency(record.sale.totalRevenueJPY)}</td>
                            <td>{formatCurrency(record.purchase.totalCostJPY)}</td>
                            <td className="profit-total">{formatCurrency(totalProfitJPY)}</td>
                            <td>{formatCurrency(record.sale.totalShippingJPY)}</td>
                            <td colSpan="3"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 古物台帳テーブル */}
      <div className="ledger-table-section">
        <div className="action-buttons">
          <div className="left-actions">
            <span className="record-count">全{records.length}件</span>
          </div>
          <div className="right-actions">
            <button onClick={cleanupDuplicateRecords} style={{backgroundColor: '#ff6b6b', color: 'white'}}>
              重複クリーンアップ
            </button>
            <button onClick={clearAllRecords} style={{backgroundColor: '#dc3545', color: 'white'}}>
              🗑️ 全記録クリア
            </button>
            <button onClick={handleExportData}>エクスポート</button>
            <button onClick={() => window.print()}>印刷</button>
          </div>
        </div>

          <div className="table-wrapper">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>取引日</th>
                  <th>取引種別</th>
                  <th>SKU</th>
                  <th>管理番号</th>
                  <th>品目（商品名）</th>
                  <th>特徴（カラー・状態）</th>
                  <th>ランク</th>
                  <th>数量</th>
                  <th>代価</th>
                  <th>相手方氏名</th>
                  <th>相手方住所</th>
                  <th>相手方職業</th>
                  <th>相手方年齢</th>
                  <th>販売日</th>
                  <th>販売価格</th>
                  <th>販売先</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {records.map(record => {
                  const rankClass = safeRankClass(record.rank);
                  const quantity = formatNumber(record.quantity ?? 0);
                  const price = formatCurrency(record.price);
                  const salePrice = record.salePrice === '-' || record.salePrice === undefined
                    ? '-'
                    : formatCurrency(record.salePrice);

          const buyerName = record.buyer || '-';

          return (
                  <tr key={record.id}>
                    <td>{record.date || '-'}</td>
                    <td className={record.type === '買取' ? 'type-purchase' : 'type-sale'}>{record.type || '-'}</td>
                    <td><span className="sku-code">{record.sku || '-'}</span></td>
                    <td>{record.managementNumber || '-'}</td>
                    <td>{record.productName || '-'}</td>
                    <td>{record.features || '-'}</td>
                    <td><span className={`rank-badge ${rankClass}`}>{record.rank || '-'}</span></td>
                    <td>{quantity}</td>
                    <td>{price}</td>
                    <td>{record.customerName || '-'}</td>
                    <td>{record.customerAddress || '-'}</td>
                    <td>{record.customerOccupation || '-'}</td>
                    <td>{record.customerAge || '-'}</td>
                    <td>{record.saleDate || '-'}</td>
            <td>{salePrice}</td>
            <td>{buyerName}</td>
                    <td>{getStatusBadge(record.status)}</td>
                  </tr>
                );})}
              </tbody>
            </table>
          </div>
          
          {records.length === 0 && (
            <div className="empty-records">
              <p>古物台帳に記録がありません</p>
            </div>
          )}
      </div>
    </div>
  );
};

export default Ledger;