/**
 * APIレスポンスフォーマッター
 * 統一されたレスポンス形式を提供
 */

/**
 * 成功レスポンス
 */
export const successResponse = (data = null, message = 'Success', meta = {}) => {
  return {
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
};

/**
 * エラーレスポンス
 */
export const errorResponse = (message = 'An error occurred', code = 'ERROR', details = null) => {
  return {
    success: false,
    error: {
      message,
      code,
      details
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * ページネーションレスポンス
 */
export const paginatedResponse = (
  data,
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage
) => {
  return {
    success: true,
    data,
    pagination: {
      currentPage,
      totalPages,
      totalItems,
      itemsPerPage,
      hasNext: currentPage < totalPages,
      hasPrev: currentPage > 1
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * バリデーションエラーレスポンス
 */
export const validationErrorResponse = (errors) => {
  return {
    success: false,
    error: {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: errors
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * 認証エラーレスポンス
 */
export const authErrorResponse = (message = 'Authentication required') => {
  return {
    success: false,
    error: {
      message,
      code: 'AUTH_ERROR'
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * 権限エラーレスポンス
 */
export const forbiddenResponse = (message = 'Insufficient permissions') => {
  return {
    success: false,
    error: {
      message,
      code: 'FORBIDDEN'
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * Not Foundレスポンス
 */
export const notFoundResponse = (resource = 'Resource') => {
  return {
    success: false,
    error: {
      message: `${resource} not found`,
      code: 'NOT_FOUND'
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * 作成成功レスポンス
 */
export const createdResponse = (data, message = 'Created successfully') => {
  return {
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * 更新成功レスポンス
 */
export const updatedResponse = (data, message = 'Updated successfully') => {
  return {
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * 削除成功レスポンス
 */
export const deletedResponse = (message = 'Deleted successfully') => {
  return {
    success: true,
    message,
    data: null,
    meta: {
      timestamp: new Date().toISOString()
    }
  };
};

/**
 * HTTPステータスコード定義
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

/**
 * エラーコード定義
 */
export const ERROR_CODES = {
  // 認証関連
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  
  // 権限関連
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // バリデーション関連
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // リソース関連
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  
  // サーバーエラー
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  
  // レート制限
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
};

/**
 * レスポンスヘルパー
 * Express.jsのres オブジェクトを拡張
 */
export const sendSuccess = (res, data, message, statusCode = HTTP_STATUS.OK) => {
  return res.status(statusCode).json(successResponse(data, message));
};

export const sendError = (res, message, code, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, details = null) => {
  return res.status(statusCode).json(errorResponse(message, code, details));
};

export const sendCreated = (res, data, message) => {
  return res.status(HTTP_STATUS.CREATED).json(createdResponse(data, message));
};

export const sendUpdated = (res, data, message) => {
  return res.status(HTTP_STATUS.OK).json(updatedResponse(data, message));
};

export const sendDeleted = (res, message) => {
  return res.status(HTTP_STATUS.OK).json(deletedResponse(message));
};

export const sendNotFound = (res, resource) => {
  return res.status(HTTP_STATUS.NOT_FOUND).json(notFoundResponse(resource));
};

export const sendUnauthorized = (res, message) => {
  return res.status(HTTP_STATUS.UNAUTHORIZED).json(authErrorResponse(message));
};

export const sendForbidden = (res, message) => {
  return res.status(HTTP_STATUS.FORBIDDEN).json(forbiddenResponse(message));
};

export const sendValidationError = (res, errors) => {
  return res.status(HTTP_STATUS.BAD_REQUEST).json(validationErrorResponse(errors));
};

export const sendPaginated = (res, data, currentPage, totalPages, totalItems, itemsPerPage) => {
  return res.status(HTTP_STATUS.OK).json(
    paginatedResponse(data, currentPage, totalPages, totalItems, itemsPerPage)
  );
};

// Export all response utilities
export default {
  successResponse,
  errorResponse,
  paginatedResponse,
  validationErrorResponse,
  authErrorResponse,
  forbiddenResponse,
  notFoundResponse,
  createdResponse,
  updatedResponse,
  deletedResponse,
  HTTP_STATUS,
  ERROR_CODES,
  sendSuccess,
  sendError,
  sendCreated,
  sendUpdated,
  sendDeleted,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendValidationError,
  sendPaginated
};