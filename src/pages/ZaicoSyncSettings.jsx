import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ZaicoSyncManager from '../components/ZaicoSyncManager';
import './ZaicoSyncSettings.css';

const ZaicoSyncSettings = () => {
  const [activeTab, setActiveTab] = useState('sync');
  const navigate = useNavigate();
  
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [buybackSyncEnabled, setBuybackSyncEnabled] = useState(true);
  const [salesSyncEnabled, setSalesSyncEnabled] = useState(true);

  // コンポーネントマウント時に設定を読み込み
  useEffect(() => {
    // 同期設定の読み込み
    const savedAutoSync = localStorage.getItem('zaicoAutoSync');
    const savedBuybackSync = localStorage.getItem('zaicoBuybackSync');
    const savedSalesSync = localStorage.getItem('zaicoSalesSync');
    
    if (savedAutoSync !== null) setAutoSyncEnabled(savedAutoSync === 'true');
    if (savedBuybackSync !== null) setBuybackSyncEnabled(savedBuybackSync === 'true');
    if (savedSalesSync !== null) setSalesSyncEnabled(savedSalesSync === 'true');
  }, []);

  // 同期設定保存
  const handleSaveSyncSettings = () => {
    localStorage.setItem('zaicoAutoSync', autoSyncEnabled.toString());
    localStorage.setItem('zaicoBuybackSync', buybackSyncEnabled.toString());
    localStorage.setItem('zaicoSalesSync', salesSyncEnabled.toString());
    alert('同期設定を保存しました');
  };

  // 全データクリア
  const handleClearAllData = () => {
    if (confirm('本当に全データをクリアしますか？この操作は元に戻せません。')) {
      localStorage.clear();
      alert('全データをクリアしました。ページを再読み込みします。');
      window.location.reload();
    }
  };

  return (
    <div className="zaico-sync-settings">
      <div className="page-header">
        <h1>Zaico同期管理</h1>
        <p>Zaicoとの在庫同期設定と管理を行います</p>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          同期管理
        </button>
        <button 
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          設定
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'sync' && (
          <div className="sync-section">
            <ZaicoSyncManager />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-section">
            <div className="admin-info-card">
              <h3>🔧 管理者向け情報</h3>
              <div className="info-content">
                <p><strong>Zaico API接続設定:</strong> APIキーはサーバー側で管理されており、この画面では同期動作の設定のみ行えます。</p>
                <p><strong>API設定の変更:</strong> APIキーの設定や変更については、システム管理者またはサーバー管理者にお問い合わせください。</p>
                <p><strong>設定範囲:</strong> ここでは買取・販売時の自動同期機能の有効/無効を設定できます。</p>
              </div>
            </div>

            <div className="settings-card">
              <h3>同期動作設定</h3>
              <div className="setting-item">
                <label className="sync-setting-label">
                  <input 
                    type="checkbox" 
                    checked={autoSyncEnabled}
                    onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                  />
                  <div className="setting-details">
                    <span className="setting-title">自動同期を有効にする</span>
                    <span className="setting-description">全般的な自動同期機能のマスタースイッチです</span>
                  </div>
                </label>
              </div>
              
              <div className="setting-item">
                <label className="sync-setting-label">
                  <input 
                    type="checkbox" 
                    checked={buybackSyncEnabled}
                    onChange={(e) => setBuybackSyncEnabled(e.target.checked)}
                    disabled={!autoSyncEnabled}
                  />
                  <div className="setting-details">
                    <span className="setting-title">買取時の自動同期</span>
                    <span className="setting-description">商品買取時に自動的にZaicoに在庫情報を送信します</span>
                  </div>
                </label>
              </div>
              
              <div className="setting-item">
                <label className="sync-setting-label">
                  <input 
                    type="checkbox" 
                    checked={salesSyncEnabled}
                    onChange={(e) => setSalesSyncEnabled(e.target.checked)}
                    disabled={!autoSyncEnabled}
                  />
                  <div className="setting-details">
                    <span className="setting-title">販売時の自動同期</span>
                    <span className="setting-description">商品販売時に自動的にZaicoから在庫を減算します</span>
                  </div>
                </label>
              </div>
              
              <div className="setting-item">
                <button className="save-btn" onClick={handleSaveSyncSettings}>
                  同期設定を保存
                </button>
              </div>
            </div>

            <div className="settings-card">
              <h3>データ管理</h3>
              <div className="setting-item">
                <button className="danger-btn" onClick={handleClearAllData}>
                  全データクリア
                </button>
                <p className="warning-text">※ この操作は元に戻せません</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZaicoSyncSettings;
