/* ============================================
   OmniAI — Authentication Routes
   ============================================ */
'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../db/supabase');
const { authenticate, generateTokens } = require('../middleware/auth');
const { registerSchema, loginSchema, resetPasswordSchema } = require('../utils/validators');
const { AppError, AuthError } = require('../utils/errors');
const { success } = require('../utils/response');

const router = Router();

/**
 * POST /api/auth/register
 * Create a new user account
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);

    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existing) {
      throw new AppError('An account with this email already exists.', 409, 'EMAIL_EXISTS');
    }

    // Hash password server-side (never store plaintext)
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        name,
      })
      .select('id, email, name, created_at')
      .single();

    if (error) {
      console.error('User creation error:', error);
      throw new AppError('Failed to create account.', 500, 'REGISTRATION_FAILED');
    }

    // Create profile
    await supabase.from('profiles').insert({
      user_id: user.id,
      display_name: name,
    });

    // Create free subscription
    await supabase.from('subscriptions').insert({
      user_id: user.id,
      plan: 'free',
      status: 'active',
    });

    // Generate tokens
    const tokens = generateTokens(user);

    success(res, {
      user: { id: user.id, email: user.email, name: user.name },
      ...tokens,
    }, 201);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Authenticate existing user
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, password_hash')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      throw new AuthError('Invalid email or password.');
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AuthError('Invalid email or password.');
    }

    const tokens = generateTokens(user);

    success(res, {
      user: { id: user.id, email: user.email, name: user.name },
      ...tokens,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Invalidate current session (client-side token removal)
 */
router.post('/logout', authenticate, async (req, res) => {
  // In a stateless JWT setup, logout is handled client-side by removing the token.
  // For added security, we could blacklist tokens. For MVP, we acknowledge.
  success(res, { message: 'Logged out successfully.' });
});

/**
 * GET /api/auth/me
 * Get current user's profile
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, avatar_url, email_verified, created_at')
      .eq('id', req.user.id)
      .single();

    if (error) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    // Get subscription
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', req.user.id)
      .single();

    // Get profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, bio, timezone, theme')
      .eq('user_id', req.user.id)
      .single();

    success(res, {
      ...user,
      subscription: sub || { plan: 'free', status: 'active' },
      profile: profile || { display_name: user.name, timezone: 'UTC', theme: 'dark' },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticate, async (req, res, next) => {
  try {
    const { name, displayName, bio, timezone, theme } = req.body;

    if (name) {
      await supabase.from('users').update({ name }).eq('id', req.user.id);
    }

    const profileUpdates = {};
    if (displayName) profileUpdates.display_name = displayName;
    if (bio !== undefined) profileUpdates.bio = bio;
    if (timezone) profileUpdates.timezone = timezone;
    if (theme) profileUpdates.theme = theme;

    if (Object.keys(profileUpdates).length > 0) {
      await supabase.from('profiles').update(profileUpdates).eq('user_id', req.user.id);
    }

    success(res, { message: 'Profile updated.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new AuthError('Refresh token required.');
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    if (decoded.type !== 'refresh') {
      throw new AuthError('Invalid refresh token.');
    }

    // Fetch user to generate new tokens
    const { data: user } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('id', decoded.sub)
      .single();

    if (!user) {
      throw new AuthError('User not found.');
    }

    const tokens = generateTokens(user);
    success(res, tokens);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AuthError('Refresh token expired. Please login again.'));
    }
    next(err);
  }
});

/**
 * POST /api/auth/reset-password
 * Request password reset (email sending is future)
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email } = resetPasswordSchema.parse(req.body);

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    // Always return success to prevent email enumeration
    if (!user) {
      return success(res, { message: 'If the email exists, a reset link has been sent.' });
    }

    // TODO: Send password reset email via SendGrid / AWS SES
    // For now, log it
    console.log(`Password reset requested for user: ${user.id}`);

    success(res, { message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;