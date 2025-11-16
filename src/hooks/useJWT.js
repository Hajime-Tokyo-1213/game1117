// JWT統合用カスタムフック
import { useState, useEffect, useCallback } from 'react';
import { 
  saveToken, 
  getToken, 
  removeToken, 
  decodeToken, 
  isTokenExpired,
  getUserFromToken 
} from '../utils/jwt';

/**
 * JWT認証を管理するカスタムフック
 */
export const useJWT = () => {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // 初期化：保存済みトークンをチェック
  useEffect(() => {
    const initializeAuth = () => {
      const storedToken = getToken();
      
      if (storedToken && !isTokenExpired(storedToken)) {
        setToken(storedToken);
        const userData = getUserFromToken();
        setUser(userData);
        setIsAuthenticated(true);
      } else {
        // 期限切れトークンをクリア
        removeToken();
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      }
      
      setLoading(false);
    };

    initializeAuth();
  }, []);

  // ログイン処理（トークン保存）
  const login = useCallback((authToken, userData = null) => {
    saveToken(authToken);
    setToken(authToken);
    
    // ユーザー情報の設定
    const userInfo = userData || getUserFromToken();
    setUser(userInfo);
    setIsAuthenticated(true);
    
    console.log('JWT認証成功:', userInfo);
  }, []);

  // ログアウト処理
  const logout = useCallback(() => {
    removeToken();
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    
    console.log('JWTログアウト完了');
  }, []);

  // トークンの更新
  const updateToken = useCallback((newToken) => {
    saveToken(newToken);
    setToken(newToken);
    
    const userData = getUserFromToken();
    setUser(userData);
    
    console.log('トークン更新完了');
  }, []);

  // トークンの有効性チェック
  const checkTokenValidity = useCallback(() => {
    const currentToken = getToken();
    
    if (!currentToken || isTokenExpired(currentToken)) {
      logout();
      return false;
    }
    
    return true;
  }, [logout]);

  // 定期的なトークンチェック（5分ごと）
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      const isValid = checkTokenValidity();
      if (!isValid) {
        console.warn('トークンが期限切れです。再ログインが必要です。');
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated, checkTokenValidity]);

  return {
    token,
    user,
    isAuthenticated,
    loading,
    login,
    logout,
    updateToken,
    checkTokenValidity
  };
};

/**
 * JWT対応のAPIリクエストフック
 */
export const useJWTRequest = () => {
  const { token, checkTokenValidity, logout } = useJWT();

  const request = useCallback(async (url, options = {}) => {
    // トークンの有効性確認
    if (!checkTokenValidity()) {
      throw new Error('認証が必要です');
    }

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // 401エラーの場合は自動ログアウト
      if (response.status === 401) {
        console.warn('認証エラー: トークンが無効です');
        logout();
        throw new Error('認証が無効になりました。再度ログインしてください。');
      }

      return response;
    } catch (error) {
      console.error('APIリクエストエラー:', error);
      throw error;
    }
  }, [token, checkTokenValidity, logout]);

  return { request };
};

export default useJWT;