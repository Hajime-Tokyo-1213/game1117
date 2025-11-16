// Fetch インターセプター - 開発環境でのモックAPI実装
// 本番環境では使用しないでください

import Cookies from 'js-cookie';
import { mockAuthAPI } from './mockAuth';

// レスポンスオブジェクトの作成
const createResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
};

// fetchのインターセプター設定
export const setupFetchInterceptor = () => {
  // 開発環境でのみ有効化
  if (process.env.NODE_ENV !== 'development') {
    console.warn('⚠️ Fetch interceptor should only be used in development');
    return;
  }

  // 元のfetchを保存
  const originalFetch = window.fetch;

  // fetchをオーバーライド
  window.fetch = async (url, options = {}) => {
    // /api/auth へのリクエストをインターセプト
    if (url.startsWith('/api/auth/')) {
      const endpoint = url.replace('/api/auth/', '');
      
      // リクエストボディの解析
      let body = null;
      if (options.body) {
        try {
          body = JSON.parse(options.body);
        } catch (e) {
          body = options.body;
        }
      }
      
      // Authorizationヘッダーからトークンを取得
      const authHeader = options.headers?.Authorization || options.headers?.authorization;
      const token = authHeader?.replace('Bearer ', '');

      console.log(`🔄 Intercepting ${options.method || 'GET'} ${url}`);

      try {
        switch (endpoint) {
          case 'login':
            // ログインAPI
            const loginResult = await mockAuthAPI.login(body.email, body.password);
            if (loginResult.success && loginResult.data?.token) {
              // Cookieにトークンを保存（インターセプター内で）
              Cookies.set('authToken', loginResult.data.token, { 
                expires: 7,
                secure: true,
                sameSite: 'strict'
              });
            }
            return createResponse(
              loginResult.success ? loginResult.data : { error: loginResult.error },
              loginResult.status
            );

          case 'verify':
            // トークン検証API
            const verifyResult = await mockAuthAPI.verifyToken(token);
            return createResponse(
              verifyResult.success ? verifyResult.data : { error: verifyResult.error },
              verifyResult.status
            );

          case 'logout':
            // ログアウトAPI
            const logoutResult = await mockAuthAPI.logout(token);
            if (logoutResult.success) {
              // Cookieからトークンを削除
              Cookies.remove('authToken');
            }
            return createResponse(
              logoutResult.success ? logoutResult.data : { error: logoutResult.error },
              logoutResult.status
            );

          case 'register':
            // 登録API
            const registerResult = await mockAuthAPI.register(body);
            if (registerResult.success && registerResult.data?.token) {
              // 登録成功時はトークンを保存しない（ログイン画面へ遷移）
            }
            return createResponse(
              registerResult.success ? registerResult.data : { error: registerResult.error },
              registerResult.status
            );

          default:
            return createResponse({ error: 'エンドポイントが見つかりません' }, 404);
        }
      } catch (error) {
        console.error('Mock API error:', error);
        return createResponse({ error: 'サーバーエラーが発生しました' }, 500);
      }
    }

    // その他のリクエストは通常通り処理
    return originalFetch(url, options);
  };

  console.log('✅ Fetch interceptor initialized for /api/auth/*');
};

// 自動初期化
if (process.env.NODE_ENV === 'development') {
  setupFetchInterceptor();
}

export default setupFetchInterceptor;