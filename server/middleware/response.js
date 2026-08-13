// =============================================
// OmniAI Consistent API Response Format
// =============================================

/**
 * Success response wrapper
 */
export function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

/**
 * Error response wrapper
 * Never exposes stack traces or internal details to users
 */
export function error(res, code, message, statusCode = 400, details = null) {
  const body = {
    success: false,
    error: {
      code,
      message,
    },
  };

  // In development, include optional details for debugging
  if (process.env.NODE_ENV === 'development' && details) {
    body.error.details = details;
  }

  return res.status(statusCode).json(body);
}

/**
 * Paginated response
 */
export function paginated(res, data, total, page, limit) {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}

/**
 * Standardized error codes
 */
export const ErrorCodes = {
  // Auth
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  AUTH_RATE_LIMIT: 'AUTH_RATE_LIMIT',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  WEAK_PASSWORD: 'WEAK_PASSWORD',

  // Authorization
  FORBIDDEN: 'FORBIDDEN',
  ADMIN_REQUIRED: 'ADMIN_REQUIRED',
  PLAN_LIMIT: 'PLAN_LIMIT',

  // AI
  AI_FAILED: 'AI_FAILED',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_RATE_LIMIT: 'AI_RATE_LIMIT',
  AI_USAGE_LIMIT: 'AI_USAGE_LIMIT',
  AI_COST_LIMIT: 'AI_COST_LIMIT',
  PROMPT_TOO_LONG: 'PROMPT_TOO_LONG',

  // Files
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_INVALID: 'FILE_TYPE_INVALID',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
  FILE_PROCESSING_FAILED: 'FILE_PROCESSING_FAILED',

  // Database
  DB_FAILED: 'DB_FAILED',
  DB_NOT_CONFIGURED: 'DB_NOT_CONFIGURED',
  NOT_FOUND: 'NOT_FOUND',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Subscription
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',

  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
};

/**
 * Wrap an async route handler with error catching
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}