import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { errorHandler, corsMiddleware, loggingMiddleware, validateRequest } from '../utils/middleware.js';
import { sendSuccess, sendError, sendValidationError, HTTP_STATUS, ERROR_CODES } from '../utils/response.js';

// ログインスキーマ
const loginSchema = {
  email: {
    required: true,
    type: 'string',
    email: true
  },
  password: {
    required: true,
    type: 'string',
    minLength: 6
  }
};

/**
 * ログインAPI
 * POST /api/auth/login
 */
const loginHandler = async (req, res) => {
  const { email, password } = req.body;

  try {
    // ユーザーをデータベースから取得（現在はlocalStorageシミュレーション）
    // 実際の実装ではデータベースから取得
    const users = getUsersFromDatabase();
    const user = users.find(u => u.email === email);

    if (!user) {
      return sendError(
        res,
        'Invalid email or password',
        ERROR_CODES.AUTH_REQUIRED,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    // パスワードの検証
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return sendError(
        res,
        'Invalid email or password',
        ERROR_CODES.AUTH_REQUIRED,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    // JWTトークンの生成
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      process.env.JWT_SECRET || 'your-secret-key',
      {
        expiresIn: '7d'
      }
    );

    // パスワードを除いたユーザー情報
    const { password: _, ...userWithoutPassword } = user;

    // 成功レスポンス
    return sendSuccess(
      res,
      {
        token,
        user: userWithoutPassword
      },
      'Login successful'
    );
  } catch (error) {
    console.error('Login error:', error);
    return sendError(
      res,
      'Login failed',
      ERROR_CODES.INTERNAL_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * ユーザーデータベースシミュレーション
 * 実際の実装ではデータベースから取得
 */
function getUsersFromDatabase() {
  // 実際の実装ではデータベースクエリ
  // ここではダミーデータを返す
  return [
    {
      id: '1',
      email: 'admin@example.com',
      password: '$2a$10$YourHashedPasswordHere', // bcryptでハッシュ化されたパスワード
      name: 'Admin User',
      role: 'admin'
    }
  ];
}

// ミドルウェアを適用してエクスポート
export default corsMiddleware(
  loggingMiddleware(
    errorHandler(
      validateRequest(loginSchema)(loginHandler)
    )
  )
);