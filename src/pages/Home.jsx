import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Home.css';

const Home = () => {
  const { user, isCustomer, isOverseasCustomer, isStaff, isManager } = useAuth();

  return (
    <div className="home-container">
      <h1>
        {isOverseasCustomer 
          ? `Welcome, ${user?.name}` 
          : `ようこそ、${user?.name}さん`
        }
      </h1>
      
      {isCustomer && (
        <div className="welcome-section">
          <h2>お客様メニュー</h2>
          <div className="menu-grid">
            <Link to="/buyback" className="menu-card">
              <div className="menu-icon">📦</div>
              <h3>買取申込</h3>
              <p>お持ちのゲーム機を簡単に買取申込</p>
            </Link>
            <Link to="/my-applications" className="menu-card">
              <div className="menu-icon">📋</div>
              <h3>申込履歴</h3>
              <p>過去の申込状況を確認</p>
            </Link>
          </div>
        </div>
      )}

      {isOverseasCustomer && (
        <div className="welcome-section">
          <h2>Customer Portal</h2>
          <p>現在、海外バイヤー向けの機能はスタッフ側で管理されています。ご質問がございましたら、スタッフまでお問い合わせください。</p>
        </div>
      )}

      {isStaff && (
        <div className="welcome-section">
          <h2>業務メニュー</h2>
          <div className="menu-grid">
            <Link to="/rating" className="menu-card">
              <div className="menu-icon">💰</div>
              <h3>買取査定</h3>
              <p>申込商品の査定を行う</p>
            </Link>
            <Link to="/sales" className="menu-card">
              <div className="menu-icon">🛒</div>
              <h3>販売管理</h3>
              <p>商品の販売処理を管理</p>
            </Link>
            <Link to="/inventory" className="menu-card">
              <div className="menu-icon">📊</div>
              <h3>在庫管理</h3>
              <p>在庫状況を確認・管理</p>
            </Link>
            <Link to="/ledger" className="menu-card">
              <div className="menu-icon">📚</div>
              <h3>古物台帳</h3>
              <p>取引記録の管理</p>
            </Link>
          </div>
        </div>
      )}

      {isManager && (
        <div className="welcome-section">
          <h2>管理メニュー</h2>
          <div className="menu-grid">
            <Link to="/dashboard" className="menu-card special">
              <div className="menu-icon">📈</div>
              <h3>経営ダッシュボード</h3>
              <p>売上分析・経営指標の確認</p>
            </Link>
            <Link to="/sales-analytics" className="menu-card special">
              <div className="menu-icon">📊</div>
              <h3>販売分析</h3>
              <p>顧客・商品の詳細分析</p>
            </Link>
          </div>
        </div>
      )}

    </div>
  );
};

export default Home;