import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Cookies from 'js-cookie';

const PrivateRoute = ({ children, allowedRoles = [], requiredRole = null }) => {
  const { isAuthenticated, user, loading, isJWTMode } = useAuth();
  const location = useLocation();
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState(null);

  // JWT モードでの追加検証
  useEffect(() => {
    if (isJWTMode && isAuthenticated) {
      validateJWTToken();
    }
  }, [isJWTMode, isAuthenticated]);

  const validateJWTToken = async () => {
    setIsValidating(true);
    try {
      const token = Cookies.get('authToken');
      if (!token) {
        setValidationError('認証トークンが見つかりません');
        return;
      }

      // トークンの追加検証（必要に応じて）
      // 実際のアプリケーションではサーバー側での検証が推奨されます
      setValidationError(null);
    } catch (error) {
      console.error('トークン検証エラー:', error);
      setValidationError('認証エラーが発生しました');
    } finally {
      setIsValidating(false);
    }
  };

  // ローディング状態の改善
  if (loading || isValidating) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">認証確認中...</p>
        </div>
      </div>
    );
  }

  // 検証エラーがある場合
  if (validationError) {
    console.warn('PrivateRoute 検証エラー:', validationError);
    return <Navigate to="/login" state={{ from: location, error: validationError }} replace />;
  }

  if (!isAuthenticated) {
    // 役職に応じた適切なログインページにリダイレクト
    const getLoginPath = () => {
      // URLパスから推測される役職
      const path = location.pathname;
      if (path.includes('/sys/admin') || path.includes('/sys/staff')) {
        return '/sys/staff/auth';
      } else if (path.includes('/intl/')) {
        return '/intl/portal/auth';
      }
      
      // セッション復元時の役職判定（従来モードのみ）
      if (!isJWTMode) {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            switch (userData.role) {
              case 'customer':
                return '/login';
              case 'overseas_customer':
                return '/intl/portal/auth';
              case 'staff':
              case 'manager':
              case 'admin':
                return '/sys/staff/auth';
              default:
                return '/login';
            }
          } catch (error) {
            console.error('ユーザーデータ解析エラー:', error);
          }
        }
      }
      
      // デフォルトは顧客ログイン
      return '/login';
    };

    return <Navigate to={getLoginPath()} state={{ from: location }} replace />;
  }

  // 役割ベースのアクセス制御（改善版）
  if (requiredRole && user.role !== requiredRole) {
    // requiredRole が指定されている場合は厳密にチェック
    return <Navigate to="/unauthorized" state={{ requiredRole, userRole: user.role }} replace />;
  }
  
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // allowedRoles が指定されている場合はいずれかに一致すればOK
    const isManagerOrAdmin = (user.role === 'manager' || user.role === 'admin');
    const allowsStaff = allowedRoles.includes('staff');
    
    // マネージャーと管理者はスタッフ権限も持つ
    if (!(isManagerOrAdmin && allowsStaff)) {
      return (
        <Navigate 
          to="/unauthorized" 
          state={{ 
            allowedRoles, 
            userRole: user.role,
            from: location 
          }} 
          replace 
        />
      );
    }
  }

  // 認証成功 - 子コンポーネントをレンダリング
  return children;
};

// デバッグ用のログを追加（開発環境のみ）
if (process.env.NODE_ENV === 'development') {
  PrivateRoute.displayName = 'PrivateRoute';
}

export default PrivateRoute;