/* ============================================
   OmniAI — Supabase Client (Lazy Init)
   Creates client only on first query, not at import.
   ============================================ */
'use strict';

const { createClient } = require('@supabase/supabase-js');

let _client = null;
let _initAttempted = false;

/**
 * Get or initialize the Supabase client lazily.
 * Returns null if not configured.
 */
function getClient() {
  if (_client) return _client;
  if (_initAttempted) return null; // already tried and failed

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    _initAttempted = true;
    return null;
  }

  try {
    _client = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'public' },
    });
    _initAttempted = true;
    return _client;
  } catch (err) {
    console.error('Supabase client initialization failed:', err.message);
    _initAttempted = true;
    return null;
  }
}

/**
 * Verify database connectivity
 */
async function checkConnection() {
  const client = getClient();
  if (!client) return false;

  try {
    const { error } = await client.from('health_check').select('id').limit(1).maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.error('Database connection check failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Database connection error:', err.message);
    return false;
  }
}

// Export a proxy object that creates the client lazily
const supabase = new Proxy({}, {
  get(_, prop) {
    const client = getClient();
    if (!client) {
      // Return a stub that throws descriptive errors
      if (prop === 'from') {
        return () => ({
          select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: { code: 'NO_CLIENT', message: 'Database not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env' } }) }) }),
          insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: 'NO_CLIENT', message: 'Database not configured' } }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: { code: 'NO_CLIENT', message: 'Database not configured' } }) }) }) }),
          delete: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: 'NO_CLIENT', message: 'Database not configured' } }) }) }),
        });
      }
      return () => Promise.reject(new Error('Database not configured'));
    }
    return client[prop];
  },
});

module.exports = { supabase, checkConnection, getClient };