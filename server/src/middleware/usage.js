/* ============================================
   OmniAI — Usage Tracking & Rate Limiting
   All limits enforced server-side — never trust the client.
   ============================================ */
'use strict';

const { supabase } = require('../db/supabase');
const { UsageLimitError } = require('../utils/errors');

/**
 * Daily usage limits based on plan
 */
const DAILY_LIMITS = {
  free: {
    ai_chat: parseInt(process.env.FREE_AI_REQUESTS_DAILY, 10) || 20,
    ai_writing: parseInt(process.env.FREE_AI_REQUESTS_DAILY, 10) || 20,
    ai_image: parseInt(process.env.FREE_IMAGE_GENERATIONS_DAILY, 10) || 3,
    ai_video: parseInt(process.env.FREE_AI_REQUESTS_DAILY, 10) || 20,
    ai_learning: parseInt(process.env.FREE_AI_REQUESTS_DAILY, 10) || 20,
    ai_business: parseInt(process.env.FREE_AI_REQUESTS_DAILY, 10) || 20,
    document_upload: parseInt(process.env.FREE_DOCUMENT_UPLOADS_DAILY, 10) || 5,
    document_summarize: 10,
    document_query: 20,
  },
  premium_monthly: {
    ai_chat: parseInt(process.env.PREMIUM_AI_REQUESTS_DAILY, 10) || 500,
    ai_writing: parseInt(process.env.PREMIUM_AI_REQUESTS_DAILY, 10) || 500,
    ai_image: parseInt(process.env.PREMIUM_IMAGE_GENERATIONS_DAILY, 10) || 50,
    ai_video: parseInt(process.env.PREMIUM_AI_REQUESTS_DAILY, 10) || 500,
    ai_learning: parseInt(process.env.PREMIUM_AI_REQUESTS_DAILY, 10) || 500,
    ai_business: parseInt(process.env.PREMIUM_AI_REQUESTS_DAILY, 10) || 500,
    document_upload: parseInt(process.env.PREMIUM_DOCUMENT_UPLOADS_DAILY, 10) || 100,
    document_summarize: 100,
    document_query: 200,
  },
  premium_annual: {
    ai_chat: parseInt(process.env.PREMIUM_AI_REQUESTS_DAILY, 10) || 500,
    ai_writing: parseInt(process.env.PREMIUM_AI_REQUESTS_DAILY, 10) || 500,
    ai_image: parseInt(process.env.PREMIUM_IMAGE_GENERATIONS_DAILY, 10) || 50,
    ai_video: parseInt(process.env.PREMIUM_AI_REQUESTS_DAILY, 10) || 500,
    ai_learning: parseInt(process.env.PREMIUM_AI_REQUESTS_DAILY, 10) || 500,
    ai_business: parseInt(process.env.PREMIUM_AI_REQUESTS_DAILY, 10) || 500,
    document_upload: parseInt(process.env.PREMIUM_DOCUMENT_UPLOADS_DAILY, 10) || 100,
    document_summarize: 100,
    document_query: 200,
  },
};

/**
 * Middleware: check daily usage limit for a specific action
 * Must be used after authenticate and loadSubscription middleware
 */
function checkUsageLimit(action) {
  return async (req, _res, next) => {
    try {
      const plan = req.subscription?.plan || 'free';
      const limit = DAILY_LIMITS[plan]?.[action];

      if (limit === undefined) {
        // Unknown action — allow by default but log
        console.warn(`Unknown usage action: ${action} for plan ${plan}`);
        return next();
      }

      // Count today's usage for this action
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count, error } = await supabase
        .from('usage_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', req.user.id)
        .eq('action', action)
        .gte('created_at', today.toISOString());

      if (error) {
        console.error('Usage check error:', error.message);
        // Fail open — allow the request if DB fails
        return next();
      }

      if (count >= limit) {
        return next(new UsageLimitError(
          `Daily ${action.replace('_', ' ')} limit reached (${limit}/${limit}). Upgrade to Premium for more.`
        ));
      }

      next();
    } catch (err) {
      // Fail open on unexpected errors
      console.error('Usage middleware error:', err);
      next();
    }
  };
}

/**
 * Log a usage event after successful processing
 */
async function logUsage(userId, action, metadata = {}) {
  try {
    const { error } = await supabase.from('usage_log').insert({
      user_id: userId,
      action,
      metadata,
    });

    if (error) {
      console.error('Usage log error:', error.message);
    }
  } catch (err) {
    console.error('Usage log exception:', err);
  }
}

/**
 * Get remaining usage for a user
 */
async function getRemainingUsage(userId, plan = 'free') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limits = DAILY_LIMITS[plan] || DAILY_LIMITS.free;

  const usage = {};

  for (const [action, limit] of Object.entries(limits)) {
    try {
      const { count } = await supabase
        .from('usage_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('action', action)
        .gte('created_at', today.toISOString());

      usage[action] = {
        used: count || 0,
        limit,
        remaining: Math.max(0, limit - (count || 0)),
      };
    } catch {
      usage[action] = { used: 0, limit, remaining: limit };
    }
  }

  return usage;
}

module.exports = {
  checkUsageLimit,
  logUsage,
  getRemainingUsage,
  DAILY_LIMITS,
};