import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const CustomerLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [passwordStrengthInfo, setPasswordStrengthInfo] = useState(null);
  
  const navigate = useNavigate();
  const { login } = useAuth();

  // セキュリティメッセージの表示時間
  const SECURITY_MESSAGE_DURATION = 3000;

  // パスワード強度評価関数
  const evaluatePasswordStrength = (password) => {
    let score = 0;
    const feedback = [];

    if (password.length >= 8) {
      score += 20;
      feedback.push('✓ 8文字以上');
    }
    if (password.length >= 12) {
      score += 10;
      feedback.push('✓ 12文字以上');
    }
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) {
      score += 20;
      feedback.push('✓ 大文字と小文字');
    }
    if (/\d/.test(password)) {
      score += 20;
      feedback.push('✓ 数字を含む');
    }
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      score += 30;
      feedback.push('✓ 特殊文字を含む');
    }

    let level = '弱い';
    if (score >= 80) level = '非常に強い';
    else if (score >= 60) level = '強い';
    else if (score >= 40) level = '普通';

    return { score, level, feedback };
  };

  const handleCustomerLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      // カスタマー専用ログイン（role制限付き）
      const result = await login(email, password, ['customer']);
      
      if (result.success) {
        // パスワード移行が行われた場合
        if (result.migrationPerformed) {
          console.log('カスタマーパスワードが暗号化されました');
          setSuccessMessage('セキュリティ強化のため、パスワードを暗号化しました 🔒');
          setShowSecurityModal(true);
          
          // パスワード強度の評価
          const strengthScore = evaluatePasswordStrength(password);
          setPasswordStrengthInfo(strengthScore);
          
          // モーダル表示後、自動的にダッシュボードへ
          setTimeout(() => {
            setShowSecurityModal(false);
            navigate('/customer-dashboard');
          }, 5000);
        } else {
          // 通常のログイン成功
          navigate('/customer-dashboard');
        }
      } else {
        // エラーメッセージの改善
        if (result.error.includes('メールアドレスまたはパスワード')) {
          setError('メールアドレスまたはパスワードが正しくありません');
        } else if (result.error.includes('役職')) {
          setError('このページは国内買取依頼者専用です。スタッフの方は専用ページをご利用ください');
        } else {
          setError(result.error || 'ログインに失敗しました');
        }
      }
    } catch (error) {
      console.error('カスタマーログインエラー:', error);
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
          <p>国内買取依頼者ログイン</p>
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
            <Link to="/register">新規会員登録はこちら</Link>
          </div>
          
          <div className="other-login-links">
            <p className="small-text">その他のログイン</p>
            <Link to="/intl/portal/auth" className="alt-link">🌍 For Overseas Buyers</Link>
          </div>
        </form>

        {/* セキュリティ案内セクション */}
        <div className="security-info-box">
          <h3>🔐 セキュリティ強化のお知らせ</h3>
          <p>お客様の大切な情報を守るため、パスワードの暗号化を強化しています。</p>
          <ul>
            <li>初回ログイン時にパスワードを自動的に暗号化</li>
            <li>業界標準の強力な暗号化方式を採用</li>
            <li>お客様のプライバシー保護を最優先</li>
          </ul>
          <div className="security-tips">
            <p><strong>パスワード管理のヒント：</strong></p>
            <ul>
              <li>8文字以上の複雑なパスワードを設定</li>
              <li>定期的にパスワードを変更</li>
              <li>他のサービスと同じパスワードを使用しない</li>
            </ul>
          </div>
        </div>
      </div>

      {/* セキュリティ強化完了モーダル */}
      {showSecurityModal && (
        <div className="security-modal-overlay">
          <div className="security-modal">
            <div className="security-modal-header">
              <h2>🎉 セキュリティが強化されました！</h2>
            </div>
            <div className="security-modal-body">
              <p>お客様のパスワードが最新の暗号化技術で保護されました。</p>
              
              {passwordStrengthInfo && (
                <div className="password-strength-report">
                  <h3>現在のパスワード強度</h3>
                  <div className={`strength-indicator strength-${passwordStrengthInfo.level.replace(' ', '-')}`}>
                    <div className="strength-bar" style={{ width: `${passwordStrengthInfo.score}%` }}></div>
                  </div>
                  <p className="strength-level">強度: {passwordStrengthInfo.level}</p>
                  <ul className="strength-feedback">
                    {passwordStrengthInfo.feedback.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="security-benefits">
                <h3>セキュリティ向上のメリット</h3>
                <ul>
                  <li>🛡️ 不正アクセスからアカウントを保護</li>
                  <li>🔐 個人情報の安全性が向上</li>
                  <li>✅ 安心してサービスをご利用可能</li>
                </ul>
              </div>

              <p className="auto-redirect">5秒後に自動的にダッシュボードへ移動します...</p>
            </div>
            <div className="security-modal-footer">
              <button onClick={() => {
                setShowSecurityModal(false);
                navigate('/customer-dashboard');
              }}>
                今すぐダッシュボードへ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerLogin;

