// 認証API用カスタムフック
import { useState, useCallback } from 'react';
import mockAuthAPI from '../api/mockAuth';
import { saveToken, removeToken } from '../utils/jwt';

/**
 * 認証APIを使用するためのカスタムフック
 */
export const useAuthAPI = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * ログインAPI呼び出し
   * @param {string} email - メールアドレス
   * @param {string} password - パスワード
   * @param {string[]} allowedRoles - 許可される役割
   * @returns {Promise<object>} APIレスポンス
   */
  const login = useCallback(async (email, password, allowedRoles = []) => {
    setLoading(true);
    setError(null);

    try {
      const response = await mockAuthAPI.login(email, password, allowedRoles);
      
      if (response.success) {
        // トークンを保存
        saveToken(response.data.token);
        console.log('✅ ログイン成功');
      } else {
        setError(response.error);
        console.error('❌ ログインエラー:', response.error);
      }

      return response;
    } catch (err) {
      const errorMessage = 'ネットワークエラーが発生しました';
      setError(errorMessage);
      console.error('❌ ネットワークエラー:', err);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * ユーザー登録API呼び出し
   * @param {object} userData - ユーザー情報
   * @returns {Promise<object>} APIレスポンス
   */
  const register = useCallback(async (userData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await mockAuthAPI.register(userData);
      
      if (response.success) {
        // トークンを保存（自動ログイン）
        saveToken(response.data.token);
        console.log('✅ 登録成功');
      } else {
        setError(response.error);
        console.error('❌ 登録エラー:', response.error);
      }

      return response;
    } catch (err) {
      const errorMessage = 'ネットワークエラーが発生しました';
      setError(errorMessage);
      console.error('❌ ネットワークエラー:', err);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * トークン検証API呼び出し
   * @param {string} token - JWTトークン
   * @returns {Promise<object>} APIレスポンス
   */
  const verifyToken = useCallback(async (token) => {
    setLoading(true);
    setError(null);

    try {
      const response = await mockAuthAPI.verifyToken(token);
      
      if (!response.success) {
        setError(response.error);
        console.error('❌ トークン検証エラー:', response.error);
      }

      return response;
    } catch (err) {
      const errorMessage = 'ネットワークエラーが発生しました';
      setError(errorMessage);
      console.error('❌ ネットワークエラー:', err);
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * ログアウトAPI呼び出し
   * @param {string} token - JWTトークン
   * @returns {Promise<object>} APIレスポンス
   */
  const logout = useCallback(async (token) => {
    setLoading(true);
    setError(null);

    try {
      const response = await mockAuthAPI.logout(token);
      
      // トークンを削除
      removeToken();
      console.log('✅ ログアウト成功');

      return response;
    } catch (err) {
      // ログアウトはエラーでも実行
      removeToken();
      console.warn('⚠️ ログアウトAPIエラーが発生しましたが、ローカルログアウトは完了');
      return {
        success: true,
        data: {
          message: 'ローカルログアウト完了'
        }
      };
    } finally {
      setLoading(false);
    }
  }, []);

  // エラーをクリア
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    login,
    register,
    verifyToken,
    logout,
    clearError
  };
};

/**
 * APIレスポンスの型定義（TypeScript用）
 * 
 * interface APIResponse<T = any> {
 *   success: boolean;
 *   status?: number;
 *   data?: T;
 *   error?: string;
 * }
 * 
 * interface LoginResponseData {
 *   token: string;
 *   user: {
 *     id: number;
 *     email: string;
 *     name: string;
 *     role: string;
 *   };
 *   migrationPerformed?: boolean;
 *   expiresIn: number;
 * }
 */

export default useAuthAPI;