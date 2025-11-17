import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { validateAndSanitize, validators } from '../utils/validation';
import './AccountSettings.css';

const AccountSettings = () => {
  const { user, updateUser, isOverseasCustomer, isStaff, isAdmin, isManager } = useAuth();
  
  const [formData, setFormData] = useState({
    name: user?.name || '',
    companyName: user?.companyName || '',
    country: user?.country || '',
    birthDate: user?.birthDate || '',
    occupation: user?.occupation || '',
    postalCode: user?.postalCode || '',
    address: user?.address || '',
    phone: user?.phone || '',
    email: user?.email || '',
    department: user?.department || '',
    employeeId: user?.employeeId || '',
    // 会社情報（見積書用）
    companyInfoName: user?.companyInfoName || '株式会社ゲーム買取センター',
    companyInfoNameEn: user?.companyInfoNameEn || 'Game Trading Center Co., Ltd.',
    companyInfoPostalCode: user?.companyInfoPostalCode || '〒160-0022',
    companyInfoAddress: user?.companyInfoAddress || '東京都新宿区新宿3-1-1',
    companyInfoAddressEn: user?.companyInfoAddressEn || '3-1-1 Shinjuku, Shinjuku-ku, Tokyo 160-0022, Japan',
    companyInfoPhone: user?.companyInfoPhone || 'TEL: 03-1234-5678',
    companyInfoPhoneEn: user?.companyInfoPhoneEn || 'TEL: +81-3-1234-5678',
    companyInfoEmail: user?.companyInfoEmail || 'info@game-kaitori.jp',
    companyInfoLicense: user?.companyInfoLicense || '古物商許可証：東京都公安委員会 第123456789号',
    companyInfoLicenseEn: user?.companyInfoLicenseEn || 'Used Goods Business License: Tokyo Metropolitan Police No. 123456789'
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Field validation with sanitization
  const validateField = async (field, value) => {
    let validation;
    
    switch (field) {
      case 'email':
      case 'companyInfoEmail':
        validation = await validateAndSanitize(value, 'email');
        break;
      case 'phone':
        validation = await validateAndSanitize(value, 'phone');
        break;
      case 'postalCode':
      case 'companyInfoPostalCode':
        validation = await validateAndSanitize(value, 'postalCode');
        break;
      case 'name':
      case 'address':
      case 'companyInfoName':
      case 'companyInfoAddress':
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 郵便番号から住所を自動入力
  const handlePostalCodeChange = async (e) => {
    const postalCode = e.target.value;
    setFormData(prev => ({
      ...prev,
      postalCode: postalCode
    }));

    const cleanedPostalCode = postalCode.replace(/-/g, '');
    if (cleanedPostalCode.length === 7 && /^\d{7}$/.test(cleanedPostalCode)) {
      setAddressLoading(true);
      try {
        const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanedPostalCode}`);
        const data = await response.json();
        
        if (data.status === 200 && data.results) {
          const result = data.results[0];
          const fullAddress = `${result.address1}${result.address2}${result.address3}`;
          setFormData(prev => ({
            ...prev,
            address: fullAddress
          }));
        }
      } catch (error) {
        console.error('住所の取得に失敗しました:', error);
      } finally {
        setAddressLoading(false);
      }
    }
  };

  const validateForm = async () => {
    // Validate with the validation library based on user type
    let fieldsToValidate = [];
    
    // スタッフ・マネージャー・管理者の場合
    if (isStaff || isAdmin || isManager) {
      if (!formData.name || !formData.email) {
        setError('必須項目を全て入力してください');
        return false;
      }
      fieldsToValidate = [
        { field: 'name', value: formData.name },
        { field: 'email', value: formData.email }
      ];
    }
    // 海外バイヤーの場合
    else if (isOverseasCustomer) {
      if (!formData.name || !formData.phone || !formData.postalCode || !formData.address || !formData.email) {
        setError('Please fill in all required fields');
        return false;
      }
      fieldsToValidate = [
        { field: 'name', value: formData.name },
        { field: 'email', value: formData.email },
        { field: 'phone', value: formData.phone },
        { field: 'address', value: formData.address }
      ];
    }
    // 国内顧客の場合
    else {
      if (!formData.name || !formData.birthDate || !formData.phone || 
          !formData.occupation || !formData.postalCode || !formData.address || 
          !formData.email) {
        setError('必須項目を全て入力してください');
        return false;
      }
      fieldsToValidate = [
        { field: 'name', value: formData.name },
        { field: 'email', value: formData.email },
        { field: 'phone', value: formData.phone },
        { field: 'postalCode', value: formData.postalCode },
        { field: 'address', value: formData.address }
      ];
      
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
    }
    
    // Validate all fields
    const validations = await Promise.all(
      fieldsToValidate.map(({ field, value }) => validateField(field, value))
    );
    
    const hasValidationErrors = validations.some(v => !v.isValid);
    if (hasValidationErrors) {
      const errorMessage = isOverseasCustomer 
        ? 'Please correct the errors in the form' 
        : '入力内容にエラーがあります。各項目を確認してください。';
      setError(errorMessage);
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const isValid = await validateForm();
    if (!isValid) {
      return;
    }

    setLoading(true);

    try {
      const result = updateUser(user.id, formData);
      
      if (result.success) {
        setSuccess(isOverseasCustomer ? 'Profile updated successfully' : 'プロフィール情報を更新しました');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(isOverseasCustomer ? 'An error occurred during the update' : '更新処理中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setError(isOverseasCustomer ? 'Please fill in all password fields' : '全てのパスワード項目を入力してください');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError(isOverseasCustomer ? 'New password must be at least 6 characters' : '新しいパスワードは6文字以上で入力してください');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError(isOverseasCustomer ? 'New passwords do not match' : '新しいパスワードが一致しません');
      return;
    }

    setLoading(true);

    try {
      // 現在のパスワードを確認（localStorageから取得）
      const users = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
      const currentUser = users.find(u => u.id === user.id);
      
      if (currentUser.password !== passwordData.currentPassword) {
        setError(isOverseasCustomer ? 'Current password is incorrect' : '現在のパスワードが正しくありません');
        setLoading(false);
        return;
      }

      const result = updateUser(user.id, { password: passwordData.newPassword });
      
      if (result.success) {
        setSuccess(isOverseasCustomer ? 'Password changed successfully' : 'パスワードを変更しました');
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setShowPasswordForm(false);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(isOverseasCustomer ? 'An error occurred while changing password' : 'パスワード変更中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="account-settings">
      <div className="settings-container">
        <h1>{isOverseasCustomer ? 'Account Settings' : 'アカウント設定'}</h1>
        
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="settings-section">
          <h2>{isOverseasCustomer ? 'Profile Information' : 'プロフィール情報'}</h2>
          <form onSubmit={handleSubmit} className="settings-form">
            {/* スタッフ・マネージャー・管理者向けの項目 */}
            {isStaff ? (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">{isOverseasCustomer ? 'Name *' : 'お名前 *'}</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={loading}
                    required
                    className={touched.name && errors.name ? 'error' : ''}
                  />
                  {touched.name && errors.name && (
                    <span className="field-error">{errors.name}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="department">所属部署</label>
                  <input
                    type="text"
                    id="department"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    placeholder="査定部"
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="employeeId">社員番号</label>
                  <input
                    type="text"
                    id="employeeId"
                    name="employeeId"
                    value={formData.employeeId}
                    onChange={handleChange}
                    placeholder="EMP001"
                    disabled={loading}
                  />
                </div>
              </div>
            ) : (
              <div className="form-group form-group-half">
                <label htmlFor="name">{isOverseasCustomer ? 'Name *' : 'お名前 *'}</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={loading}
                  required
                  className={touched.name && errors.name ? 'error' : ''}
                />
                {touched.name && errors.name && (
                  <span className="field-error">{errors.name}</span>
                )}
              </div>
            )}

            {isOverseasCustomer && (
              <div className="form-group form-group-half">
                <label htmlFor="companyName">Company Name (Optional)</label>
                <input
                  type="text"
                  id="companyName"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
            )}

            {!isOverseasCustomer && (
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
            )}

            <div className="form-group form-group-half">
              <label htmlFor="postalCode">
                {isOverseasCustomer ? 'Postal Code *' : '郵便番号 *'}
                {addressLoading && <span className="address-loading"> 住所を取得中...</span>}
              </label>
              <input
                type="text"
                id="postalCode"
                name="postalCode"
                value={formData.postalCode}
                onChange={isOverseasCustomer ? handleChange : handlePostalCodeChange}
                onBlur={handleBlur}
                placeholder={isOverseasCustomer ? 'e.g., 10001' : '123-4567'}
                disabled={loading}
                required
                className={touched.postalCode && errors.postalCode ? 'error' : ''}
              />
              {touched.postalCode && errors.postalCode && (
                <span className="field-error">{errors.postalCode}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="address">{isOverseasCustomer ? 'Address *' : '住所 *'}</label>
              <input
                type="text"
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder={isOverseasCustomer ? 'Street Address, City, State' : '東京都新宿区○○1-2-3'}
                disabled={loading}
                required
                className={touched.address && errors.address ? 'error' : ''}
              />
              {touched.address && errors.address && (
                <span className="field-error">{errors.address}</span>
              )}
            </div>

            {isOverseasCustomer && formData.country && (
              <div className="form-group form-group-half">
                <label htmlFor="country">Country *</label>
                <input
                  type="text"
                  id="country"
                  value={formData.country}
                  disabled
                  style={{ backgroundColor: '#f5f5f5' }}
                />
              </div>
            )}

            <div className="form-divider"></div>

            <div className="form-group form-group-half">
              <label htmlFor="phone">{isOverseasCustomer ? 'Phone Number *' : '電話番号 *'}</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder={isOverseasCustomer ? '+1-123-456-7890' : '090-1234-5678'}
                disabled={loading}
                required
                className={touched.phone && errors.phone ? 'error' : ''}
              />
              {touched.phone && errors.phone && (
                <span className="field-error">{errors.phone}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="email">{isOverseasCustomer ? 'Email Address *' : 'メールアドレス *'}</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={loading}
                required
                className={touched.email && errors.email ? 'error' : ''}
              />
              {touched.email && errors.email && (
                <span className="field-error">{errors.email}</span>
              )}
            </div>

            <button type="submit" className="update-button" disabled={loading}>
              {loading 
                ? (isOverseasCustomer ? 'Updating...' : '更新中...') 
                : (isOverseasCustomer ? 'Update Profile' : 'プロフィールを更新')
              }
            </button>
          </form>
        </div>

        {/* 会社情報（見積書用） - 管理者・マネージャーのみ */}
        {(isAdmin || isManager) && (
          <div className="settings-section">
            <h2>会社情報（見積書用）</h2>
            <form onSubmit={handleSubmit} className="settings-form">
              <div className="form-group">
                <label htmlFor="companyInfoName">会社名（日本語）</label>
                <input
                  type="text"
                  id="companyInfoName"
                  name="companyInfoName"
                  value={formData.companyInfoName}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="companyInfoNameEn">会社名（英語）</label>
                <input
                  type="text"
                  id="companyInfoNameEn"
                  name="companyInfoNameEn"
                  value={formData.companyInfoNameEn}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="companyInfoPostalCode">郵便番号</label>
                  <input
                    type="text"
                    id="companyInfoPostalCode"
                    name="companyInfoPostalCode"
                    value={formData.companyInfoPostalCode}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="companyInfoPhone">電話番号（日本語）</label>
                  <input
                    type="text"
                    id="companyInfoPhone"
                    name="companyInfoPhone"
                    value={formData.companyInfoPhone}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="companyInfoPhoneEn">電話番号（英語）</label>
                  <input
                    type="text"
                    id="companyInfoPhoneEn"
                    name="companyInfoPhoneEn"
                    value={formData.companyInfoPhoneEn}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="companyInfoAddress">住所（日本語）</label>
                <input
                  type="text"
                  id="companyInfoAddress"
                  name="companyInfoAddress"
                  value={formData.companyInfoAddress}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="companyInfoAddressEn">住所（英語）</label>
                <input
                  type="text"
                  id="companyInfoAddressEn"
                  name="companyInfoAddressEn"
                  value={formData.companyInfoAddressEn}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="companyInfoEmail">メールアドレス</label>
                <input
                  type="email"
                  id="companyInfoEmail"
                  name="companyInfoEmail"
                  value={formData.companyInfoEmail}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="companyInfoLicense">古物商許可証（日本語）</label>
                <input
                  type="text"
                  id="companyInfoLicense"
                  name="companyInfoLicense"
                  value={formData.companyInfoLicense}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="companyInfoLicenseEn">古物商許可証（英語）</label>
                <input
                  type="text"
                  id="companyInfoLicenseEn"
                  name="companyInfoLicenseEn"
                  value={formData.companyInfoLicenseEn}
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>

              <button type="submit" className="update-button" disabled={loading}>
                {loading ? '更新中...' : '会社情報を更新'}
              </button>
            </form>
          </div>
        )}

        <div className="settings-section">
          <h2>{isOverseasCustomer ? 'Change Password' : 'パスワード変更'}</h2>
          
          {!showPasswordForm ? (
            <button 
              onClick={() => setShowPasswordForm(true)} 
              className="show-password-form-button"
            >
              {isOverseasCustomer ? 'Change Password' : 'パスワードを変更する'}
            </button>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="settings-form">
              <div className="form-group">
                <label htmlFor="currentPassword">
                  {isOverseasCustomer ? 'Current Password *' : '現在のパスワード *'}
                </label>
                <input
                  type="password"
                  id="currentPassword"
                  name="currentPassword"
                  value={passwordData.currentPassword}
                  onChange={handlePasswordChange}
                  disabled={loading}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">
                  {isOverseasCustomer ? 'New Password *' : '新しいパスワード *'}
                </label>
                <input
                  type="password"
                  id="newPassword"
                  name="newPassword"
                  value={passwordData.newPassword}
                  onChange={handlePasswordChange}
                  placeholder={isOverseasCustomer ? '6+ characters' : '6文字以上'}
                  disabled={loading}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">
                  {isOverseasCustomer ? 'Confirm New Password *' : '新しいパスワード確認 *'}
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={passwordData.confirmPassword}
                  onChange={handlePasswordChange}
                  placeholder={isOverseasCustomer ? 'Re-enter password' : 'もう一度入力'}
                  disabled={loading}
                  required
                />
              </div>

              <div className="button-group">
                <button type="submit" className="update-button" disabled={loading}>
                  {loading 
                    ? (isOverseasCustomer ? 'Changing...' : '変更中...') 
                    : (isOverseasCustomer ? 'Change Password' : 'パスワードを変更')
                  }
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowPasswordForm(false);
                    setPasswordData({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: ''
                    });
                  }}
                  className="cancel-button"
                  disabled={loading}
                >
                  {isOverseasCustomer ? 'Cancel' : 'キャンセル'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountSettings;





