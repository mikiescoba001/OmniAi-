/* ============================================
   OmniAI — Production Readiness Checker
   Checks external service connectivity.
   Never exposes secrets or internal details.
   ============================================ */
'use strict';

const { supabase } = require('../db/supabase');

// Status values
const CONNECTED = 'CONNECTED';
const NOT_CONFIGURED = 'NOT_CONFIGURED';
const UNAVAILABLE = 'UNAVAILABLE';
const ERROR = 'ERROR';

/**
 * Check Supabase database connectivity
 */
async function checkDatabase() {
  try {
    const { data, error } = await supabase
      .from('health_check')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (error) {
      // PGRST116 = table exists but no rows, which is fine
      if (error.code === 'PGRST116') return CONNECTED;
      return ERROR;
    }
    return CONNECTED;
  } catch (err) {
    if (err.message && err.message.includes('connect')) return UNAVAILABLE;
    return ERROR;
  }
}

/**
 * Check AI provider availability
 */
function checkAIProvider() {
  if (process.env.OPENAI_API_KEY) return CONNECTED;
  if (process.env.ANTHROPIC_API_KEY) return CONNECTED;
  return NOT_CONFIGURED;
}

/**
 * Check auth configuration
 */
function checkAuth() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) return CONNECTED;
  if (process.env.JWT_SECRET) return ERROR; // too short
  return NOT_CONFIGURED;
}

/**
 * Check storage configuration
 */
function checkStorage() {
  const uploadDir = process.env.UPLOAD_DIR;
  if (!uploadDir) return NOT_CONFIGURED;
  try {
    const fs = require('fs');
    const resolved = require('path').resolve(uploadDir);
    if (fs.existsSync(resolved)) return CONNECTED;
    return ERROR; // directory doesn't exist
  } catch {
    return ERROR;
  }
}

/**
 * Check payment configuration
 */
function checkPayments() {
  if (process.env.STRIPE_SECRET_KEY) return CONNECTED;
  return NOT_CONFIGURED;
}

/**
 * Check email configuration
 */
function checkEmail() {
  // Check for common email service providers
  if (process.env.SENDGRID_API_KEY) return CONNECTED;
  if (process.env.AWS_SES_KEY) return CONNECTED;
  if (process.env.RESEND_API_KEY) return CONNECTED;
  if (process.env.SMTP_HOST) return CONNECTED;
  return NOT_CONFIGURED;
}

/**
 * Check Google OAuth configuration
 */
function checkOAuth() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return CONNECTED;
  return NOT_CONFIGURED;
}

/**
 * Check file processing (PDF, etc.)
 */
function checkFileProcessing() {
  // File processing uses the AI provider for summarization
  const ai = checkAIProvider();
  const storage = checkStorage();
  if (ai === CONNECTED && storage === CONNECTED) return CONNECTED;
  if (ai === NOT_CONFIGURED || storage === NOT_CONFIGURED) return NOT_CONFIGURED;
  return UNAVAILABLE;
}

/**
 * Full readiness check — aggregates all service statuses
 */
async function getReadiness() {
  const db = await checkDatabase();

  return {
    database: db,
    ai: checkAIProvider(),
    authentication: checkAuth(),
    storage: checkStorage(),
    payments: checkPayments(),
    email: checkEmail(),
    oauth: checkOAuth(),
    fileProcessing: checkFileProcessing(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Simple health check — returns true/false for core services
 */
async function isHealthy() {
  const db = await checkDatabase();
  const auth = checkAuth();

  // Core: DB + auth must be connected for the app to function
  return db === CONNECTED && auth === CONNECTED;
}

module.exports = {
  getReadiness,
  isHealthy,
  CONNECTED,
  NOT_CONFIGURED,
  UNAVAILABLE,
  ERROR,
};