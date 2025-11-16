// モック認証API（フロントエンドシミュレーション）
// 注意: これは開発・テスト用のモック実装です
// 本番環境では実際のバックエンドAPIを使用してください

import { generateToken, decodeToken, isTokenExpired } from '../utils/jwt';
import { verifyPassword, hashPassword } from '../utils/passwordHash';
import { needsMigration, migratePassword, updateUserWithMigrationResult } from '../utils/passwordMigration';

// APIレスポンスの遅延をシミュレート
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// モックユーザーデータベース（localStorage を使用）
const getUsersDB = () => {
  const users = localStorage.getItem('registeredUsers');
  return users ? JSON.parse(users) : [];
};

const saveUsersDB = (users) => {
  localStorage.setItem('registeredUsers', JSON.stringify(users));
};

/**
 * ログインAPIのモック実装
 * @param {string} email - メールアドレス
 * @param {string} password - パスワード
 * @param {string[]} allowedRoles - 許可される役割
 * @returns {Promise<object>} レスポンス
 */
export const mockLoginAPI = async (email, password, allowedRoles = []) => {
  console.log('🔐 モックログインAPI呼び出し');
  
  // ネットワーク遅延をシミュレート
  await delay(500);

  try {
    const users = getUsersDB();
    const user = users.find(u => u.email === email);

    // ユーザーが見つからない
    if (!user) {
      return {
        success: false,
        status: 401,
        error: 'メールアドレスまたはパスワードが正しくありません'
      };
    }

    // パスワード検証
    let isPasswordValid = false;
    let migrationPerformed = false;
    let updatedUser = user;

    if (user.password.startsWith('$2')) {
      // ハッシュ化済みパスワード
      isPasswordValid = await verifyPassword(password, user.password);
    } else {
      // 平文パスワード（移行対象）
      isPasswordValid = user.password === password;
      
      if (isPasswordValid && needsMigration(user)) {
        // パスワード移行実行
        const migrationResult = await migratePassword(user, password);
        if (migrationResult.success && migrationResult.migrated) {
          updatedUser = updateUserWithMigrationResult(user, migrationResult);
          
          // データベース更新
          const updatedUsers = users.map(u => 
            u.id === user.id ? updatedUser : u
          );
          saveUsersDB(updatedUsers);
          migrationPerformed = true;
          
          console.log('✅ パスワード移行完了');
        }
      }
    }

    // パスワードが正しくない
    if (!isPasswordValid) {
      return {
        success: false,
        status: 401,
        error: 'メールアドレスまたはパスワードが正しくありません'
      };
    }

    // 役割チェック
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return {
        success: false,
        status: 403,
        error: 'このページへのアクセス権限がありません'
      };
    }

    // JWTトークン生成
    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };
    
    const token = generateToken(tokenPayload);

    // 成功レスポンス
    return {
      success: true,
      status: 200,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        migrationPerformed,
        expiresIn: 604800 // 7日間（秒）
      }
    };

  } catch (error) {
    console.error('ログインAPIエラー:', error);
    return {
      success: false,
      status: 500,
      error: 'サーバーエラーが発生しました'
    };
  }
};

/**
 * トークン検証APIのモック実装
 * @param {string} token - JWTトークン
 * @returns {Promise<object>} レスポンス
 */
