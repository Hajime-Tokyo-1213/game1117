import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const Layout = ({ children }) => {
  const { user, logout, isCustomer, isOverseasCustomer, isStaff, isManager } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingEstimatesCount, setPendingEstimatesCount] = useState(0);
  const [pendingSalesCount, setPendingSalesCount] = useState(0);
  
  // ドロップダウンメニューの開閉状態
  const [openDropdown, setOpenDropdown] = useState(null); // 'business', 'analytics', 'settings'

  const handleLogout = () => {
    const currentRole = user?.role;
    logout();
    
    // roleに応じて適切なログイン画面にリダイレクト
    if (currentRole === 'overseas_customer') {
      navigate('/intl/portal/auth');
    } else if (['staff', 'manager', 'admin'].includes(currentRole)) {
      navigate('/sys/staff/auth');
    } else {
      navigate('/login');
    }
  };

  const isActive = (path) => location.pathname === path;

  // ドロップダウンの開閉
  const toggleDropdown = (menu) => {
    setOpenDropdown(openDropdown === menu ? null : menu);
  };

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = () => setOpenDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // お客様の場合、承認待ちの見積もりをカウント
  // スタッフの場合、進行中の取引をカウント
  // 海外顧客の場合、見積もり受領済みをカウント
  useEffect(() => {
    if (isCustomer && user?.email) {
      const allApplications = JSON.parse(localStorage.getItem('allApplications') || '[]');
      const myPendingApps = allApplications.filter(
        app => app.customer.email === user.email && app.status === 'awaiting_approval'
      );
      setPendingEstimatesCount(myPendingApps.length);
    } else if (isOverseasCustomer && user?.email) {
      const salesRequests = JSON.parse(localStorage.getItem('salesRequests') || '[]');
      const myQuotedRequests = salesRequests.filter(
        req => req.customer.email === user.email && req.status === 'quoted'
      );
      setPendingEstimatesCount(myQuotedRequests.length);
    } else if (isStaff) {
      const allApplications = JSON.parse(localStorage.getItem('allApplications') || '[]');
      // 進行中の取引（in_inventory以外）をカウント
      const ongoingApps = allApplications.filter(app => app.status !== 'in_inventory');
      setPendingEstimatesCount(ongoingApps.length);
      
      // 販売リクエストの見積もり待ちをカウント
      const salesRequests = JSON.parse(localStorage.getItem('salesRequests') || '[]');
      const pendingSales = salesRequests.filter(req => req.status === 'pending');
      setPendingSalesCount(pendingSales.length);
    }
  }, [isCustomer, isOverseasCustomer, isStaff, user?.email, location.pathname]); // location変更時も更新

  return (
    <div className="layout">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <Link to="/">
              {isOverseasCustomer ? '🎮 Game Trading System' : '🎮 ゲーム買取システム'}
            </Link>
          </div>
          
          <nav className="nav-menu">
            {isCustomer && (
              <>
                <Link to="/buyback" className={isActive('/buyback') ? 'active' : ''}>
                  買取申込
                </Link>
                <Link to="/my-applications" className={`nav-link-with-badge ${isActive('/my-applications') ? 'active' : ''}`}>
                  申込履歴
                  {pendingEstimatesCount > 0 && (
                    <span className="notification-badge">{pendingEstimatesCount}</span>
                  )}
                </Link>
              </>
            )}

            {isOverseasCustomer && (
              <>
                <Link to="/sales-request" className={isActive('/sales-request') ? 'active' : ''}>
                  Product Request
                </Link>
                <Link to="/my-orders" className={`nav-link-with-badge ${isActive('/my-orders') ? 'active' : ''}`}>
                  Order History
                  {pendingEstimatesCount > 0 && (
                    <span className="notification-badge">{pendingEstimatesCount}</span>
                  )}
                </Link>
              </>
            )}
            
            {isStaff && (
              <>
                {/* 業務メニュー */}
                <div 
                  className="dropdown-menu" 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDropdown('business');
                  }}
                >
                  <button className={`dropdown-trigger ${openDropdown === 'business' ? 'active' : ''}`}>
                    📋 業務 ▼
                    {(pendingEstimatesCount > 0 || pendingSalesCount > 0) && (
                      <span className="notification-badge">{pendingEstimatesCount + pendingSalesCount}</span>
                    )}
                  </button>
                  {openDropdown === 'business' && (
                    <div className="dropdown-content business-dropdown">
                      <Link to="/rating" className={isActive('/rating') ? 'active' : ''}>
                        <div className="settings-item">
                          <span className="settings-item-title">
                            💰 買取査定
                            {pendingEstimatesCount > 0 && (
                              <span className="notification-badge-small">{pendingEstimatesCount}</span>
                            )}
                          </span>
                          <span className="settings-item-desc">顧客からの買取申請を査定・承認</span>
                        </div>
                      </Link>
                      <Link to="/sales" className={isActive('/sales') ? 'active' : ''}>
                        <div className="settings-item">
                          <span className="settings-item-title">
                            💼 販売管理
                            {pendingSalesCount > 0 && (
                              <span className="notification-badge-small">{pendingSalesCount}</span>
                            )}
                          </span>
                          <span className="settings-item-desc">販売処理と見積もり作成</span>
                        </div>
                      </Link>
                      <Link to="/inventory" className={isActive('/inventory') ? 'active' : ''}>
                        <div className="settings-item">
                          <span className="settings-item-title">📦 在庫管理</span>
                          <span className="settings-item-desc">在庫の確認と管理</span>
                        </div>
                      </Link>
                      <Link to="/ledger" className={isActive('/ledger') ? 'active' : ''}>
                        <div className="settings-item">
                          <span className="settings-item-title">📋 古物台帳</span>
                          <span className="settings-item-desc">古物営業法に基づく台帳管理</span>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>
              </>
            )}
            
            {isManager && (
              <>
                {/* 分析メニュー */}
                <div 
                  className="dropdown-menu" 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDropdown('analytics');
                  }}
                >
                  <button className={`dropdown-trigger ${openDropdown === 'analytics' ? 'active' : ''}`}>
                    📊 分析 ▼
                  </button>
                  {openDropdown === 'analytics' && (
                    <div className="dropdown-content analytics-dropdown">
                      <Link to="/dashboard" className={isActive('/dashboard') ? 'active' : ''}>
                        <div className="settings-item">
                          <span className="settings-item-title">📊 ダッシュボード</span>
                          <span className="settings-item-desc">売上・買取の概要を確認</span>
                        </div>
                      </Link>
                      <Link to="/sales-analytics" className={isActive('/sales-analytics') ? 'active' : ''}>
                        <div className="settings-item">
                          <span className="settings-item-title">📈 販売分析</span>
                          <span className="settings-item-desc">販売データの詳細分析</span>
                        </div>
                      </Link>
                    </div>
                  )}
                </div>

                {/* 設定メニュー */}
                <div 
                  className="dropdown-menu" 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDropdown('settings');
                  }}
                >
                  <button className={`dropdown-trigger ${openDropdown === 'settings' ? 'active' : ''}`}>
                    ⚙️ 設定 ▼
                  </button>
                  {openDropdown === 'settings' && (
                    <div className="dropdown-content settings-dropdown">
                      <div className="settings-category">
                        <div className="settings-category-title">📊 マスタ管理</div>
                        <Link to="/sys/admin/pricing-management" className={isActive('/sys/admin/pricing-management') ? 'active' : ''}>
                          <div className="settings-item">
                            <span className="settings-item-title">💰 価格管理</span>
                            <span className="settings-item-desc">商品の買取価格を設定</span>
                          </div>
                        </Link>
                        <Link to="/sys/admin/product-management" className={isActive('/sys/admin/product-management') ? 'active' : ''}>
                          <div className="settings-item">
                            <span className="settings-item-title">🎮 商品マスタ</span>
                            <span className="settings-item-desc">機種やソフトの情報を管理</span>
                          </div>
                        </Link>
                        <Link to="/settings/color-library" className={isActive('/settings/color-library') ? 'active' : ''}>
                          <div className="settings-item">
                            <span className="settings-item-title">🎨 カラーライブラリ</span>
                            <span className="settings-item-desc">商品のカラー情報を管理</span>
                          </div>
                        </Link>
                      </div>
                      
                      <div className="settings-category">
                        <div className="settings-category-title">👥 ユーザー・アカウント</div>
                        <Link to="/sys/admin/user-management" className={isActive('/sys/admin/user-management') ? 'active' : ''}>
                          <div className="settings-item">
                            <span className="settings-item-title">👤 ユーザー管理</span>
                            <span className="settings-item-desc">顧客アカウントを管理</span>
                          </div>
                        </Link>
                        <Link to="/sys/admin/staff-management" className={isActive('/sys/admin/staff-management') ? 'active' : ''}>
                          <div className="settings-item">
                            <span className="settings-item-title">👥 スタッフ管理</span>
                            <span className="settings-item-desc">スタッフアカウントを管理</span>
                          </div>
                        </Link>
                      </div>
                      
                      <div className="settings-category">
                        <div className="settings-category-title">🔧 システム連携</div>
                        <Link to="/settings/zaico-sync" className={isActive('/settings/zaico-sync') ? 'active' : ''}>
                          <div className="settings-item">
                            <span className="settings-item-title">🔄 Zaico同期管理</span>
                            <span className="settings-item-desc">Zaicoとの在庫同期を管理</span>
                          </div>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </nav>
          
          <div className="user-info">
            <Link to="/account-settings" className="user-name-link">
              <span className="user-name">{user?.name}</span>
              <span className="user-role">({getRoleDisplay(user?.role, isOverseasCustomer)})</span>
            </Link>
            <button onClick={handleLogout} className="logout-button">
              {isOverseasCustomer ? 'Logout' : 'ログアウト'}
            </button>
          </div>
        </div>
      </header>
      
      <main className="main-content">
        {children}
      </main>
      
      <footer className="footer">
        <p>
          {isOverseasCustomer 
            ? '© 2024 Game Trading System' 
            : '© 2024 中古ゲーム機買取・在庫管理システム'
          }
        </p>
      </footer>
    </div>
  );
};

const getRoleDisplay = (role, isOverseas) => {
  if (isOverseas) {
    return 'Buyer';
  }
  
  switch(role) {
    case 'customer': return 'お客様';
    case 'overseas_customer': return 'Buyer';
    case 'staff': return 'スタッフ';
    case 'manager': return 'マネージャー';
    case 'admin': return '管理者';
    default: return '';
  }
};

export default Layout;