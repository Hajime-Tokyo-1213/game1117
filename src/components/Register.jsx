import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { validatePassword } from '../utils/passwordHash';
import { validateAndSanitize, validators } from '../utils/validation';
import './Register.css';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    birthDate: '',
    occupation: '',
    postalCode: '',
    address: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, message: '' });
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const [touched, setTouched] = useState({});
  
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // パスワード強度をリアルタイムチェック
    if (name === 'password') {
      checkPasswordStrength(value);
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  // Field validation function with sanitization
  const validateField = async (field, value) => {
    let validation;
    
    switch (field) {
      case 'email':
        validation = await validateAndSanitize(value, 'email');
        break;
      case 'phone':
        validation = await validateAndSanitize(value, 'phone');
        break;
      case 'postalCode':
        validation = await validateAndSanitize(value, 'postalCode');
        break;
      case 'name':
      case 'address':
      case 'occupation':
        validation = await validateAndSanitize(value, 'required');
        break;
      default:
        validation = { value, isValid: true, error: null };
    }
    
    // Update errors state
    setErrors(prev => ({
      ...prev,
      [field]: validation.error
    }));
    
    // Update form data with sanitized value
    if (validation.value !== value) {
      setFormData(prev => ({
        ...prev,
        [field]: validation.value
      }));
    }
    
    return validation;
  };

  // Handle field blur for real-time validation
  const handleBlur = async (e) => {
    const { name, value } = e.target;
    
    // Mark field as touched
    setTouched(prev => ({
      ...prev,
      [name]: true
    }));
    
    // Validate the field
    await validateField(name, value);
  };

  // パスワード強度チェック関数
  const checkPasswordStrength = (password) => {
    if (!password) {
      setPasswordStrength({ score: 0, message: '' });
      return;
    }

    const validation = validatePassword(password);
    let score = 0;
    let message = '';

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;

    if (!validation.isValid) {
      message = '弱い';
    } else if (score <= 2) {
      message = '弱い';
    } else if (score <= 4) {
      message = '普通';
    } else {
      message = '強い';
    }

    setPasswordStrength({ score, message });
  };

  // 郵便番号から住所を自動入力
  const handlePostalCodeChange = async (e) => {
    const postalCode = e.target.value;
    setFormData(prev => ({
      ...prev,
      postalCode: postalCode
    }));

    // ハイフンを除去して7桁の数字かチェック
    const cleanedPostalCode = postalCode.replace(/-/g, '');
    if (cleanedPostalCode.length === 7 && /^\d{7}$/.test(cleanedPostalCode)) {
      setAddressLoading(true);
      try {
        // zipcloud APIを使用して住所を取得
        const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanedPostalCode}`);
        const data = await response.json();
        
        if (data.status === 200 && data.results) {
          const result = data.results[0];
          // 都道府県 + 市区町村 + 町域を結合
          const fullAddress = `${result.address1}${result.address2}${result.address3}`;
          setFormData(prev => ({
            ...prev,
            address: fullAddress
          }));
        } else {
          // 住所が見つからない場合
          console.log('住所が見つかりませんでした');
        }
      } catch (error) {
        console.error('住所の取得に失敗しました:', error);
      } finally {
        setAddressLoading(false);
      }
    }
  };

  const validateForm = async () => {
    // Check required fields
    if (!formData.name || !formData.birthDate || !formData.phone || 
        !formData.occupation || !formData.postalCode || !formData.address || 
        !formData.email || !formData.password || !formData.confirmPassword) {
      setError('必須項目を全て入力してください');
      return false;
    }

    // Validate all fields with the validation library
    const validations = await Promise.all([
      validateField('email', formData.email),
      validateField('phone', formData.phone),
      validateField('postalCode', formData.postalCode),
      validateField('name', formData.name),
      validateField('address', formData.address)
    ]);

    const hasValidationErrors = validations.some(v => !v.isValid);
    if (hasValidationErrors) {
      setError('入力内容にエラーがあります。各項目を確認してください。');
      return false;
    }

    // 生年月日のチェック（18歳以上）
    const birthDate = new Date(formData.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (age < 18) {
      setError('18歳以上の方のみご利用いただけます');
      return false;
    }

    // パスワードのバリデーション
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      setError(`パスワードが要件を満たしていません: ${passwordValidation.errors.join(', ')}`);
      return false;
    }

    // パスワード確認
    if (formData.password !== formData.confirmPassword) {
      setError('パスワードが一致しません');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const isValid = await validateForm();
    if (!isValid) {
      return;
    }

    setLoading(true);

    try {
      const { confirmPassword, ...userData } = formData;
      const result = await register(userData);
      
      if (result.success) {
        // 登録完了メッセージとセキュリティ情報
        navigate('/login', {
          state: { 
            message: '会員登録が完了しました。セキュリティ強化のため、パスワードは暗号化されて保存されています。',
            email: userData.email
          }
        });
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error('登録エラー:', err);
      setError('登録処理中にエラーが発生しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-box">
        <div className="register-header">
          <h1>🎮 ゲーム買取システム</h1>
          <p>新規会員登録</p>
        </div>

        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-group form-group-half">
            <label htmlFor="name">お名前 *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="山田太郎"
              disabled={loading}
              required
              className={touched.name && errors.name ? 'error' : ''}
            />
            {touched.name && errors.name && (
              <span className="field-error">{errors.name}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="birthDate">生年月日 *</label>
              <input
                type="date"
                id="birthDate"
                name="birthDate"
                value={formData.birthDate}
                onChange={handleChange}
                disabled={loading}
                max={new Date().toISOString().split('T')[0]}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="occupation">職業 *</label>
              <select
                id="occupation"
                name="occupation"
                value={formData.occupation}
                onChange={handleChange}
                disabled={loading}
                required
              >
                <option value="">選択してください</option>
                <option value="会社員">会社員</option>
                <option value="自営業">自営業</option>
                <option value="公務員">公務員</option>
                <option value="会社役員">会社役員</option>
                <option value="学生">学生</option>
                <option value="パート・アルバイト">パート・アルバイト</option>
                <option value="専業主婦・主夫">専業主婦・主夫</option>
                <option value="無職">無職</option>
                <option value="その他">その他</option>
              </select>
            </div>
          </div>

          <div className="form-group form-group-half">
            <label htmlFor="postalCode">
              郵便番号 * 
              {addressLoading && <span className="address-loading"> 住所を取得中...</span>}
            </label>
            <input
              type="text"
              id="postalCode"
              name="postalCode"
              value={formData.postalCode}
              onChange={handlePostalCodeChange}
              onBlur={handleBlur}
              placeholder="123-4567"
              disabled={loading}
              required
              className={touched.postalCode && errors.postalCode ? 'error' : ''}
            />
            {touched.postalCode && errors.postalCode && (
              <span className="field-error">{errors.postalCode}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="address">住所 *</label>
            <input
              type="text"
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="東京都新宿区○○1-2-3"
              disabled={loading}
              required
              className={touched.address && errors.address ? 'error' : ''}
            />
            {touched.address && errors.address && (
              <span className="field-error">{errors.address}</span>
            )}
          </div>

          <div className="form-divider"></div>

          <div className="form-group form-group-half">
            <label htmlFor="phone">電話番号 *</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="090-1234-5678"
              disabled={loading}
              required
              className={touched.phone && errors.phone ? 'error' : ''}
            />
            {touched.phone && errors.phone && (
              <span className="field-error">{errors.phone}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="email">メールアドレス *</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="example@mail.com（ログイン時に使用します）"
              disabled={loading}
              required
              className={touched.email && errors.email ? 'error' : ''}
            />
            {touched.email && errors.email && (
              <span className="field-error">{errors.email}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="password">
                パスワード *
                {formData.password && (
                  <span className={`password-strength strength-${passwordStrength.message.toLowerCase()}`}>
                    {' '}（強度: {passwordStrength.message}）
                  </span>
                )}
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                onFocus={() => setShowPasswordRequirements(true)}
                onBlur={() => setShowPasswordRequirements(false)}
                placeholder="8文字以上"
                disabled={loading}
                required
              />
              {showPasswordRequirements && (
                <div className="password-requirements">
                  <p>パスワード要件:</p>
                  <ul>
                    <li className={formData.password.length >= 8 ? 'satisfied' : ''}>
                      8文字以上
                    </li>
                    <li className={/[A-Z]/.test(formData.password) && /[a-z]/.test(formData.password) ? 'satisfied' : ''}>
                      大文字と小文字を含む
                    </li>
                    <li className={/\d/.test(formData.password) ? 'satisfied' : ''}>
                      数字を含む
                    </li>
                    <li className={/[!@#$%^&*(),.?":{}|<>]/.test(formData.password) ? 'satisfied' : ''}>
                      特殊文字を含む（推奨）
                    </li>
                  </ul>
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">パスワード確認 *</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="もう一度入力"
                disabled={loading}
                required
              />
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="register-button" disabled={loading}>
            {loading ? '登録中...' : '会員登録'}
          </button>

          <div className="login-link">
            <p>すでにアカウントをお持ちの方は</p>
            <Link to="/login">ログインはこちら</Link>
          </div>
          
          <div className="login-link" style={{ marginTop: '10px' }}>
            <p>For overseas buyers (Purchase games)</p>
            <Link to="/intl/portal/register">Register here</Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;

