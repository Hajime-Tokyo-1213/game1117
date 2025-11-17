/**
 * Admin Dashboard Main Page
 * Overview dashboard for admin functionality
 */

import React from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import Link from 'next/link';
import './admin.css';

export default function AdminDashboard() {
  const { user, profile } = useAuth();

  // Check admin permissions
  if (!user || !profile || !['admin', 'super_admin'].includes(profile.role)) {
    return (
      <div className="admin-access-denied">
        <h1>アクセス権限がありません</h1>
        <p>この機能を利用するには管理者権限が必要です。</p>
      </div>
    );
  }

  const adminMenuItems = [
    {
      title: 'ユーザー管理',
      description: 'システム利用者の管理と設定',
      icon: '👥',
      href: '/admin/users',
      available: true
    },
    {
      title: '商品管理',
      description: 'ゲーム商品の登録と管理',
      icon: '🎮',
      href: '/admin/products',
      available: false
    },
    {
      title: '取引管理',
      description: '買取・販売取引の監視',
      icon: '💰',
      href: '/admin/transactions',
      available: false
    },
    {
      title: '設定管理',
      description: 'システム設定の変更',
      icon: '⚙️',
      href: '/admin/settings',
      available: false
    }
  ];

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>管理者ダッシュボード</h1>
        <p>システム管理機能へようこそ、{profile.name}さん</p>
      </div>

      <div className="admin-menu-grid">
        {adminMenuItems.map((item, index) => (
          <div key={index} className={`admin-menu-item ${!item.available ? 'disabled' : ''}`}>
            {item.available ? (
              <Link href={item.href}>
                <div className="menu-icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </Link>
            ) : (
              <div>
                <div className="menu-icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span className="coming-soon">準備中</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="admin-stats">
        <h2>システム概要</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h3>総ユーザー数</h3>
              <div className="stat-value">-</div>
              <p>システム登録済み</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🔄</div>
            <div className="stat-content">
              <h3>今日のアクティビティ</h3>
              <div className="stat-value">-</div>
              <p>アクティブユーザー</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">⚠️</div>
            <div className="stat-content">
              <h3>要注意アラート</h3>
              <div className="stat-value">-</div>
              <p>確認が必要な項目</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}