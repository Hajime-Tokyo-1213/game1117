import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { validateAndSanitize, validators } from '../utils/validation';
import './StaffManagement.css';

const StaffManagement = () => {
  const { register, isAdmin, isManager } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'staff',
    department: '',
    employeeId: ''
  });
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // スタッフ一覧を読み込み
  useEffect(() => {
    loadStaffList();
  }, []);

  const loadStaffList = () => {
    const users = JSON.parse(localStorage.getItem('registeredUsers') || '[]');
    const staffUsers = users.filter(u => ['staff', 'manager', 'admin'].includes(u.role));
    setStaffList(staffUsers);
  };
  
  // Validate individual field
  const validateField = async (field, value) => {
    let validation;
    
    switch (field) {
      case 'email':
        validation = await validateAndSanitize(value, 'email');
        break;
      case 'name':
      case 'role':
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
  
  // Validate staff data
  const validateStaffData = async (staffData) => {
    const validations = await Promise.all([
      validateField('email', staffData.email),
      validateField('name', staffData.name),
      validateField('role', staffData.role)
    ]);
    
    return {
      validations,
      hasErrors: validations.some(v => !v.isValid)
    };
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
  
  // Display validation errors
  const displayValidationErrors = (validations) => {
    const errorMessages = validations
      .filter(v => !v.isValid)
      .map(v => v.error)
      .filter(Boolean);
    
    if (errorMessages.length > 0) {
      setError('入力内容にエラーがあります: ' + errorMessages.join(', '));
    }
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

  const validateForm = async () => {
    if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
      setError('必須項目を全て入力してください');
      return false;
    }

    // Validate with the validation library
    const { validations, hasErrors } = await validateStaffData(formData);
    
    if (hasErrors) {
      displayValidationErrors(validations);
      return false;
    }

    // パスワードの長さチェック
    if (formData.password.length < 8) {
      setError('パスワードは8文字以上で入力してください');
      return false;
    }

    // パスワード確認
    if (formData.password !== formData.confirmPassword) {
      setError('パスワードが一致しません');
      return false;
    }

    // 管理者権限チェック（adminの作成はadminのみ）
    if (formData.role === 'admin' && !isAdmin) {
      setError('管理者アカウントの作成は管理者のみ可能です');
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
      const { confirmPassword, ...userData } = formData;
      const result = register({
        ...userData,
        // スタッフ用のダミー値
        birthDate: '1990-01-01',
        occupation: userData.department || 'スタッフ',
        phone: '000-0000-0000',
        postalCode: '000-0000',
        address: '社内'
      });
      
      if (result.success) {
        setSuccess(`スタッフアカウント「${userData.name}」を作成しました`);
        setFormData({
          name: '',
          email: '',
          password: '',
          confirmPassword: '',
          role: 'staff',
          department: '',
          employeeId: ''
        });
        setTouched({});
        setErrors({});
        setShowCreateForm(false);
        loadStaffList();
        
        // 成功メッセージを3秒後に消す
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('アカウント作成中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'admin':
        return 'role-badge-admin';
      case 'manager':
        return 'role-badge-manager';
      case 'staff':
        return 'role-badge-staff';
      default:
        return 'role-badge-default';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin':
        return '👑 管理者';
      case 'manager':
        return '🔑 マネージャー';
      case 'staff':
        return '👤 スタッフ';
      default:
        return role;
    }
  };

  if (!isAdmin && !isManager) {
    return (
      <div className="staff-management-container">
        <div className="unauthorized-message">
          <h1>⚠️ アクセス権限がありません</h1>
          <p>この画面は管理者・マネージャーのみアクセス可能です</p>
        </div>
      </div>
    );
  }

  return (
    <div className="staff-management-container">
      <div className="staff-management-header">
        <h1>👥 スタッフ管理</h1>
        <p>スタッフアカウントの作成・管理</p>
      </div>

      {success && <div className="success-message">{success}</div>}

      <div className="action-bar">
        <button 
          className="create-staff-btn" 
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? '✕ 閉じる' : '➕ 新規スタッフ作成'}
        </button>
      </div>

      {showCreateForm && (
        <div className="create-form-section">
          <h2>新規スタッフアカウント作成</h2>
          <form onSubmit={handleSubmit} className="staff-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">氏名 *</label>
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

              <div className="form-group">
                <label htmlFor="email">メールアドレス *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="yamada@gamestore.com"
                  disabled={loading}
                  required
                  className={touched.email && errors.email ? 'error' : ''}
                />
                {touched.email && errors.email && (
                  <span className="field-error">{errors.email}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="role">役割 *</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  disabled={loading}
                  required
                  className={touched.role && errors.role ? 'error' : ''}
                >
                  <option value="staff">👤 スタッフ</option>
                  <option value="manager">🔑 マネージャー</option>
                  {isAdmin && <option value="admin">👑 管理者</option>}
                </select>
                {touched.role && errors.role && (
                  <span className="field-error">{errors.role}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="department">所属部署（任意）</label>
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
                <label htmlFor="employeeId">社員番号（任意）</label>
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

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="password">パスワード *</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="8文字以上"
                  disabled={loading}
                  required
                />
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

            <div className="form-actions">
              <button type="button" onClick={() => setShowCreateForm(false)} className="btn-cancel">
                キャンセル
              </button>
              <button type="submit" className="btn-submit" disabled={loading}>
                {loading ? '作成中...' : '✓ アカウント作成'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="staff-list-section">
        <h2>スタッフ一覧（{staffList.length}名）</h2>
        
        {staffList.length === 0 ? (
          <div className="empty-state">
            <p>スタッフアカウントがありません</p>
          </div>
        ) : (
          <div className="staff-table-wrapper">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>メールアドレス</th>
                  <th>役割</th>
                  <th>所属部署</th>
                  <th>社員番号</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map(staff => (
                  <tr key={staff.id}>
                    <td className="staff-name">{staff.name}</td>
                    <td className="staff-email">{staff.email}</td>
                    <td>
                      <span className={`role-badge ${getRoleBadgeClass(staff.role)}`}>
                        {getRoleLabel(staff.role)}
                      </span>
                    </td>
                    <td>{staff.department || '-'}</td>
                    <td className="employee-id">{staff.employeeId || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffManagement;

