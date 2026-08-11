/* ============================================
   OmniAI — Emergency AI Kill Switch
   Admin-only global disable for AI generation.
   ============================================ */
'use strict';

const { supabase } = require('../db/supabase');

const KILL_SWITCH_KEY = 'ai_kill_switch_active';
const CACHE_TTL = 60000; // 1 minute cache

let cachedState = null;
let lastFetch = 0;

/**
 * Check if AI generation is globally disabled.
 * Falls back to environment variable, then database.
 */
async function isAIDisabled() {
  // 1. Check environment variable (fastest, admin override)
  const envDisabled = process.env.AI_KILL_SWITCH === 'true' || process.env.AI_KILL_SWITCH === '1';
  if (envDisabled) return true;

  // 2. Check cache
  const now = Date.now();
  if (cachedState !== null && (now - lastFetch) < CACHE_TTL) {
    return cachedState;
  }

  // 3. Check database (persistent, admin-controlled)
  try {
    const { data, error } = await supabase
      .from('admin_events')
      .select('metadata')
      .eq('event_type', KILL_SWITCH_KEY)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // If DB fails, default to allowing (fail-safe)
      cachedState = false;
      lastFetch = now;
      return false;
    }

    const active = data?.metadata?.active === true;
    cachedState = active;
    lastFetch = now;
    return active;
  } catch {
    cachedState = false;
    lastFetch = now;
    return false;
  }
}

/**
 * Toggle the AI kill switch (admin only)
 */
async function setKillSwitch(active, adminUserId) {
  const { error } = await supabase.from('admin_events').insert({
    event_type: KILL_SWITCH_KEY,
    severity: active ? 'warning' : 'info',
    message: active
      ? 'AI KILL SWITCH ACTIVATED — all AI generation disabled by administrator.'
      : 'AI KILL SWITCH DEACTIVATED — AI generation re-enabled.',
    metadata: {
      active,
      toggled_by: adminUserId,
      toggled_at: new Date().toISOString(),
    },
  });

  if (error) throw new Error('Failed to update kill switch state');
  cachedState = active;
  lastFetch = Date.now();
}

/**
 * Middleware: blocks AI requests when kill switch is active
 */
function aiKillSwitchMiddleware(req, res, next) {
  (async () => {
    try {
      const disabled = await isAIDisabled();
      if (disabled) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'AI_DISABLED',
            message: 'AI generation is currently disabled by the system administrator. Please try again later.',
          },
        });
      }
      next();
    } catch {
      // Fail open — if we can't check, allow the request
      next();
    }
  })();
}

module.exports = {
  isAIDisabled,
  setKillSwitch,
  aiKillSwitchMiddleware,
};