/* ============================================
   OmniAI — Analytics Middleware
   Privacy-conscious product analytics.
   Never logs passwords, tokens, or sensitive content.
   ============================================ */
'use strict';

const { supabase } = require('../db/supabase');

/**
 * Track a product analytics event
 */
async function trackEvent(userId, event, page = null, metadata = {}) {
  if (!userId) return;
  try {
    await supabase.from('analytics_events').insert({
      user_id: userId,
      event,
      page,
      metadata,
    });
  } catch {
    // Silently fail — analytics must never break the app
  }
}

/**
 * Middleware: track page view
 */
function analyticsMiddleware(req, res, next) {
  // Store analytics helper on req for use in route handlers
  req.trackEvent = (event, metadata = {}) => {
    if (req.user) {
      trackEvent(req.user.id, event, req.path, metadata);
    }
  };
  next();
}

module.exports = { trackEvent, analyticsMiddleware };