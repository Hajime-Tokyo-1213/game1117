import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const StaffLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockTime, setBlockTime] = useState(null);
  
  const navigate = useNavigate();
  const { login } = useAuth();

  // ログイン試行回数の管理
  const MAX_LOGIN_ATTEMPTS = 3;
  const BLOCK_DURATION = 5 * 60 * 1000; // 5分間

  useEffect(() => {
    // ローカルストレージから試行回数とブロック状態を復元
    const storedAttempts = localStorage.getItem('staffLoginAttempts');
    const storedBlockTime = localStorage.getItem('staffLoginBlockTime');
    
    if (storedAttempts) {
      setLoginAttempts(parseInt(storedAttempts, 10));
    }
    
    if (storedBlockTime) {
      const blockEndTime = parseInt(storedBlockTime, 10);
      const now = Date.now();
      
      if (blockEndTime > now) {
        setIsBlocked(true);
        setBlockTime(blockEndTime);
        
        // ブロック解除タイマー
        const timer = setTimeout(() => {
          setIsBlocked(false);
          setLoginAttempts(0);
          localStorage.removeItem('staffLoginAttempts');
          localStorage.removeItem('staffLoginBlockTime');
        }, blockEndTime - now);
        
        return () => clearTimeout(timer);
      } else {
        // ブロック期間終了
        localStorage.removeItem('staffLoginAttempts');
        localStorage.removeItem('staffLoginBlockTime');
      }
    }
  }, []);

  // ブロックタイマーの動的更新
  useEffect(() => {
    if (isBlocked && blockTime) {
      const interval = setInterval(() => {
        const now = Date.now();
        if (blockTime <= now) {
          setIsBlocked(false);
          setBlockTime(null);
          setLoginAttempts(0);
          localStorage.removeItem('staffLoginAttempts');
          localStorage.removeItem('staffLoginBlockTime');
          setError('');
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isBlocked, blockTime]);

  const getBlockRemainingTime = () => {
    if (!blockTime) return '';
    const remaining = Math.ceil((blockTime - Date.now()) / 1000);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}分${seconds}秒`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    // ブロック中のチェック
    if (isBlocked) {
      setError(`ログインがブロックされています。残り時間: ${getBlockRemainingTime()}`);
      return;
    }

    setLoading(true);

    try {
      // スタッフ系のみログイン許可（役職チェックをログイン前に実行）
      const result = await login(email, password, ['staff', 'manager', 'admin']);
      
      if (result.success) {
        // ログイン成功時は試行回数をリセット
        setLoginAttempts(0);
        localStorage.removeItem('staffLoginAttempts');
        
        // パスワード移行が行われた場合のメッセージ
        if (result.migrationPerformed) {
          console.log('スタッフパスワードがセキュアな形式に更新されました');
          setSuccessMessage('セキュリティ強化のため、パスワードを暗号化しました 🔒');
          
          // メッセージを表示してからナビゲート
          setTimeout(() => {
            navigate('/');
          }, 2000);
        } else {
          // 通常のログイン成功
          navigate('/');
        }
      } else {
        // ログイン失敗時の処理
        const newAttempts = loginAttempts + 1;
        setLoginAttempts(newAttempts);
        localStorage.setItem('staffLoginAttempts', newAttempts.toString());
        
        // エラーメッセージの改善
        if (result.error.includes('メールアドレスまたはパスワード')) {
          setError(`認証情報が正しくありません（残り試行回数: ${MAX_LOGIN_ATTEMPTS - newAttempts}回）`);
        } else if (result.error.includes('役職')) {
          setError('このページはスタッフ専用です。一般のお客様は通常のログインページをご利用ください');
        } else {
          setError(result.error || 'ログインに失敗しました');
        }
        
        // 試行回数超過でブロック
        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          const blockEndTime = Date.now() + BLOCK_DURATION;
          setIsBlocked(true);
          setBlockTime(blockEndTime);
          localStorage.setItem('staffLoginBlockTime', blockEndTime.toString());
          setError('ログイン試行回数が上限に達しました。5分後に再度お試しください');
        }
      }
    } catch (err) {
      console.error('スタッフログインエラー:', err);
      setError('ログイン処理中にエラーが発生しました。しばらくしてから再度お試しください');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container staff-login">
      <div className="login-box">
        <div className="login-header">
          <h1>🔐 システム管理画面</h1>
          <p>スタッフログイン</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">メールアドレス</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="staff@gamestore.com"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">パスワード</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="パスワードを入力"
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}
          {successMessage && <div className="success-message">{successMessage}</div>}

          <button type="submit" className="login-button staff-btn" disabled={loading || isBlocked}>
            {loading ? 'ログイン中...' : isBlocked ? 'ログインブロック中' : 'ログイン'}
          </button>

          {/* ブロック状態の視覚的表示 */}
          {isBlocked && (
            <div className="block-timer">
              <p>🔒 セキュリティ保護のためログインを一時的にブロックしています</p>
              <p>解除まで: {getBlockRemainingTime()}</p>
            </div>
          )}

          <div className="staff-note">
            <p>⚠️ このページはスタッフ専用です</p>
            <p>一般のお客様は<Link to="/login">こちら</Link>からログインしてください</p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StaffLogin;

