/* ============================================
   OmniAI — Custom Error Classes
   ============================================ */
'use strict';

class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTH_REQUIRED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMITED');
  }
}

class UsageLimitError extends AppError {
  constructor(message = 'Daily usage limit reached') {
    super(message, 429, 'USAGE_LIMIT_REACHED');
  }
}

class AIError extends AppError {
  constructor(message = 'AI service error', code = 'AI_ERROR') {
    super(message, 502, code);
  }
}

module.exports = {
  AppError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UsageLimitError,
  AIError,
};