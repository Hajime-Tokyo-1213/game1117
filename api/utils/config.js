/**
 * API設定ファイル
 * 環境変数と設定の管理
 */

// 環境変数の読み込み
const config = {
  // 環境
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  // サーバー設定
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost',
  
  // JWT設定
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },
  
  // データベース設定（将来的な実装用）
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'game_buyback',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true'
  },
  
  // Redis設定（キャッシュ用）
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || ''
  },
  
  // API設定
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000/api',
    version: 'v1',
    rateLimitWindow: 15 * 60 * 1000, // 15分
    rateLimitMax: 100, // 15分あたりの最大リクエスト数
    paginationDefaultLimit: 20,
    paginationMaxLimit: 100
  },
  
  // CORS設定
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  },
  
  // ログ設定
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    colorize: process.env.LOG_COLORIZE === 'true'
  },
  
  // セキュリティ設定
  security: {
    bcryptRounds: 10,
    passwordMinLength: 8,
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15分
    sessionTimeout: 30 * 60 * 1000 // 30分
  },
  
  // ファイルアップロード設定
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf'
    ],
    uploadDir: process.env.UPLOAD_DIR || './uploads'
  },
  
  // メール設定（通知用）
  mail: {
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: process.env.MAIL_PORT || 587,
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER || '',
    password: process.env.MAIL_PASSWORD || '',
    from: process.env.MAIL_FROM || 'noreply@gamebuyback.com'
  },
  
  // 外部API設定
  externalApi: {
    zaico: {
      apiKey: process.env.ZAICO_API_KEY || '',
      baseUrl: process.env.ZAICO_BASE_URL || 'https://api.zaico.co.jp/v1'
    },
    exchangeRate: {
      apiKey: process.env.EXCHANGE_RATE_API_KEY || '',
      baseUrl: process.env.EXCHANGE_RATE_BASE_URL || 'https://api.exchangerate-api.com/v4'
    }
  },
  
  // キャッシュ設定
  cache: {
    ttl: 5 * 60, // 5分
    checkPeriod: 60, // 1分ごとに期限切れをチェック
    maxKeys: 500
  },
  
  // 機能フラグ
  features: {
    enableCache: process.env.ENABLE_CACHE === 'true',
    enableRateLimit: process.env.ENABLE_RATE_LIMIT !== 'false',
    enableLogging: process.env.ENABLE_LOGGING !== 'false',
    enableSwagger: process.env.ENABLE_SWAGGER === 'true',
    enableMetrics: process.env.ENABLE_METRICS === 'true'
  }
};

/**
 * 設定の検証
 */
export const validateConfig = () => {
  const required = [
    'JWT_SECRET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0 && config.isProduction) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  if (config.isProduction && config.jwt.secret === 'your-secret-key-change-in-production') {
    throw new Error('Please set a secure JWT_SECRET in production');
  }
  
  return true;
};

/**
 * 環境別設定の取得
 */
export const getEnvConfig = () => {
  switch (config.env) {
    case 'production':
      return {
        ...config,
        logging: {
          ...config.logging,
          level: 'error'
        },
        security: {
          ...config.security,
          bcryptRounds: 12
        }
      };
      
    case 'test':
      return {
        ...config,
        database: {
          ...config.database,
          name: `${config.database.name}_test`
        },
        logging: {
          ...config.logging,
          level: 'error'
        }
      };
      
    default: // development
      return config;
  }
};

export default config;