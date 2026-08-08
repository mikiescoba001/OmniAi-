/* ============================================
   OmniAI — Consistent API Response Format
   ============================================ */
'use strict';

/**
 * Success response
 * { success: true, data: {...} }
 */
function success(res, data = null, statusCode = 200) {
  const body = { success: true };
  if (data !== null) body.data = data;
  return res.status(statusCode).json(body);
}

/**
 * Error response
 * { success: false, error: { code, message } }
 */
function error(res, code, message, statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    error: { code, message },
  });
}

/**
 * Paginated response
 * { success: true, data: [...], pagination: { page, limit, total, pages } }
 */
function paginated(res, data, total, page = 1, limit = 20) {
  return res.status(200).json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

module.exports = { success, error, paginated };