export const mockVerifyTokenAPI = async (token) => {
  console.log('🔍 モックトークン検証API呼び出し');
  
  // ネットワーク遅延をシミュレート
  await delay(200);

  try {
    // トークンが提供されていない
    if (!token) {
      return {
        success: false,
        status: 401,
        error: 'トークンが提供されていません'
      };
    }

    // トークンの有効期限チェック
    if (isTokenExpired(token)) {
      return {
        success: false,
        status: 401,
        error: 'トークンの有効期限が切れています'
      };
    }

    // トークンデコード
    const decoded = decodeToken(token);
    if (!decoded) {
      return {
        success: false,
        status: 401,
        error: '無効なトークンです'
      };
    }

    // ユーザー情報の検証（データベースと照合）
    const users = getUsersDB();
    const user = users.find(u => u.id === decoded.id);

    if (!user) {
      return {
        success: false,
        status: 401,
        error: 'ユーザーが見つかりません'
      };
    }

    // 成功レスポンス
    return {
      success: true,
      status: 200,
      data: {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    };

  } catch (error) {
    console.error('トークン検証APIエラー:', error);
    return {
      success: false,
      status: 500,
      error: 'サーバーエラーが発生しました'
    };
  }
};

/**
 * ログアウトAPIのモック実装
 * @param {string} token - JWTトークン
 * @returns {Promise<object>} レスポンス
 */
export const mockLogoutAPI = async (token) => {
  console.log('🚪 モックログアウトAPI呼び出し');
  
  // ネットワーク遅延をシミュレート
  await delay(100);

  try {
    // 実際のAPIではトークンをブラックリストに追加するなどの処理を行う
    // ここではログアウト記録のみ
    if (token) {
      const decoded = decodeToken(token);
      if (decoded) {
        console.log(`ユーザー ${decoded.email} がログアウトしました`);
      }
    }

    // 成功レスポンス
    return {
      success: true,
      status: 200,
      data: {
        message: 'ログアウトしました'
      }
    };

  } catch (error) {
    console.error('ログアウトAPIエラー:', error);
    // ログアウトは常に成功として扱う
    return {
      success: true,
      status: 200,
      data: {
        message: 'ログアウトしました'
      }
    };
  }
};

/**
 * ユーザー登録APIのモック実装
 * @param {object} userData - ユーザー情報
 * @returns {Promise<object>} レスポンス
 */
export const mockRegisterAPI = async (userData) => {
  console.log('📝 モック登録API呼び出し');
  
  // ネットワーク遅延をシミュレート
  await delay(800);

  try {
    const users = getUsersDB();
    
    // メールアドレスの重複チェック
    const existingUser = users.find(u => u.email === userData.email);
    if (existingUser) {
      return {
        success: false,
        status: 400,
        error: 'このメールアドレスは既に登録されています'
      };
    }

    // パスワードハッシュ化
    const hashedPassword = await hashPassword(userData.password);

    // 新しいユーザー作成
    const maxId = users.reduce((max, u) => Math.max(max, u.id), 0);
    const newUser = {
      ...userData,
      id: maxId + 1,
      password: hashedPassword,
      passwordMigrationStatus: 'migrated',
      passwordHashMethod: 'bcrypt',
      createdAt: new Date().toISOString()
    };
    delete newUser.confirmPassword;

    // データベースに保存
    const updatedUsers = [...users, newUser];
    saveUsersDB(updatedUsers);

    // JWTトークン生成
    const tokenPayload = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role || 'customer'
    };
    
    const token = generateToken(tokenPayload);

    // 成功レスポンス
    return {
      success: true,
      status: 201,
      data: {
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role
        }
      }
    };

  } catch (error) {
    console.error('登録APIエラー:', error);
    return {
      success: false,
      status: 500,
      error: 'サーバーエラーが発生しました'
    };
  }
};

/**
 * APIクライアントのモック実装
 */
export const mockAuthAPI = {
  login: mockLoginAPI,
  verifyToken: mockVerifyTokenAPI,
  logout: mockLogoutAPI,
  register: mockRegisterAPI
};

// 開発環境でのAPIエンドポイント情報
console.info(`
📡 モック認証APIエンドポイント:

このファイルは開発・テスト用のモック実装です。
本番環境では以下の実際のAPIエンドポイントを使用してください：

- POST   /api/auth/login     - ログイン
- POST   /api/auth/register  - ユーザー登録
- GET    /api/auth/verify    - トークン検証
- POST   /api/auth/logout    - ログアウト
`);

export default mockAuthAPI;