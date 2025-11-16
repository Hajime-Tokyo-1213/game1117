// JWT関連ユーティリティ（クライアントサイド用）
// 注意: これはデモ・教育目的の実装です
// 本番環境では、JWTの生成・検証はサーバーサイドで行う必要があります

import Cookies from 'js-cookie';

// JWTのヘッダーとペイロードをBase64エンコード
const base64UrlEncode = (str) => {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

// Base64デコード
const base64UrlDecode = (str) => {
  str += '='.repeat((4 - str.length % 4) % 4);
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
};

/**
 * 簡易的なJWT生成（デモ用）
 * 警告: 本番環境では使用しないでください
 * @param {object} payload - ペイロードデータ
 * @returns {string} JWT文字列
 */
export const generateToken = (payload) => {
  console.warn('⚠️ クライアントサイドでのJWT生成はセキュリティリスクがあります。本番環境ではサーバーサイドで生成してください。');
  
  const header = {
    alg: 'none', // 署名なし（デモ用）
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 7 * 24 * 60 * 60; // 7日間（秒）

  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn
  };

  const headerStr = base64UrlEncode(JSON.stringify(header));
  const payloadStr = base64UrlEncode(JSON.stringify(tokenPayload));
  
  // 署名なしのJWT（デモ用）
  return `${headerStr}.${payloadStr}.`;
};

/**
 * JWTのデコード（検証なし）
 * @param {string} token - JWT文字列
 * @returns {object|null} デコードされたペイロード
 */
export const decodeToken = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return payload;
  } catch (error) {
    console.error('Token decode error:', error);
    return null;
  }
};

/**
 * トークンの有効期限チェック
 * @param {string} token - JWT文字列
 * @returns {boolean} 有効期限内かどうか
 */
export const isTokenExpired = (token) => {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) {
    return true;
  }

  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
};

/**
 * トークンの保存
 * @param {string} token - JWT文字列
 * @param {object} options - 保存オプション
 */
export const saveToken = (token, options = {}) => {
  const { 
    secure = true, 
    sameSite = 'strict',
    expires = 7 // 日数
  } = options;

  // HttpOnly は JavaScript からは設定できないため、
  // 本番環境ではサーバーサイドでの設定が必要
  Cookies.set('authToken', token, {
    expires,
    secure,
    sameSite
  });

  // セッションストレージにも保存（タブ間での共有なし）
  sessionStorage.setItem('authToken', token);
};

/**
 * トークンの取得
 * @returns {string|null} 保存されたトークン
 */
export const getToken = () => {
  // Cookieから取得を試みる
  let token = Cookies.get('authToken');
  
  // Cookieになければセッションストレージから取得
  if (!token) {
    token = sessionStorage.getItem('authToken');
  }

  // 有効期限チェック
  if (token && isTokenExpired(token)) {
    removeToken();
    return null;
  }

  return token;
};

/**
 * トークンの削除
 */
export const removeToken = () => {
  Cookies.remove('authToken');
  sessionStorage.removeItem('authToken');
};

/**
 * リフレッシュトークンのシミュレーション（デモ用）
 * @param {string} token - 既存のトークン
 * @returns {string|null} 新しいトークン
 */
export const refreshToken = (token) => {
  console.warn('⚠️ トークンのリフレッシュは通常サーバーサイドで行われます');
  
  const payload = decodeToken(token);
  if (!payload) {
    return null;
  }

  // ユーザー情報を保持して新しいトークンを生成
  const { exp, iat, ...userInfo } = payload;
  return generateToken(userInfo);
};

/**
 * 認証ヘッダーの生成
 * @returns {object} Authorizationヘッダー
 */
export const getAuthHeader = () => {
  const token = getToken();
  if (!token) {
    return {};
  }

  return {
    'Authorization': `Bearer ${token}`
  };
};

/**
 * トークンペイロードからユーザー情報を取得
 * @returns {object|null} ユーザー情報
 */
export const getUserFromToken = () => {
  const token = getToken();
  if (!token) {
    return null;
  }

  const payload = decodeToken(token);
  if (!payload) {
    return null;
  }

  const { exp, iat, ...userInfo } = payload;
  return userInfo;
};

// セキュリティ警告
console.info(`
⚠️ セキュリティに関する重要な注意事項:

このJWT実装はデモ・教育目的のものです。
本番環境では以下の点に注意してください：

1. JWTの生成はサーバーサイドで行う
2. 秘密鍵による適切な署名を使用する
3. HTTPSを使用する
4. HttpOnly Cookieを使用する
5. CSRFトークンを併用する
6. 適切な有効期限を設定する
7. リフレッシュトークンを実装する
`);

export default {
  generateToken,
  decodeToken,
  isTokenExpired,
  saveToken,
  getToken,
  removeToken,
  refreshToken,
  getAuthHeader,
  getUserFromToken
};