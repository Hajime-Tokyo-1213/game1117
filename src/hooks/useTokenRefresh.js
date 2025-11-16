// トークンリフレッシュ用カスタムフック
import { useEffect, useCallback, useRef } from 'react';
import { getToken, isTokenExpired, decodeToken, refreshToken, saveToken } from '../utils/jwt';
import { useAuth } from '../contexts/AuthContext';

/**
 * JWTトークンの自動リフレッシュを管理するフック
 * @param {number} checkInterval - チェック間隔（ミリ秒）
 * @param {number} refreshBefore - 期限切れ何秒前にリフレッシュするか
 */
export const useTokenRefresh = (checkInterval = 30000, refreshBefore = 300) => {
  const { logout, isJWTMode } = useAuth();
  const refreshTimerRef = useRef(null);
  const isRefreshingRef = useRef(false);

  // トークンのリフレッシュが必要かチェック
  const shouldRefreshToken = useCallback(() => {
    const token = getToken();
    if (!token) return false;

    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) return false;

    const now = Math.floor(Date.now() / 1000);
    const timeUntilExpiry = decoded.exp - now;

    // 期限切れまでの時間がrefreshBefore秒未満ならリフレッシュ
    return timeUntilExpiry > 0 && timeUntilExpiry < refreshBefore;
  }, [refreshBefore]);

  // トークンリフレッシュ実行
  const performTokenRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    
    const token = getToken();
    if (!token) return;

    isRefreshingRef.current = true;
    console.log('🔄 トークンリフレッシュ開始...');

    try {
      // 実際のアプリケーションではリフレッシュトークンAPIを呼び出す
      // ここではモックとして新しいトークンを生成
      const newToken = refreshToken(token);
      
      if (newToken) {
        saveToken(newToken);
        console.log('✅ トークンリフレッシュ成功');
        return true;
      } else {
        console.warn('❌ トークンリフレッシュ失敗');
        return false;
      }
    } catch (error) {
      console.error('トークンリフレッシュエラー:', error);
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // 定期的なトークンチェック
  const startTokenCheck = useCallback(() => {
    if (!isJWTMode) return;

    const checkToken = async () => {
      const token = getToken();
      
      if (!token) {
        console.log('トークンが存在しません');
        return;
      }

      if (isTokenExpired(token)) {
        console.warn('トークンが期限切れです。ログアウトします。');
        logout();
        return;
      }

      if (shouldRefreshToken()) {
        const success = await performTokenRefresh();
        if (!success) {
          console.warn('トークンリフレッシュに失敗しました。');
          // リフレッシュに失敗した場合は、期限切れまで待機
        }
      }
    };

    // 初回チェック
    checkToken();

    // 定期チェック開始
    refreshTimerRef.current = setInterval(checkToken, checkInterval);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [isJWTMode, checkInterval, shouldRefreshToken, performTokenRefresh, logout]);

  // クリーンアップ
  const stopTokenCheck = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // フック使用時に自動開始
  useEffect(() => {
    const cleanup = startTokenCheck();
    return () => {
      cleanup?.();
      stopTokenCheck();
    };
  }, [startTokenCheck, stopTokenCheck]);

  return {
    performTokenRefresh,
    shouldRefreshToken,
    stopTokenCheck,
    startTokenCheck
  };
};

/**
 * 手動トークンリフレッシュ用フック
 */
export const useManualTokenRefresh = () => {
  const { isJWTMode } = useAuth();

  const refreshNow = useCallback(async () => {
    if (!isJWTMode) {
      console.warn('JWT認証モードが無効です');
      return false;
    }

    const token = getToken();
    if (!token) {
      console.warn('リフレッシュするトークンがありません');
      return false;
    }

    try {
      const newToken = refreshToken(token);
      if (newToken) {
        saveToken(newToken);
        console.log('✅ 手動トークンリフレッシュ成功');
        return true;
      }
      return false;
    } catch (error) {
      console.error('手動トークンリフレッシュエラー:', error);
      return false;
    }
  }, [isJWTMode]);

  return { refreshNow };
};

export default useTokenRefresh;