import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ApiKeyChecker = ({ children }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [apiKeyStatus, setApiKeyStatus] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  // バックエンドからAPIキー状態を取得
  const checkApiKeyStatus = async () => {
    try {
      setIsChecking(true);
      console.log('=== APIキー状態確認開始（バックエンド経由） ===');
      
      const response = await fetch('/api/zaico/status');
      const data = await response.json();
      
      console.log('APIキー状態確認結果:', data);
      setApiKeyStatus(data);
      
      return data;
    } catch (error) {
      console.error('APIキー状態確認エラー:', error);
      // エラー時は未設定として扱う
      const errorStatus = { 
        configured: false, 
        valid: false, 
        message: 'APIキー状態の確認に失敗しました' 
      };
      setApiKeyStatus(errorStatus);
      return errorStatus;
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // 管理者・マネージャーのみチェック
    if (user && ['admin', 'manager'].includes(user.role)) {
      checkApiKeyStatus().then((status) => {
        if (!status.configured || !status.valid) {
          // APIキーが未設定または無効の場合、設定画面にリダイレクト
          console.log('Zaico APIキーが未設定または無効です。設定画面にリダイレクトします。');
          console.log('状態:', status);
          
          // 現在のパスが設定画面でない場合のみリダイレクト
          if (window.location.pathname !== '/settings/zaico-sync') {
            navigate('/settings/zaico-sync');
          }
        } else {
          console.log('Zaico APIキーが正常に設定されています');
        }
      });
    }
  }, [user, navigate]);

  // チェック中の場合はローディング表示
  if (isChecking) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        color: '#666' 
      }}>
        APIキー状態を確認中...
      </div>
    );
  }

  return children;
};

export default ApiKeyChecker;
