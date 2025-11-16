import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { mockUsers } from '../data/mockUsers';
import useAuthAPI from '../hooks/useAuthAPI';
import { getToken, removeToken, getUserFromToken, isTokenExpired } from '../utils/jwt';
import { hashPassword, verifyPassword, validatePassword } from '../utils/passwordHash';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// 既存の localStorage ベースのユーザー管理（後方互換性のため）
const getUsers = () => {
  const storedUsers = localStorage.getItem('registeredUsers');
  if (storedUsers) {
    return JSON.parse(storedUsers);
  }
  localStorage.setItem('registeredUsers', JSON.stringify(mockUsers));
  return mockUsers;
};

const saveUsers = (users) => {
  localStorage.setItem('registeredUsers', JSON.stringify(users));
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(null);
  
  // Auth API フック
  const authAPI = useAuthAPI();

  // JWT モードか従来モードかを環境変数で判定
  const useJWT = process.env.REACT_APP_ENABLE_JWT_AUTH === 'true';
  const [authToken, setAuthToken] = useState(null);

  // Cookieからトークンを取得
  const getTokenFromCookie = () => {
    return Cookies.get('authToken');
  };

  // トークンをCookieに保存
  const saveTokenToCookie = (token) => {
    Cookies.set('authToken', token, { 
      expires: 7, // 7日間
      secure: true,
      sameSite: 'strict'
    });
    setAuthToken(token);
  };

  // トークンをCookieから削除
  const removeTokenFromCookie = () => {
    Cookies.remove('authToken');
    setAuthToken(null);
  };

  // トークンの検証
  const verifyToken = useCallback(async (token) => {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return { success: true, user: data.user };
      }
      
      return { success: false };
    } catch (error) {
      console.error('トークン検証エラー:', error);
      return { success: false };
    }
  }, []);

  // トークンからユーザー情報を復元
  const initializeAuth = useCallback(async () => {
    setLoading(true);
    
    if (useJWT) {
      // JWT認証モード（Cookieベース）
      const token = getTokenFromCookie();
      
      if (token) {
        const verification = await verifyToken(token);
        
        if (verification.success) {
          setUser(verification.user);
          setIsAuthenticated(true);
          setAuthToken(token);
          console.log('✅ JWTトークンから認証状態を復元');
        } else {
          // トークンが無効な場合はクリア
          removeTokenFromCookie();
          setUser(null);
          setIsAuthenticated(false);
        }
      }
    } else {
      // 従来の localStorage 認証モード
      const storedUser = localStorage.getItem('currentUser');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        setIsAuthenticated(true);
        console.log('✅ localStorageから認証状態を復元');
      }
    }
    
    setLoading(false);
  }, [useJWT, verifyToken]);

  // 初回マウント時の認証状態確認
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // 定期的なトークン検証と自動ログアウト（JWTモードのみ）
  useEffect(() => {
    if (!useJWT || !isAuthenticated || !authToken) return;

    const checkTokenValidity = async () => {
      const verification = await verifyToken(authToken);
      
      if (!verification.success) {
        console.warn('トークンが無効です。ログアウトします。');
        await logout();
      }
    };

    // 初回チェック
    checkTokenValidity();

    // 定期チェック（5分ごと）
    const interval = setInterval(checkTokenValidity, 300000);

    return () => clearInterval(interval);
  }, [useJWT, isAuthenticated, authToken, verifyToken, logout]);

  // ログイン処理
  const login = async (email, password, allowedRoles = []) => {
    setAuthError(null);
    
    if (useJWT) {
      // JWT認証モード（Cookieベース）
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        if (response.ok) {
          const { token, user } = await response.json();
          
          // トークンをCookieに保存
          saveTokenToCookie(token);
          
          setUser(user);
          setIsAuthenticated(true);
          
          return {
            success: true,
            user: user,
            migrationPerformed: user.passwordMigrationPerformed,
            migrationStatus: user.passwordMigrationStatus
          };
        } else {
          const errorData = await response.json();
          const errorMessage = errorData.error || '認証に失敗しました';
          setAuthError(errorMessage);
          return {
            success: false,
            error: errorMessage
          };
        }
      } catch (error) {
        const errorMessage = 'ログイン処理中にエラーが発生しました';
        setAuthError(errorMessage);
        return {
          success: false,
          error: errorMessage
        };
      }
    } else {
      // 従来の認証モード（後方互換性）
      try {
        console.log('=== ログイン処理開始（従来モード） ===');
        
        const users = getUsers();
        const foundUser = users.find(u => u.email === email);

        if (!foundUser) {
          return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
        }

        // パスワード検証
        let isPasswordValid = false;
        let migrationPerformed = false;
        
        if (foundUser.password.startsWith('$2')) {
          isPasswordValid = await verifyPassword(password, foundUser.password);
        } else {
          isPasswordValid = foundUser.password === password;
          
          if (isPasswordValid) {
            const hashedPassword = await hashPassword(password);
            const updatedUsers = users.map(u => 
              u.id === foundUser.id ? { ...u, password: hashedPassword } : u
            );
            saveUsers(updatedUsers);
            migrationPerformed = true;
          }
        }

        if (!isPasswordValid) {
          return { success: false, error: 'メールアドレスまたはパスワードが正しくありません' };
        }

        if (allowedRoles.length > 0 && !allowedRoles.includes(foundUser.role)) {
          return { 
            success: false, 
            error: 'このログイン画面は指定された役職専用です' 
          };
        }

        const userWithoutPassword = { ...foundUser };
        delete userWithoutPassword.password;
        
        setUser(userWithoutPassword);
        setIsAuthenticated(true);
        localStorage.setItem('currentUser', JSON.stringify(userWithoutPassword));
        
        return { 
          success: true,
          migrationPerformed,
          migrationStatus: foundUser.passwordMigrationStatus
        };
        
      } catch (error) {
        console.error('ログイン処理エラー:', error);
        return { success: false, error: 'ログイン処理中にエラーが発生しました' };
      }
    }
  };

  // ユーザー登録処理
  const register = async (userData) => {
    setAuthError(null);
    
    if (useJWT) {
      // JWT認証モード
      try {
        const response = await authAPI.register(userData);
        
        if (response.success) {
          // 自動ログインはしない（セキュリティのため）
          return {
            success: true
          };
        } else {
          setAuthError(response.error);
          return {
            success: false,
            error: response.error
          };
        }
      } catch (error) {
        const errorMessage = '登録処理中にエラーが発生しました';
        setAuthError(errorMessage);
        return {
          success: false,
          error: errorMessage
        };
      }
    } else {
      // 従来の登録モード（後方互換性）
      try {
        const users = getUsers();
        
        const existingEmail = users.find(u => u.email === userData.email);
        if (existingEmail) {
          return { success: false, error: 'このメールアドレスは既に登録されています' };
        }

        const passwordValidation = validatePassword(userData.password);
        if (!passwordValidation.isValid) {
          return { 
            success: false, 
            error: `パスワード要件を満たしていません: ${passwordValidation.errors.join(', ')}` 
          };
        }

        const hashedPassword = await hashPassword(userData.password);
        const maxId = users.reduce((max, u) => Math.max(max, u.id), 0);
        const newUser = {
          ...userData,
          id: maxId + 1,
          password: hashedPassword,
          role: userData.role || 'customer',
          createdAt: new Date().toISOString(),
          passwordHashMethod: 'bcrypt'
        };

        const updatedUsers = [...users, newUser];
        saveUsers(updatedUsers);

        return { success: true };
        
      } catch (error) {
        console.error('ユーザー登録エラー:', error);
        return { 
          success: false, 
          error: 'ユーザー登録中にエラーが発生しました。もう一度お試しください。' 
        };
      }
    }
  };

  // ユーザー情報更新処理
  const updateUser = async (userId, updatedData) => {
    // 従来モードのみサポート（JWTモードでは別途APIエンドポイントが必要）
    if (useJWT) {
      console.warn('JWT認証モードでのユーザー更新は未実装です');
      return { 
        success: false, 
        error: 'この機能は現在利用できません' 
      };
    }

    try {
      const users = getUsers();
      
      if (updatedData.email) {
        const existingEmail = users.find(u => u.email === updatedData.email && u.id !== userId);
        if (existingEmail) {
          return { success: false, error: 'このメールアドレスは既に使用されています' };
        }
      }

      let processedData = { ...updatedData };
      if (updatedData.password) {
        const passwordValidation = validatePassword(updatedData.password);
        if (!passwordValidation.isValid) {
          return { 
            success: false, 
            error: `パスワード要件を満たしていません: ${passwordValidation.errors.join(', ')}` 
          };
        }

        const hashedPassword = await hashPassword(updatedData.password);
        processedData.password = hashedPassword;
        processedData.passwordHashMethod = 'bcrypt';
        processedData.passwordUpdatedAt = new Date().toISOString();
      }

      const updatedUsers = users.map(u => {
        if (u.id === userId) {
          return { ...u, ...processedData, updatedAt: new Date().toISOString() };
        }
        return u;
      });

      saveUsers(updatedUsers);

      if (user?.id === userId) {
        const updatedUser = updatedUsers.find(u => u.id === userId);
        if (updatedUser) {
          const userWithoutPassword = { ...updatedUser };
          delete userWithoutPassword.password;
          setUser(userWithoutPassword);
          localStorage.setItem('currentUser', JSON.stringify(userWithoutPassword));
        }
      }

      return { success: true };
      
    } catch (error) {
      console.error('ユーザー情報更新エラー:', error);
      return { 
        success: false, 
        error: 'ユーザー情報の更新中にエラーが発生しました。' 
      };
    }
  };

  // ログアウト処理
  const logout = useCallback(async () => {
    if (useJWT) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${authToken}`
          }
        });
      } catch (error) {
        console.error('ログアウトAPI呼び出しエラー:', error);
      }
      
      // Cookieからトークンを削除
      removeTokenFromCookie();
    }
    
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    
    // 従来モードのクリーンアップ
    localStorage.removeItem('currentUser');
    
    console.log('✅ ログアウト完了');
  }, [useJWT, authToken]);

  // 全ユーザー取得（管理機能用）
  const getAllUsers = () => {
    return getUsers();
  };

  // エラークリア
  const clearAuthError = () => {
    setAuthError(null);
  };

  // コンテキスト値
  const value = {
    user,
    login,
    register,
    updateUser,
    logout,
    getAllUsers,
    loading,
    isAuthenticated,
    authError,
    clearAuthError,
    
    // 役割ベースのヘルパー
    isCustomer: user?.role === 'customer',
    isOverseasCustomer: user?.role === 'overseas_customer',
    isStaff: user?.role === 'staff' || user?.role === 'admin' || user?.role === 'manager',
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager' || user?.role === 'admin',
    
    // JWT認証モードかどうか
    isJWTMode: useJWT
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};