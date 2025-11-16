import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // 登録完了後のメッセージ表示
  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      if (location.state.email) {
        setEmail(location.state.email);
      }
      // stateをクリア
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const result = await login(email, password);
      
      if (result.success) {
        // パスワード移行が行われた場合のメッセージ表示
        if (result.migrationPerformed) {
          console.log('パスワードがセキュアな形式に更新されました');
          setSuccessMessage('セキュリティ向上のため、パスワードを暗号化しました 🔒');
          
          // メッセージを表示してからナビゲート
          setTimeout(() => {
            navigate('/');
          }, 2000);
        } else {
          // 通常のログイン成功
          navigate('/');
        }
      } else {
        // エラーメッセージの改善
        if (result.error.includes('メールアドレスまたはパスワード')) {
          setError('メールアドレスまたはパスワードが正しくありません');
        } else if (result.error.includes('役職')) {
          setError('このログイン画面は一般ユーザー用です。スタッフの方は専用ログインページをご利用ください');
        } else {
          setError(result.error || 'ログインに失敗しました');
        }
      }
    } catch (err) {
      console.error('ログインエラー:', err);
      setError('ログイン処理中にエラーが発生しました。しばらくしてから再度お試しください');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>🎮 ゲーム買取システム</h1>
          <p>ログインしてください</p>
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
              placeholder="example@mail.com"
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

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>

          <div className="register-link">
            <p>アカウントをお持ちでない方は</p>
            <Link to="/register">新規会員登録はこちら（国内・買取）</Link>
          </div>
          
          <div className="register-link" style={{ marginTop: '5px' }}>
            <p>For overseas buyers</p>
            <Link to="/register/buyer">Register here (Purchase)</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;