/* ============================================
   OmniAI — Error Logging Middleware
   Logs non-sensitive error diagnostics to database.
   ============================================ */
'use strict';

const { supabase } = require('../db/supabase');

/**
 * Log an error event to the database (non-sensitive diagnostics only)
 */
async function logError(category, message, statusCode = null, requestId = null, metadata = {}) {
  try {
    await supabase.from('error_events').insert({
      request_id: requestId,
      category,
      message: message.substring(0, 500),
      status_code: statusCode,
      metadata,
    });
  } catch {
    // Silently fail — error logging must never break the app
  }
}

module.exports = { logError };