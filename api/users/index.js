import { authMiddleware, errorHandler, corsMiddleware, loggingMiddleware } from '../utils/middleware.js';
import { 
  sendSuccess, 
  sendError, 
  sendNotFound,
  sendPaginated,
  HTTP_STATUS, 
  ERROR_CODES 
} from '../utils/response.js';

/**
 * ユーザー一覧取得API
 * GET /api/users
 * 
 * Query Parameters:
 * - page: ページ番号 (default: 1)
 * - limit: 1ページあたりの件数 (default: 10)
 * - role: ロールでフィルタリング
 * - search: 名前またはメールで検索
 */
const getUsersHandler = async (req, res) => {
  try {
    // クエリパラメータの取得
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const role = req.query.role;
    const search = req.query.search;

    // ユーザーデータの取得（実際はデータベースから）
    let users = getUsersFromDatabase();

    // フィルタリング
    if (role) {
      users = users.filter(user => user.role === role);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(user => 
        user.name.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower)
      );
    }

    // ページネーション
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = users.slice(startIndex, endIndex);

    // パスワードを除外
    const sanitizedUsers = paginatedUsers.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    // ページ情報の計算
    const totalItems = users.length;
    const totalPages = Math.ceil(totalItems / limit);

    // ページネーションレスポンスを返す
    return sendPaginated(
      res,
      sanitizedUsers,
      page,
      totalPages,
      totalItems,
      limit
    );
  } catch (error) {
    console.error('Get users error:', error);
    return sendError(
      res,
      'Failed to fetch users',
      ERROR_CODES.INTERNAL_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * 特定のユーザー取得API
 * GET /api/users/:id
 */
const getUserByIdHandler = async (req, res) => {
  try {
    const userId = req.query.id || req.params?.id;

    if (!userId) {
      return sendError(
        res,
        'User ID is required',
        ERROR_CODES.INVALID_INPUT,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // ユーザーデータの取得
    const users = getUsersFromDatabase();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return sendNotFound(res, 'User');
    }

    // パスワードを除外
    const { password, ...userWithoutPassword } = user;

    return sendSuccess(res, userWithoutPassword, 'User found');
  } catch (error) {
    console.error('Get user by ID error:', error);
    return sendError(
      res,
      'Failed to fetch user',
      ERROR_CODES.INTERNAL_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * 現在のユーザー情報取得API
 * GET /api/users/me
 * 要認証
 */
const getCurrentUserHandler = async (req, res) => {
  try {
    // authMiddlewareで設定されたユーザー情報を使用
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      return sendError(
        res,
        'User not authenticated',
        ERROR_CODES.AUTH_REQUIRED,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    // ユーザーデータの取得
    const users = getUsersFromDatabase();
    const user = users.find(u => u.id === currentUserId);

    if (!user) {
      return sendNotFound(res, 'User');
    }

    // パスワードを除外
    const { password, ...userWithoutPassword } = user;

    return sendSuccess(res, userWithoutPassword, 'Current user info');
  } catch (error) {
    console.error('Get current user error:', error);
    return sendError(
      res,
      'Failed to fetch current user',
      ERROR_CODES.INTERNAL_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * ユーザーデータベースシミュレーション
 */
function getUsersFromDatabase() {
  return [
    {
      id: '1',
      email: 'admin@example.com',
      password: '$2a$10$YourHashedPasswordHere',
      name: 'Admin User',
      role: 'admin',
      createdAt: '2024-01-01T00:00:00Z'
    },
    {
      id: '2',
      email: 'manager@example.com',
      password: '$2a$10$YourHashedPasswordHere',
      name: 'Manager User',
      role: 'manager',
      createdAt: '2024-01-02T00:00:00Z'
    },
    {
      id: '3',
      email: 'staff@example.com',
      password: '$2a$10$YourHashedPasswordHere',
      name: 'Staff User',
      role: 'staff',
      createdAt: '2024-01-03T00:00:00Z'
    },
    {
      id: '4',
      email: 'customer@example.com',
      password: '$2a$10$YourHashedPasswordHere',
      name: 'Customer User',
      role: 'customer',
      createdAt: '2024-01-04T00:00:00Z'
    }
  ];
}

/**
 * APIハンドラーのエクスポート
 * メソッドによって異なるハンドラーを使用
 */
export default async (req, res) => {
  // CORSとロギングミドルウェアを適用
  return corsMiddleware(
    loggingMiddleware(
      errorHandler(async (req, res) => {
        const { method } = req;
        
        switch (method) {
          case 'GET':
            // パスによって異なるハンドラーを使用
            if (req.url?.includes('/me')) {
              // 認証が必要
              return authMiddleware(getCurrentUserHandler)(req, res);
            } else if (req.query.id || req.params?.id) {
              return getUserByIdHandler(req, res);
            } else {
              return getUsersHandler(req, res);
            }
          default:
            return sendError(
              res,
              'Method not allowed',
              ERROR_CODES.INVALID_INPUT,
              HTTP_STATUS.METHOD_NOT_ALLOWED
            );
        }
      })
    )
  )(req, res);
};