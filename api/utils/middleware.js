import jwt from 'jsonwebtoken';

/**
 * 認証ミドルウェア
 * JWTトークンを検証し、ユーザー情報をreqオブジェクトに追加
 */
export const authMiddleware = (handler) => {
  return async (req, res) => {
    try {
      // Authorizationヘッダーからトークンを取得
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: 'Authorization header is required',
          code: 'AUTH_HEADER_MISSING'
        });
      }

      // Bearer トークン形式のチェック
      const token = authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Token is required',
          code: 'TOKEN_MISSING'
        });
      }

      // トークンの検証
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      // ユーザー情報をリクエストオブジェクトに追加
      req.user = decoded;
      
      // ログ記録
      console.log(`[AUTH] User ${decoded.id} - ${req.method} ${req.url}`);
      
      // 次のハンドラーを実行
      return handler(req, res);
    } catch (error) {
      console.error('[AUTH ERROR]', error);
      
      // JWT特有のエラー処理
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'TOKEN_INVALID'
        });
      }
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      });
    }
  };
};

/**
 * 権限チェックミドルウェア
 * 特定のロールが必要なエンドポイント用
 */
export const requireRole = (allowedRoles) => {
  return (handler) => {
    return authMiddleware(async (req, res) => {
      const userRole = req.user?.role;
      
      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'FORBIDDEN'
        });
      }
      
      return handler(req, res);
    });
  };
};

/**
 * エラーハンドリングミドルウェア
 * すべてのエラーをキャッチして統一形式でレスポンス
 */
export const errorHandler = (handler) => {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      console.error('[ERROR]', {
        method: req.method,
        url: req.url,
        error: error.message,
        stack: error.stack
      });
      
      // エラーレスポンスの統一
      const statusCode = error.statusCode || 500;
      const errorResponse = {
        success: false,
        error: error.message || 'Internal server error',
        code: error.code || 'INTERNAL_ERROR'
      };
      
      // 開発環境ではスタックトレースも返す
      if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = error.stack;
      }
      
      return res.status(statusCode).json(errorResponse);
    }
  };
};

/**
 * CORSミドルウェア
 * クロスオリジンリクエストを許可
 */
export const corsMiddleware = (handler) => {
  return async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight request
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    return handler(req, res);
  };
};

/**
 * ログミドルウェア
 * リクエスト・レスポンスのログを記録
 */
export const loggingMiddleware = (handler) => {
  return async (req, res) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    // リクエストログ
    console.log(`[${requestId}] REQUEST:`, {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      timestamp: new Date().toISOString()
    });
    
    // レスポンスをインターセプト
    const originalJson = res.json;
    res.json = function(data) {
      const duration = Date.now() - startTime;
      
      // レスポンスログ
      console.log(`[${requestId}] RESPONSE:`, {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        data: data,
        timestamp: new Date().toISOString()
      });
      
      return originalJson.call(this, data);
    };
    
    return handler(req, res);
  };
};

/**
 * バリデーションミドルウェア
 * リクエストボディのバリデーション
 */
export const validateRequest = (schema) => {
  return (handler) => {
    return async (req, res) => {
      try {
        // スキーマに基づいてバリデーション
        const validationErrors = validateSchema(req.body, schema);
        
        if (validationErrors.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: validationErrors
          });
        }
        
        return handler(req, res);
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: 'Validation error',
          code: 'VALIDATION_FAILED'
        });
      }
    };
  };
};

/**
 * 簡易的なスキーマバリデーション
 */
function validateSchema(data, schema) {
  const errors = [];
  
  for (const [key, rules] of Object.entries(schema)) {
    const value = data[key];
    
    // Required check
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: key,
        message: `${key} is required`
      });
      continue;
    }
    
    // Type check
    if (value !== undefined && rules.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rules.type) {
        errors.push({
          field: key,
          message: `${key} must be of type ${rules.type}`
        });
      }
    }
    
    // Min/Max length for strings
    if (typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push({
          field: key,
          message: `${key} must be at least ${rules.minLength} characters`
        });
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push({
          field: key,
          message: `${key} must be at most ${rules.maxLength} characters`
        });
      }
    }
    
    // Min/Max for numbers
    if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push({
          field: key,
          message: `${key} must be at least ${rules.min}`
        });
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push({
          field: key,
          message: `${key} must be at most ${rules.max}`
        });
      }
    }
    
    // Email validation
    if (rules.email && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        errors.push({
          field: key,
          message: `${key} must be a valid email`
        });
      }
    }
  }
  
  return errors;
}

// Export all middlewares
export default {
  authMiddleware,
  requireRole,
  errorHandler,
  corsMiddleware,
  loggingMiddleware,
  validateRequest
};