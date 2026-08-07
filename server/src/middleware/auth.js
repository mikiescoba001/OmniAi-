/* ============================================
   OmniAI — Authentication Middleware
   ============================================ */
'use strict';

const jwt = require('jsonwebtoken');
const { AuthError, ForbiddenError } = require('../utils/errors');
const { supabase } = require('../db/supabase');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET must be set in .env');
  process.exit(1);
}

/**
 * Verify JWT token from Authorization header
 * Sets req.user = { id, email, name }
 */
function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthError('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      name: decoded.name,
    };

    next();
  } catch (err) {
    if (err instanceof AuthError) return next(err);
    if (err.name === 'TokenExpiredError') {
      return next(new AuthError('Token expired. Please refresh.'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AuthError('Invalid token.'));
    }
    next(err);
  }
}

/**
 * Optional authentication — sets req.user if token is valid, but doesn't fail
 */
function optionalAuth(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name,
      };
    }
  } catch (_) {
    // Token invalid or missing — that's fine
  }
  next();
}

/**
 * Admin authorization — must be called after authenticate
 */
async function requireAdmin(req, _res, next) {
  try {
    const { data, error } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) {
      throw new ForbiddenError('Admin access required');
    }

    req.adminRole = data.role;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Verify subscription status (loads into req.subscription)
 */
async function loadSubscription(req, _res, next) {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) {
      req.subscription = { plan: 'free', status: 'active' };
    } else {
      req.subscription = data;
    }
    next();
  } catch (err) {
    req.subscription = { plan: 'free', status: 'active' };
    next();
  }
}

/**
 * Generate JWT tokens
 */
function generateTokens(user) {
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
}

module.exports = {
  authenticate,
  optionalAuth,
  requireAdmin,
  loadSubscription,
  generateTokens,
};