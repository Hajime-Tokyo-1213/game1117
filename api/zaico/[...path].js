// Vercel Functions for Zaico API proxy
import { getDecryptedApiKey } from '../../src/utils/encryption.js';

const ZAICO_API_BASE_URL = 'https://api.zaico.co.jp/v1';

// 環境変数からAPIキーを取得し、必要に応じて復号化
const getZaicoApiKey = () => {
  const rawApiKey = process.env.ZAICO_API_KEY;
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!rawApiKey) {
    throw new Error('ZAICO_API_KEY is not set in environment variables');
  }
  
  if (!jwtSecret) {
    console.warn('JWT_SECRET not found, using API key as-is');
    return rawApiKey;
  }
  
  try {
    return getDecryptedApiKey(rawApiKey, jwtSecret);
  } catch (error) {
    console.warn('Failed to decrypt API key, using as-is:', error.message);
    return rawApiKey;
  }
};

// 標準化されたAPIレスポンスフォーマット
const createApiResponse = (success, data = null, error = null, status = 200) => {
  const response = {
    success,
    timestamp: new Date().toISOString(),
    ...(data && { data }),
    ...(error && { error })
  };
  return { response, status };
};

export default async function handler(req, res) {
  console.log('=== Zaico API Proxy Called ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Query:', req.query);
  console.log('Headers:', req.headers);

  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');

  // OPTIONSリクエストの処理
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // メソッド制限
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    const { response, status } = createApiResponse(
      false,
      null,
      {
        code: 'METHOD_NOT_ALLOWED',
        message: `HTTP method ${req.method} is not allowed`,
        allowedMethods: ['GET', 'POST', 'PUT', 'DELETE']
      },
      405
    );
    return res.status(status).json(response);
  }

  try {
    // パスを構築
    const { path } = req.query;
    const endpoint = Array.isArray(path) ? path.join('/') : path || '';
    const url = `${ZAICO_API_BASE_URL}/${endpoint}`;

    // クエリパラメータを追加
    const queryParams = new URLSearchParams();
    Object.entries(req.query).forEach(([key, value]) => {
      if (key !== 'path' && value) {
        queryParams.append(key, String(value));
      }
    });
    
    const fullUrl = queryParams.toString() 
      ? `${url}?${queryParams.toString()}` 
      : url;

    // 環境変数からAPIキーを取得（暗号化されている場合は復号化）
    let zaicoApiKey;
    try {
      zaicoApiKey = getZaicoApiKey();
    } catch (error) {
      console.error('Failed to get Zaico API key:', error.message);
      const { response, status } = createApiResponse(
        false,
        null,
        {
          code: 'CONFIG_ERROR',
          message: 'Server configuration error',
          details: 'API key configuration is invalid'
        },
        500
      );
      return res.status(status).json(response);
    }

    console.log('Calling Zaico API:', fullUrl);
    console.log('Using API key from environment:', zaicoApiKey ? 'loaded' : 'missing');

    // zaico APIにリクエスト
    const response = await fetch(fullUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${zaicoApiKey}`,
        'Content-Type': 'application/json'
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    });

    // レスポンスを取得
    const text = await response.text();
    console.log('Zaico API Response:', {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: text.substring(0, 500)
    });

    let json;
    try {
      json = JSON.parse(text);
    } catch (parseError) {
      console.error('JSON解析エラー:', parseError);
      console.error('レスポンス内容:', text.substring(0, 200));
      const { response: errorResponse, status } = createApiResponse(
        false,
        null,
        {
          code: 'PARSE_ERROR',
          message: 'Failed to parse API response',
          details: `HTTP ${response.status}: ${text.substring(0, 100)}...`
        },
        500
      );
      return res.status(status).json(errorResponse);
    }

    // 成功レスポンスを標準化フォーマットで返す
    if (response.status >= 200 && response.status < 300) {
      const { response: successResponse } = createApiResponse(true, json, null, response.status);
      res.status(response.status).json(successResponse);
    } else {
      // Zaico APIからのエラーレスポンスを標準化
      const { response: errorResponse } = createApiResponse(
        false,
        null,
        {
          code: 'ZAICO_API_ERROR',
          message: json.message || 'External API error',
          details: json,
          httpStatus: response.status
        },
        response.status
      );
      res.status(response.status).json(errorResponse);
    }

  } catch (error) {
    console.error('Zaico API中継エラー:', error);
    const { response: errorResponse, status } = createApiResponse(
      false,
      null,
      {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        details: error.message
      },
      500
    );
    res.status(status).json(errorResponse);
  }
}
