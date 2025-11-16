import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Unauthorized.css';

const Unauthorized = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  
  // リダイレクト元の情報を取得
  const { allowedRoles, requiredRole, userRole, from } = location.state || {};
  
  // 役割名の表示用マッピング
  const roleDisplayNames = {
    admin: '管理者',
    manager: 'マネージャー',
    staff: 'スタッフ',
    customer: 'お客様',
    overseas_customer: '海外バイヤー'
  };
  
  const getRoleDisplay = (role) => roleDisplayNames[role] || role;
  
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };
  
  return (
    <div className="unauthorized-container">
      <div className="unauthorized-content">
        <h1>403</h1>
        <h2>アクセス権限がありません</h2>
        
        <div className="error-details">
          <p>このページを表示する権限がありません。</p>
          
          {\* 詳細情報の表示 *\}
          {user && (
            <div className="user-info">
              <p>現在のアカウント: <strong>{user.name}</strong></p>
              <p>役割: <strong>{getRoleDisplay(user.role)}</strong></p>
            </div>
          )}
          
          {requiredRole && (
            <div className="required-role-info">
              <p>必要な役割: <strong>{getRoleDisplay(requiredRole)}</strong></p>
            </div>
          )}
          
          {allowedRoles && allowedRoles.length > 0 && (
            <div className="allowed-roles-info">
              <p>許可された役割:</p>
              <ul>
                {allowedRoles.map(role => (
                  <li key={role}>{getRoleDisplay(role)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        <div className="actions">
          <Link to="/" className="btn btn-primary">
            ホームに戻る
          </Link>
          
          {from && (
            <button 
              onClick={() => navigate(-1)} 
              className="btn btn-secondary"
            >
              前のページに戻る
            </button>
          )}
          
          <button 
            onClick={handleLogout} 
            className="btn btn-outline"
          >
            別のアカウントでログイン
          </button>
        </div>
        
        <div className="help-text">
          <p>
            アクセス権限に関してご不明な点がある場合は、
            管理者にお問い合わせください。
          </p>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;