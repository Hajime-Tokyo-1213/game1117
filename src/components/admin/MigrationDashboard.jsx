/**
 * Migration Dashboard Component
 * Admin interface for monitoring and controlling data migration to Supabase
 */

import React, { useState, useEffect } from 'react';
import { useMigration } from '../../utils/localStorage/extractor.js';
import './MigrationDashboard.css';

export const MigrationDashboard = () => {
  const { 
    status, 
    progress, 
    error, 
    results,
    startMigration, 
    exportData,
    validateData,
    getStorageInfo,
    reset
  } = useMigration();

  const [storageInfo, setStorageInfo] = useState(null);
  const [validationResults, setValidationResults] = useState(null);
  const [migrationOptions, setMigrationOptions] = useState({
    dryRun: false,
    clearAfterMigration: false,
    batchSize: 100,
    continueOnError: true
  });

  useEffect(() => {
    // Load storage information on component mount
    try {
      const info = getStorageInfo();
      setStorageInfo(info);
    } catch (err) {
      console.error('Failed to load storage info:', err);
    }
  }, []);

  useEffect(() => {
    // Update storage info when migration completes
    if (status === 'completed') {
      try {
        const info = getStorageInfo();
        setStorageInfo(info);
      } catch (err) {
        console.error('Failed to update storage info:', err);
      }
    }
  }, [status]);

  const handleValidate = () => {
    try {
      const validation = validateData();
      setValidationResults(validation);
    } catch (err) {
      setValidationResults({
        isValid: false,
        issues: [err.message],
        data: null
      });
    }
  };

  const handleStartMigration = () => {
    if (status === 'running') return;
    
    startMigration(migrationOptions);
  };

  const handleExport = async () => {
    try {
      await exportData();
      alert('データのエクスポートが完了しました');
    } catch (err) {
      alert('エクスポートに失敗しました: ' + err.message);
    }
  };

  const handleReset = () => {
    if (confirm('移行状態をリセットしますか？')) {
      reset();
      setValidationResults(null);
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running': return '#2196F3';
      case 'completed': return '#4CAF50';
      case 'error': return '#F44336';
      default: return '#757575';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'idle': return 'スタンバイ';
      case 'running': return '移行中...';
      case 'completed': return '完了';
      case 'error': return 'エラー';
      default: return '不明';
    }
  };

  return (
    <div className="migration-dashboard">
      <div className="dashboard-header">
        <h2>データ移行ダッシュボード</h2>
        <div className="status-indicator">
          <span 
            className="status-dot" 
            style={{ backgroundColor: getStatusColor() }}
          ></span>
          <span className="status-text">{getStatusText()}</span>
        </div>
      </div>

      {/* Storage Information */}
      <div className="dashboard-section">
        <h3>ストレージ情報</h3>
        {storageInfo ? (
          <div className="storage-grid">
            <div className="storage-card">
              <div className="storage-label">ユーザー数</div>
              <div className="storage-value">{storageInfo.statistics.users}</div>
            </div>
            <div className="storage-card">
              <div className="storage-label">商品数</div>
              <div className="storage-value">{storageInfo.statistics.products}</div>
            </div>
            <div className="storage-card">
              <div className="storage-label">買取リクエスト</div>
              <div className="storage-value">{storageInfo.statistics.buybackRequests}</div>
            </div>
            <div className="storage-card">
              <div className="storage-label">売上データ</div>
              <div className="storage-value">{storageInfo.statistics.sales}</div>
            </div>
            <div className="storage-card">
              <div className="storage-label">台帳エントリ</div>
              <div className="storage-value">{storageInfo.statistics.ledgerEntries}</div>
            </div>
            <div className="storage-card">
              <div className="storage-label">データサイズ</div>
              <div className="storage-value">{storageInfo.usage.total?.sizeFormatted}</div>
            </div>
          </div>
        ) : (
          <div className="loading">ストレージ情報を読み込み中...</div>
        )}
      </div>

      {/* Migration Progress */}
      {status === 'running' && (
        <div className="dashboard-section">
          <h3>移行進捗</h3>
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="progress-text">{progress}%</div>
          </div>
        </div>
      )}

      {/* Migration Options */}
      <div className="dashboard-section">
        <h3>移行オプション</h3>
        <div className="options-grid">
          <label className="option-item">
            <input
              type="checkbox"
              checked={migrationOptions.dryRun}
              onChange={(e) => setMigrationOptions({
                ...migrationOptions,
                dryRun: e.target.checked
              })}
              disabled={status === 'running'}
            />
            ドライラン（実際のデータ変更なし）
          </label>
          
          <label className="option-item">
            <input
              type="checkbox"
              checked={migrationOptions.clearAfterMigration}
              onChange={(e) => setMigrationOptions({
                ...migrationOptions,
                clearAfterMigration: e.target.checked
              })}
              disabled={status === 'running'}
            />
            移行後にローカルデータをクリア
          </label>
          
          <label className="option-item">
            <input
              type="checkbox"
              checked={migrationOptions.continueOnError}
              onChange={(e) => setMigrationOptions({
                ...migrationOptions,
                continueOnError: e.target.checked
              })}
              disabled={status === 'running'}
            />
            エラー時も継続
          </label>

          <div className="option-item">
            <label>バッチサイズ:</label>
            <input
              type="number"
              min="10"
              max="1000"
              value={migrationOptions.batchSize}
              onChange={(e) => setMigrationOptions({
                ...migrationOptions,
                batchSize: parseInt(e.target.value) || 100
              })}
              disabled={status === 'running'}
            />
          </div>
        </div>
      </div>

      {/* Validation Results */}
      {validationResults && (
        <div className="dashboard-section">
          <h3>データ検証結果</h3>
          <div className={`validation-result ${validationResults.isValid ? 'valid' : 'invalid'}`}>
            {validationResults.isValid ? (
              <div className="validation-success">
                ✓ データは有効です。移行を開始できます。
              </div>
            ) : (
              <div className="validation-errors">
                <div className="error-header">以下の問題が見つかりました:</div>
                <ul>
                  {validationResults.issues.map((issue, index) => (
                    <li key={index}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Migration Results */}
      {results && (
        <div className="dashboard-section">
          <h3>移行結果</h3>
          <div className="results-grid">
            <div className="result-item success">
              <span className="result-label">成功:</span>
              <span className="result-value">{results.succeeded || 0}</span>
            </div>
            <div className="result-item error">
              <span className="result-label">失敗:</span>
              <span className="result-value">{results.failed || 0}</span>
            </div>
            <div className="result-item skipped">
              <span className="result-label">スキップ:</span>
              <span className="result-value">{results.skipped || 0}</span>
            </div>
            {results.duration && (
              <div className="result-item">
                <span className="result-label">実行時間:</span>
                <span className="result-value">{results.duration}秒</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="dashboard-section">
          <h3>エラー</h3>
          <div className="error-container">
            <div className="error-message">{error.message}</div>
            {error.stack && (
              <details className="error-details">
                <summary>詳細</summary>
                <pre>{error.stack}</pre>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="dashboard-actions">
        <button
          className="btn btn-primary"
          onClick={handleValidate}
          disabled={status === 'running'}
        >
          データ検証
        </button>
        
        <button
          className="btn btn-success"
          onClick={handleStartMigration}
          disabled={status === 'running'}
        >
          {migrationOptions.dryRun ? 'ドライラン実行' : '移行開始'}
        </button>
        
        <button
          className="btn btn-secondary"
          onClick={handleExport}
          disabled={status === 'running'}
        >
          データエクスポート
        </button>
        
        <button
          className="btn btn-outline"
          onClick={handleReset}
          disabled={status === 'running'}
        >
          リセット
        </button>
      </div>

      {/* Help Information */}
      <div className="dashboard-help">
        <details>
          <summary>移行について</summary>
          <div className="help-content">
            <p><strong>ドライラン:</strong> 実際のデータ変更を行わずに移行プロセスをテストします。</p>
            <p><strong>データ検証:</strong> 移行前にデータの整合性をチェックします。</p>
            <p><strong>バッチサイズ:</strong> 一度に処理するレコード数を指定します。大きい値ほど高速ですが、メモリ使用量が増加します。</p>
            <p><strong>注意:</strong> 移行後にローカルデータをクリアを選択すると、元に戻せません。</p>
          </div>
        </details>
      </div>
    </div>
  );
};

export default MigrationDashboard;