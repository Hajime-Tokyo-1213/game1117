/**
 * Multi-Factor Authentication Setup Component
 * Handles TOTP setup with QR code and verification
 */

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { authService } from '../../lib/auth/supabase-auth.js';
import { useAuth } from '../../hooks/useAuth.js';
import toast from 'react-hot-toast';
import './MFASetup.css';

export const MFASetup = ({ onComplete, onCancel }) => {
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('setup'); // setup, verify, complete
  const [error, setError] = useState('');
  const { refreshProfile } = useAuth();

  const handleEnableMFA = async () => {
    setLoading(true);
    setError('');
    
    try {
      const result = await authService.enableMFA();
      
      if (result.success && result.data) {
        setQrCode(result.data.qrCode);
        setSecret(result.data.secret);
        setStep('verify');
        toast.success('QRコードが生成されました');
      } else {
        setError(result.error || 'MFAの設定に失敗しました');
      }
    } catch (error) {
      console.error('MFA setup failed:', error);
      setError('MFAの設定中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMFA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('6桁の認証コードを入力してください');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const result = await authService.verifyMFA(verificationCode, secret);
      
      if (result.success) {
        setStep('complete');
        await refreshProfile(); // Refresh user profile to reflect MFA status
        toast.success('二要素認証が有効になりました');
        
        setTimeout(() => {
          if (onComplete) onComplete();
        }, 2000);
      } else {
        setError(result.error || '認証コードが正しくありません');
      }
    } catch (error) {
      console.error('MFA verification failed:', error);
      setError('認証コードの確認中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setVerificationCode(value);
    setError('');
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('クリップボードにコピーしました');
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (step === 'complete') {
    return (
      <div className="mfa-setup-container">
        <div className="mfa-setup-card">
          <div className="success-animation">
            <div className="checkmark">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="11" stroke="#10b981" strokeWidth="2"/>
                <path d="m9 12 2 2 4-4" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          
          <h2>設定完了！</h2>
          <p>
            二要素認証が正常に有効になりました。<br />
            次回ログイン時から認証アプリのコードが必要になります。
          </p>
          
          <div className="mfa-complete-actions">
            <button 
              className="btn btn-primary"
              onClick={onComplete}
            >
              完了
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mfa-setup-container">
      <div className="mfa-setup-card">
        <div className="mfa-setup-header">
          <h2>二要素認証の設定</h2>
          <p>
            {step === 'setup' 
              ? 'アカウントのセキュリティを強化するために二要素認証を有効にできます。'
              : '認証アプリで以下のQRコードをスキャンしてください。'
            }
          </p>
        </div>

        {error && (
          <div className="error-alert">
            <span>⚠️ {error}</span>
          </div>
        )}

        {step === 'setup' ? (
          <div className="mfa-setup-content">
            <div className="mfa-info">
              <h3>二要素認証について</h3>
              <ul>
                <li>ログイン時に追加の認証コードが必要になります</li>
                <li>Google AuthenticatorやAuthyなどのアプリが必要です</li>
                <li>アカウントのセキュリティが大幅に向上します</li>
                <li>設定後はいつでも無効にできます</li>
              </ul>
            </div>
            
            <div className="mfa-setup-actions">
              <button
                className="btn btn-primary"
                onClick={handleEnableMFA}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className="spinner"></div>
                    設定中...
                  </>
                ) : (
                  'MFAを有効にする'
                )}
              </button>
              
              {onCancel && (
                <button 
                  className="btn btn-secondary"
                  onClick={onCancel}
                  disabled={loading}
                >
                  キャンセル
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mfa-verify-content">
            <div className="qr-code-section">
              <h3>1. QRコードをスキャン</h3>
              {qrCode && (
                <div className="qr-code-container">
                  <QRCodeSVG 
                    value={qrCode} 
                    size={200}
                    level="M"
                    includeMargin={true}
                  />
                </div>
              )}
              
              <div className="manual-entry">
                <p>QRコードをスキャンできない場合は、以下のキーを手動で入力してください：</p>
                <div className="secret-key">
                  <code>{secret}</code>
                  <button 
                    className="copy-button"
                    onClick={() => copyToClipboard(secret)}
                    title="クリップボードにコピー"
                  >
                    📋
                  </button>
                </div>
              </div>
            </div>

            <div className="verification-section">
              <h3>2. 認証コードを入力</h3>
              <p>認証アプリに表示された6桁のコードを入力してください：</p>
              
              <div className="verification-input">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={handleCodeChange}
                  placeholder="000000"
                  maxLength={6}
                  pattern="[0-9]*"
                  className={error ? 'error' : ''}
                  disabled={loading}
                  autoComplete="one-time-code"
                />
              </div>
              
              <div className="verification-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleVerifyMFA}
                  disabled={loading || verificationCode.length !== 6}
                >
                  {loading ? (
                    <>
                      <div className="spinner"></div>
                      確認中...
                    </>
                  ) : (
                    '設定を完了'
                  )}
                </button>
                
                <button 
                  className="btn btn-secondary"
                  onClick={() => setStep('setup')}
                  disabled={loading}
                >
                  戻る
                </button>
              </div>
            </div>

            <div className="mfa-help">
              <h4>対応アプリ</h4>
              <ul>
                <li>Google Authenticator</li>
                <li>Authy</li>
                <li>Microsoft Authenticator</li>
                <li>1Password</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MFASetup;