import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import './Dashboard.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const Dashboard = () => {
  const [period, setPeriod] = useState('month');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [availableCustomers, setAvailableCustomers] = useState([]);
  const [selectedRanks, setSelectedRanks] = useState(['S', 'A', 'B', 'C']);
  const [dashboardData, setDashboardData] = useState({
    kpiData: {
      totalSales: 0,
      totalPurchases: 0,
      grossProfit: 0,
      transactions: 0,
      salesChange: 0,
      purchaseChange: 0,
      profitChange: 0,
      transactionChange: 0
    },
    salesTrendData: {
      labels: [],
      datasets: []
    },
    productSalesData: {
      labels: [],
      datasets: []
    },
    salesVolumeData: {
      labels: [],
      datasets: []
    },
    customerSalesData: {
      labels: [],
      datasets: []
    }
  });
  const [loading, setLoading] = useState(true);

  // データを読み込んで計算する関数
  const loadDashboardData = () => {
    setLoading(true);
    
    try {
      // localStorageからデータを取得
      const salesLedger = JSON.parse(localStorage.getItem('salesLedger') || '[]');
      const applications = JSON.parse(localStorage.getItem('allApplications') || '[]');
      const inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
      
      console.log('📊 ダッシュボードデータ読み込み:', {
        salesLedger: salesLedger.length,
        applications: applications.length,
        inventory: inventory.length,
        startDate,
        endDate
      });
      
      // 期間フィルタリング
      let filteredSales = salesLedger;
      let filteredApplications = applications;
      let filteredInventory = inventory;
      
      if (startDate && endDate) {
        filteredSales = salesLedger.filter(sale => {
          const saleDate = new Date(sale.soldDate || sale.date);
          return saleDate >= new Date(startDate) && saleDate <= new Date(endDate);
        });
        
        filteredApplications = applications.filter(app => {
          const appDate = new Date(app.date);
          return appDate >= new Date(startDate) && appDate <= new Date(endDate);
        });
        
        // 在庫データから買取記録を取得
        filteredInventory = inventory.filter(inv => {
          if ((inv.sourceType === 'customer' || inv.sourceType === 'zaico_import') && inv.registeredDate) {
            const invDate = new Date(inv.registeredDate);
            return invDate >= new Date(startDate) && invDate <= new Date(endDate);
          }
          return false;
        });
      } else {
        // 期間が設定されていない場合は当月のデータを使用
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        filteredSales = salesLedger.filter(sale => {
          const saleDate = new Date(sale.soldDate || sale.date);
          return saleDate >= firstDay && saleDate <= lastDay;
        });
        
        filteredApplications = applications.filter(app => {
          const appDate = new Date(app.date);
          return appDate >= firstDay && appDate <= lastDay;
        });
        
        // 在庫データから買取記録を取得
        filteredInventory = inventory.filter(inv => {
          if ((inv.sourceType === 'customer' || inv.sourceType === 'zaico_import') && inv.registeredDate) {
            const invDate = new Date(inv.registeredDate);
            return invDate >= firstDay && invDate <= lastDay;
          }
          return false;
        });
      }
      
      // KPI計算
      const totalSales = filteredSales.reduce((sum, sale) => {
        return sum + (sale.summary?.totalSalesAmount || 0);
      }, 0);
      
      const totalPurchases = filteredApplications.reduce((sum, app) => {
        if (app.items && app.items.length > 0) {
          const appTotal = app.items.reduce((itemSum, item) => {
            return itemSum + ((item.buybackPrice || 0) * (item.quantity || 1));
          }, 0);
          return sum + appTotal;
        }
        return sum + (app.totalEstimate || 0);
      }, 0);
      
      // 在庫データから買取金額を追加
      const inventoryPurchases = filteredInventory.reduce((sum, inv) => {
        const buybackPrice = inv.acquisitionPrice || inv.buybackPrice || 0;
        const quantity = inv.quantity || 1;
        return sum + (buybackPrice * quantity);
      }, 0);
      
      const totalPurchasesWithInventory = totalPurchases + inventoryPurchases;
      
      const grossProfit = totalSales - totalPurchasesWithInventory;
      const transactions = filteredSales.length + filteredApplications.length + filteredInventory.length;
      
      console.log('📊 KPI計算結果:', {
        totalSales,
        totalPurchases,
        inventoryPurchases,
        totalPurchasesWithInventory,
        grossProfit,
        transactions,
        filteredSales: filteredSales.length,
        filteredApplications: filteredApplications.length,
        filteredInventory: filteredInventory.length
      });
      
      // 前年同期比の計算（簡易版）
      const currentYear = new Date().getFullYear();
      const lastYearStart = new Date(currentYear - 1, 0, 1).toISOString().split('T')[0];
      const lastYearEnd = new Date(currentYear - 1, 11, 31).toISOString().split('T')[0];
      
      const lastYearSales = salesLedger.filter(sale => {
        const saleDate = new Date(sale.soldDate || sale.date);
        return saleDate >= new Date(lastYearStart) && saleDate <= new Date(lastYearEnd);
      }).reduce((sum, sale) => sum + (sale.summary?.totalSalesAmount || 0), 0);
      
      const salesChange = lastYearSales > 0 ? ((totalSales - lastYearSales) / lastYearSales * 100) : 0;
      
      // 月別売上データの生成
      const monthlyData = generateMonthlyData(filteredSales, filteredApplications, filteredInventory);
      
      // 商品別売上データの生成
      const productData = generateProductData(filteredSales);
      
      // 販売数量データの生成
      const volumeData = generateSalesVolumeData(filteredSales);
      
      // 顧客別売上データの生成
      const customerData = generateCustomerSalesData(filteredSales);
      
      // 顧客リストの生成
      const customers = generateCustomerList(filteredSales);
      setAvailableCustomers(customers);
      
      // 初期選択（最初の2つの顧客を選択）
      if (selectedCustomers.length === 0 && customers.length > 0) {
        setSelectedCustomers(customers.slice(0, 2).map(c => c.id));
      }
      
      setDashboardData({
        kpiData: {
          totalSales,
          totalPurchases: totalPurchasesWithInventory,
          grossProfit,
          transactions,
          salesChange: Math.round(salesChange * 10) / 10,
          purchaseChange: 0, // 簡易実装
          profitChange: Math.round(salesChange * 10) / 10,
          transactionChange: 0 // 簡易実装
        },
        salesTrendData: monthlyData,
        productSalesData: productData,
        salesVolumeData: volumeData,
        customerSalesData: customerData
      });
      
    } catch (error) {
      console.error('ダッシュボードデータの読み込みエラー:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // 月別データ生成
  const generateMonthlyData = (sales, applications, inventory) => {
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const salesData = new Array(12).fill(0);
    const purchaseData = new Array(12).fill(0);
    
    sales.forEach(sale => {
      const month = new Date(sale.soldDate || sale.date).getMonth();
      salesData[month] += sale.summary?.totalSalesAmount || 0;
    });
    
    applications.forEach(app => {
      const month = new Date(app.date).getMonth();
      if (app.items && app.items.length > 0) {
        const appTotal = app.items.reduce((sum, item) => {
          return sum + ((item.buybackPrice || 0) * (item.quantity || 1));
        }, 0);
        purchaseData[month] += appTotal;
      } else {
        purchaseData[month] += app.totalEstimate || 0;
      }
    });
    
    // 在庫データから買取金額を追加
    inventory.forEach(inv => {
      if ((inv.sourceType === 'customer' || inv.sourceType === 'zaico_import') && inv.registeredDate) {
        const month = new Date(inv.registeredDate).getMonth();
        const buybackPrice = inv.acquisitionPrice || inv.buybackPrice || 0;
        const quantity = inv.quantity || 1;
        purchaseData[month] += buybackPrice * quantity;
      }
    });
    
    return {
      labels: months,
      datasets: [
        {
          label: '売上',
          data: salesData,
          borderColor: '#27ae60',
          backgroundColor: 'rgba(39, 174, 96, 0.1)',
          tension: 0.1
        },
        {
          label: '買取',
          data: purchaseData,
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          tension: 0.1
        }
      ]
    };
  };
  
  // 商品別データ生成
  const generateProductData = (sales) => {
    const productSales = {};
    
    console.log('🔍 商品別売上構成 - 販売データ:', sales.length, '件');
    
    sales.forEach(sale => {
      if (sale.items) {
        sale.items.forEach(item => {
          // 販売記録の商品名を取得
          const productName = item.product || item.consoleLabel || item.manufacturerLabel || '不明';
          // 販売記録の実際の売上金額を使用
          const salesAmount = item.totalSalesAmount || 0;
          productSales[productName] = (productSales[productName] || 0) + salesAmount;
          
          console.log(`📦 商品: ${productName}, 売上: ¥${salesAmount.toLocaleString()}`);
        });
      }
    });
    
    // 売上金額でソート（降順）
    const sortedProducts = Object.entries(productSales)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10); // 上位10商品のみ表示
    
    const labels = sortedProducts.map(([name]) => name);
    const data = sortedProducts.map(([,amount]) => amount);
    const colors = ['#3498db', '#e74c3c', '#f39c12', '#27ae60', '#9b59b6', '#1abc9c', '#e67e22', '#9b59b6', '#34495e', '#16a085'];
    
    console.log('📊 商品別売上構成 - 最終データ:', { labels, data });
    
    // データが空の場合はデフォルトデータを返す
    if (labels.length === 0) {
      console.log('⚠️ 商品別売上構成 - データがありません');
      return {
        labels: ['データなし'],
        datasets: [{
          data: [1],
          backgroundColor: ['#bdc3c7']
        }]
      };
    }
    
    return {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, labels.length)
      }]
    };
  };
  
  // 販売数量データ生成
  const generateSalesVolumeData = (sales) => {
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const volumeData = new Array(12).fill(0);
    
    sales.forEach(sale => {
      const month = new Date(sale.soldDate || sale.date).getMonth();
      if (sale.items) {
        sale.items.forEach(item => {
          volumeData[month] += item.quantity || 1;
        });
      }
    });
    
    return {
      labels: months,
      datasets: [{
        label: '販売数量',
        data: volumeData,
        borderColor: '#9b59b6',
        backgroundColor: 'rgba(155, 89, 182, 0.1)',
        tension: 0.1
      }]
    };
  };
  
  // 当月日別推移データ生成
  const generateDailyTrendData = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    const sales = JSON.parse(localStorage.getItem('salesLedger') || '[]');
    const applications = JSON.parse(localStorage.getItem('allApplications') || '[]');
    const inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
    
    const dailySales = new Array(daysInMonth).fill(0);
    const dailyPurchases = new Array(daysInMonth).fill(0);
    
    // 販売データの処理
    sales.forEach(sale => {
      const saleDate = new Date(sale.soldDate || sale.date);
      if (saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear) {
        const day = saleDate.getDate() - 1;
        if (day >= 0 && day < daysInMonth) {
          dailySales[day] += sale.summary?.totalSalesAmount || 0;
        }
      }
    });
    
    // 買取データの処理（申請データ）
    applications.forEach(app => {
      const appDate = new Date(app.date);
      if (appDate.getMonth() === currentMonth && appDate.getFullYear() === currentYear) {
        const day = appDate.getDate() - 1;
        if (day >= 0 && day < daysInMonth) {
          if (app.items && app.items.length > 0) {
            const appTotal = app.items.reduce((sum, item) => {
              return sum + ((item.buybackPrice || 0) * (item.quantity || 1));
            }, 0);
            dailyPurchases[day] += appTotal;
          } else {
            dailyPurchases[day] += app.totalEstimate || 0;
          }
        }
      }
    });
    
    // 在庫データから買取金額を追加
    inventory.forEach(inv => {
      if ((inv.sourceType === 'customer' || inv.sourceType === 'zaico_import') && inv.registeredDate) {
        const invDate = new Date(inv.registeredDate);
        if (invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear) {
          const day = invDate.getDate() - 1;
          if (day >= 0 && day < daysInMonth) {
            const buybackPrice = inv.acquisitionPrice || inv.buybackPrice || 0;
            const quantity = inv.quantity || 1;
            dailyPurchases[day] += buybackPrice * quantity;
          }
        }
      }
    });
    
    const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}日`);
    
    return {
      labels,
      datasets: [
        {
          label: '売上',
          data: dailySales,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          tension: 0.1
        },
        {
          label: '買取',
          data: dailyPurchases,
          borderColor: '#e74c3c',
          backgroundColor: 'rgba(231, 76, 60, 0.1)',
          tension: 0.1
        }
      ]
    };
  };
  
  // 顧客別売上データ生成
  const generateCustomerSalesData = (sales) => {
    const customerSales = {};
    
    sales.forEach(sale => {
      const customerName = sale.customer?.name || '不明';
      if (!customerSales[customerName]) {
        customerSales[customerName] = 0;
      }
      customerSales[customerName] += sale.summary?.totalSalesAmount || 0;
    });
    
    const labels = Object.keys(customerSales);
    const data = Object.values(customerSales);
    const colors = ['#3498db', '#e74c3c', '#f39c12', '#27ae60', '#9b59b6', '#1abc9c'];
    
    return {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, labels.length)
      }]
    };
  };
  
  // 顧客リスト生成
  const generateCustomerList = (sales) => {
    const customerMap = new Map();
    
    sales.forEach(sale => {
      const customerName = sale.customer?.name || '不明';
      if (!customerMap.has(customerName)) {
        customerMap.set(customerName, {
          id: customerName.toLowerCase().replace(/\s+/g, '-'),
          name: customerName,
          totalSales: 0,
          rankData: { S: 0, A: 0, B: 0, C: 0 }
        });
      }
      
      const customer = customerMap.get(customerName);
      customer.totalSales += sale.summary?.totalSalesAmount || 0;
      
      // ランク別データの集計
      if (sale.items) {
        sale.items.forEach(item => {
          const rank = item.rank || 'C';
          const amount = item.totalSalesAmount || 0;
          customer.rankData[rank] = (customer.rankData[rank] || 0) + amount;
        });
      }
    });
    
    return Array.from(customerMap.values()).sort((a, b) => b.totalSales - a.totalSales);
  };
  
  // 顧客別・ランク別売上データ生成
  const generateCustomerRankData = () => {
    if (selectedCustomers.length === 0) {
      return {
        labels: ['Sランク', 'Aランク', 'Bランク', 'Cランク'],
        datasets: []
      };
    }
    
    const selectedCustomerData = availableCustomers.filter(customer => 
      selectedCustomers.includes(customer.id)
    );
    
    const colors = ['#3498db', '#e74c3c', '#f39c12', '#27ae60', '#9b59b6', '#1abc9c'];
    
    return {
      labels: ['Sランク', 'Aランク', 'Bランク', 'Cランク'],
      datasets: selectedCustomerData.map((customer, index) => ({
        label: customer.name,
        data: [
          customer.rankData.S || 0,
          customer.rankData.A || 0,
          customer.rankData.B || 0,
          customer.rankData.C || 0
        ],
        backgroundColor: colors[index % colors.length]
      }))
    };
  };
  
  // 初期化
  useEffect(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
  }, []);

  // データ読み込み
  useEffect(() => {
    if (startDate && endDate) {
      loadDashboardData();
    }
  }, [startDate, endDate]);

  const handleUpdateDashboard = () => {
    loadDashboardData();
  };

  // 期間選択の処理
  const handlePeriodChange = (selectedPeriod) => {
    setPeriod(selectedPeriod);
    
    const now = new Date();
    let start, end;
    
    switch (selectedPeriod) {
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      case 'custom':
        // カスタム期間の場合は現在の日付を維持
        return;
      default:
        return;
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const handleExportReport = (format) => {
    const formatName = format === 'pdf' ? 'PDF' : 'Excel';
    alert(`${formatName}レポートを生成しています...`);
  };

  const handleCustomerToggle = (customerId) => {
    setSelectedCustomers(prev => 
      prev.includes(customerId) 
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const handleRankToggle = (rank) => {
    setSelectedRanks(prev => 
      prev.includes(rank)
        ? prev.filter(r => r !== rank)
        : [...prev, rank]
    );
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>経営ダッシュボード</h1>
        <p className="subtitle">売買データの分析と可視化</p>
        
        <div className="dashboard-controls">
          <div className="period-selector">
            <h3>📅 期間選択</h3>
            <div className="period-buttons">
              <button 
                className={`period-btn ${period === 'month' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('month')}
              >
                📈 月別
              </button>
              <button 
                className={`period-btn ${period === 'quarter' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('quarter')}
              >
                📊 四半期
              </button>
              <button 
                className={`period-btn ${period === 'year' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('year')}
              >
                📅 年別
              </button>
              <button 
                className={`period-btn ${period === 'custom' ? 'active' : ''}`}
                onClick={() => handlePeriodChange('custom')}
              >
                📋 期間指定
              </button>
            </div>
          </div>
          
          {period === 'custom' && (
            <div className="custom-date-range">
              <div className="date-inputs">
                <label>開始日</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <span>〜</span>
                <label>終了日</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </div>
      
      {loading ? (
        <div className="loading-message">
          <p>📊 データを読み込み中...</p>
        </div>
      ) : (
        <div className="kpi-cards">
          <div className="kpi-card">
            <div className="kpi-icon sales">💰</div>
            <div className="kpi-value">¥{dashboardData.kpiData.totalSales.toLocaleString()}</div>
            <div className="kpi-label">総売上高</div>
            <div className={`kpi-change ${dashboardData.kpiData.salesChange > 0 ? 'positive' : 'negative'}`}>
              <span>{dashboardData.kpiData.salesChange > 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(dashboardData.kpiData.salesChange)}% (前年同期比)</span>
            </div>
          </div>
          
          <div className="kpi-card">
            <div className="kpi-icon purchase">📦</div>
            <div className="kpi-value">¥{dashboardData.kpiData.totalPurchases.toLocaleString()}</div>
            <div className="kpi-label">総買取額</div>
            <div className={`kpi-change ${dashboardData.kpiData.purchaseChange > 0 ? 'positive' : 'negative'}`}>
              <span>{dashboardData.kpiData.purchaseChange > 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(dashboardData.kpiData.purchaseChange)}% (前年同期比)</span>
            </div>
          </div>
          
          <div className="kpi-card">
            <div className="kpi-icon profit">📈</div>
            <div className="kpi-value">¥{dashboardData.kpiData.grossProfit.toLocaleString()}</div>
            <div className="kpi-label">粗利益</div>
            <div className={`kpi-change ${dashboardData.kpiData.profitChange > 0 ? 'positive' : 'negative'}`}>
              <span>{dashboardData.kpiData.profitChange > 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(dashboardData.kpiData.profitChange)}% (前年同期比)</span>
            </div>
          </div>
          
          <div className="kpi-card">
            <div className="kpi-icon customers">🏢</div>
            <div className="kpi-value">{dashboardData.kpiData.transactions}</div>
            <div className="kpi-label">取引件数</div>
            <div className={`kpi-change ${dashboardData.kpiData.transactionChange > 0 ? 'positive' : 'negative'}`}>
              <span>{dashboardData.kpiData.transactionChange > 0 ? '↑' : '↓'}</span>
              <span>{Math.abs(dashboardData.kpiData.transactionChange)}% (前年同期比)</span>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid-layout">
        <div className="chart-section">
          <div className="chart-header">
            <h2 className="chart-title">📈 売上・買取推移</h2>
            <p className="chart-subtitle">期間別の売上と買取の推移を表示</p>
          </div>
          <div className="chart-container">
            <Line 
              data={dashboardData.salesTrendData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'top' }
                }
              }} 
            />
          </div>
        </div>
        
        <div className="chart-section">
          <div className="chart-header">
            <h2 className="chart-title">📅 当月日別推移</h2>
            <p className="chart-subtitle">今月の日別売上・買取推移</p>
          </div>
          <div className="chart-container">
            <Line 
              data={generateDailyTrendData()} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'top' }
                }
              }} 
            />
          </div>
        </div>
      </div>
      
      <div className="grid-layout">
        <div className="chart-section">
          <div className="chart-header">
            <h2 className="chart-title">🎮 商品別売上構成</h2>
            <p className="chart-subtitle">売上金額別の商品構成比</p>
          </div>
          <div className="chart-container">
            <Pie 
              data={dashboardData.productSalesData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'right' }
                }
              }} 
            />
          </div>
        </div>
        
        <div className="chart-section">
          <div className="chart-header">
            <h2 className="chart-title">📊 売上・買取構成比</h2>
            <p className="chart-subtitle">売上と買取の比率</p>
          </div>
          <div className="chart-container">
            <Doughnut 
              data={{
                labels: ['売上', '買取'],
                datasets: [{
                  data: [
                    dashboardData.kpiData?.totalSales || 0, 
                    dashboardData.kpiData?.totalPurchases || 0
                  ],
                  backgroundColor: ['#3498db', '#e74c3c'],
                  borderWidth: 2
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'right' }
                }
              }} 
            />
          </div>
        </div>
      </div>
      
      <div className="chart-section">
        <div className="chart-header">
          <h2 className="chart-title">顧客別・ランク別売上比較</h2>
        </div>
        
        <div className="customer-selector">
          <h3>顧客選択（複数選択可）</h3>
          {availableCustomers.length > 0 ? (
            <div className="checkbox-group">
              {availableCustomers.map(customer => (
                <label key={customer.id}>
                  <input 
                    type="checkbox" 
                    checked={selectedCustomers.includes(customer.id)}
                    onChange={() => handleCustomerToggle(customer.id)}
                  /> 
                  {customer.name} (¥{customer.totalSales.toLocaleString()})
                </label>
              ))}
            </div>
          ) : (
            <p style={{color: '#7f8c8d', fontStyle: 'italic'}}>
              選択した期間に顧客データがありません
            </p>
          )}
        </div>
        
        <div className="rank-selector">
          <h3>ランク選択（複数選択可）</h3>
          <div className="checkbox-group">
            {['S', 'A', 'B', 'C'].map(rank => (
              <label key={rank}>
                <input 
                  type="checkbox" 
                  checked={selectedRanks.includes(rank)}
                  onChange={() => handleRankToggle(rank)}
                /> 
                {rank}ランク
              </label>
            ))}
          </div>
        </div>
        
        <div className="chart-container">
          <Bar 
            data={generateCustomerRankData()}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: 'top' }
              }
            }}
          />
        </div>
      </div>
      
      
    </div>
  );
};

export default Dashboard;