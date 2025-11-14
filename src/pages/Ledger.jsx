import React, { useState, useEffect, useCallback } from 'react';
import './Ledger.css';
import { loadLedgerRecords as loadLedgerStorage, migrateLegacyLedgerData } from '../utils/ledgerRecords';

const Ledger = () => {
  const [rawLedgerRecords, setRawLedgerRecords] = useState([]);
  const [expandedRecord, setExpandedRecord] = useState(null);
  const [records, setRecords] = useState([]);
  
  // ページネーション関連
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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
      
      // 販売先住所を取得
      const buyerAddress = hasSale && lastSale?.buyer && typeof lastSale.buyer === 'object'
        ? (lastSale.buyer.postalCode || lastSale.buyer.address || lastSale.buyer.country
            ? `${lastSale.buyer.postalCode || ''} ${lastSale.buyer.address || ''} ${lastSale.buyer.country || ''}`.trim()
            : '-')
        : '-';

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
        buyerAddress: hasSale ? buyerAddress : '-',
        status: record.status
      };
    });

    tableRecords.sort((a, b) => {
      const dateA = new Date(a.rawSaleDate || a.rawPurchaseDate || 0).getTime();
      const dateB = new Date(b.rawSaleDate || b.rawPurchaseDate || 0).getTime();
      return dateB - dateA;
    });

    setRecords(tableRecords);
    // フィルター変更時にページを1にリセット
    setCurrentPage(1);
  }, [filters]);
  
  // ページネーション計算
  const totalPages = Math.ceil(records.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedRecords = records.slice(startIndex, endIndex);
  
  // ページ変更時の処理
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    // ページ変更時にスクロールをトップに戻す
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  // ページ番号入力で直接移動
  const handlePageJump = (e) => {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector('input[type="number"]');
    if (input) {
      const pageNumber = parseInt(input.value, 10);
      if (!isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages) {
        handlePageChange(pageNumber);
        input.value = '';
      } else {
        alert(`ページ番号は1から${totalPages}の間で指定してください`);
      }
    }
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

  // CSVエクスポート関数
  const exportToCSV = (data, filename) => {
    const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportData = () => {
    // CSVデータの生成
    const headers = [
      '取引日',
      '取引種別',
      'SKU',
      '管理番号',
      '品目（商品名）',
      '特徴（カラー・状態）',
      'ランク',
      '数量',
      '代価',
      '相手方氏名',
      '相手方住所',
      '相手方職業',
      '相手方年齢',
      '販売日',
      '販売価格',
      '販売先',
      '販売先住所',
      '状態'
    ];

    // 数値や日付をエスケープする関数
    const escapeCSV = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // カンマ、ダブルクォート、改行を含む場合はクォートで囲む
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // データ行の生成
    const rows = records.map(record => {
      // 価格データを数値として取得（recordオブジェクトから直接取得）
      const priceValue = record.price || 0;
      const salePriceValue = (record.salePrice === '-' || record.salePrice === undefined || record.salePrice === null) 
        ? '' 
        : (typeof record.salePrice === 'number' ? record.salePrice : parseFloat(String(record.salePrice).replace(/¥|,/g, '')) || '');
      
      return [
        record.date || '',
        record.type || '',
        record.sku || '',
        record.managementNumber || '',
        record.productName || '',
        record.features || '',
        record.rank || '',
        record.quantity || 0,
        priceValue,
        record.customerName || '',
        record.customerAddress || '',
        record.customerOccupation || '',
        record.customerAge || '',
        record.saleDate || '',
        salePriceValue,
        record.buyer || '',
        record.buyerAddress || '',
        record.status || ''
      ].map(escapeCSV).join(',');
    });

    // BOM付きUTF-8でCSVを生成（Excelで正しく開けるように）
    const csv = '\ufeff' + [headers.map(escapeCSV).join(','), ...rows].join('\n');
    
    // ファイル名を生成（現在の日付を含む）
    const filename = `古物台帳_${new Date().toISOString().split('T')[0]}.csv`;
    
    // CSVをダウンロード
    exportToCSV(csv, filename);
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
          <div className="form-group form-group-transaction-type">
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

      {/* 古物台帳テーブル */}
      <div className="ledger-table-section">
        <div className="action-buttons">
          <div className="left-actions">
            <span className="record-count">全{records.length}件</span>
          </div>
          <div className="right-actions">
            <button onClick={clearAllRecords} style={{backgroundColor: '#dc3545', color: 'white'}}>
              🗑️ 全記録クリア
            </button>
            <button onClick={handleExportData}>エクスポート</button>
            <button onClick={() => window.print()}>印刷</button>
          </div>
        </div>

        <div className="pagination-controls">
          <div className="pagination-info">
            <span>表示件数: </span>
            <select value={pageSize} onChange={(e) => handlePageSizeChange(Number(e.target.value))}>
              <option value={10}>10件</option>
              <option value={20}>20件</option>
              <option value={50}>50件</option>
              <option value={100}>100件</option>
            </select>
            <span>（{records.length}件中 {startIndex + 1}-{Math.min(endIndex, records.length)}件を表示）</span>
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
                  <th>販売先住所</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecords.map(record => {
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
                    <td>{record.buyerAddress || '-'}</td>
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
          
          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="pagination">
              <div className="pagination-main">
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
              </div>
              
              {/* ページ番号直接入力 */}
              <div className="pagination-jump">
                <form onSubmit={handlePageJump} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '14px', color: '#6c757d' }}>ページ:</span>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    placeholder={currentPage.toString()}
                    style={{
                      width: '60px',
                      padding: '6px 8px',
                      border: '1px solid #ced4da',
                      borderRadius: '4px',
                      fontSize: '14px',
                      textAlign: 'center'
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: '6px 12px',
                      border: '1px solid #007bff',
                      background: '#007bff',
                      color: 'white',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    移動
                  </button>
                </form>
              </div>
              
              <div className="pagination-info-mobile">
                <span>{currentPage} / {totalPages}</span>
              </div>
            </div>
          )}
      </div>

      <div className="law-notice">
        <h3>⚖️ 古物営業法対応</h3>
        <p>この台帳は古物営業法第16条に基づく帳簿として管理されています。必須記載事項：取引年月日、品目、特徴、数量、代価、相手方の住所・氏名・職業・年齢</p>
      </div>
    </div>
  );
};

export default Ledger;