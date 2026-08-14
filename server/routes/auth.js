import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { supabase } from '../models/database.js';
import { generateToken } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/rateLimit.js';
import { success, error, ErrorCodes, asyncHandler } from '../middleware/response.js';
import { getProfile, upsertProfile } from '../models/database.js';
import config from '../config.js';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  name: z.string().min(1, 'Name is required').max(100),
});

const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

// ── Register ──
router.post('/register', authRateLimit, asyncHandler(async (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);

  if (supabase) {
    // Use Supabase Auth for registration
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${config.frontendUrl}/auth/callback`,
      },
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return error(res, ErrorCodes.EMAIL_EXISTS, 'An account with this email already exists', 409);
      }
      return error(res, ErrorCodes.AUTH_INVALID, authError.message, 400);
    }

    // Create profile record
    await upsertProfile({
      id: authData.user.id,
      email,
      name,
      plan: 'free',
      role: 'user',
      email_verified: false,
    });

    const token = generateToken(authData.user.id, 'user');
    return success(res, {
      token,
      user: {
        id: authData.user.id,
        email,
        name,
        plan: 'free',
        role: 'user',
      },
    }, 201);
  }

  // No Supabase — use bcrypt + in-memory (development only)
  const existingProfile = await getProfile(email);
  if (existingProfile) {
    return error(res, ErrorCodes.EMAIL_EXISTS, 'An account with this email already exists', 409);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();

  await upsertProfile({
    id,
    email,
    name,
    password_hash: hashedPassword,
    plan: 'free',
    role: 'user',
  });

  const token = generateToken(id, 'user');
  return success(res, {
    token,
    user: { id, email, name, plan: 'free', role: 'user' },
  }, 201);
}));

// ── Login ──
router.post('/login', authRateLimit, asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  if (supabase) {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return error(res, ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password', 401);
    }

    const profile = await getProfile(authData.user.id);
    const token = generateToken(authData.user.id, profile?.role || 'user');

    return success(res, {
      token,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        name: profile?.name || email.split('@')[0],
        plan: profile?.plan || 'free',
        role: profile?.role || 'user',
        email_verified: authData.user.email_confirmed_at ? true : false,
      },
    });
  }

  // Development-only: validate credentials from in-memory store
  const profile = await getProfile(email);
  if (!profile) {
    return error(res, ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password', 401);
  }

  const validPassword = await bcrypt.compare(password, profile.password_hash || '');
  if (!validPassword) {
    return error(res, ErrorCodes.INVALID_CREDENTIALS, 'Invalid email or password', 401);
  }

  const token = generateToken(profile.id, profile.role || 'user');
  return success(res, {
    token,
    user: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      plan: profile.plan || 'free',
      role: profile.role || 'user',
    },
  });
}));

// ── Google Sign-In ──
router.post('/google', authRateLimit, asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return error(res, ErrorCodes.AUTH_INVALID, 'ID token is required', 400);
  }

  if (!supabase) {
    return error(res, ErrorCodes.SERVICE_UNAVAILABLE,
      'Google sign-in requires Supabase authentication. Please use email/password registration.', 503);
  }

  const { data, error: authError } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });

  if (authError) {
    return error(res, ErrorCodes.AUTH_INVALID, 'Google authentication failed. Please try again.', 401);
  }

  // Create or update profile
  const existingProfile = await getProfile(data.user.id);
  if (!existingProfile) {
    await upsertProfile({
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'User',
      plan: 'free',
      role: 'user',
      email_verified: !!data.user.email_confirmed_at,
    });
  }

  const profile = existingProfile || await getProfile(data.user.id);
  const token = generateToken(data.user.id, profile?.role || 'user');

  return success(res, {
    token,
    user: {
      id: data.user.id,
      email: data.user.email,
      name: profile?.name || data.user.user_metadata?.full_name || 'User',
      plan: profile?.plan || 'free',
      role: profile?.role || 'user',
    },
  });
}));

// ── Password Reset ──
router.post('/reset-password', authRateLimit, asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return error(res, ErrorCodes.VALIDATION_ERROR, 'Email is required', 400);
  }

  if (supabase) {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${config.frontendUrl}/reset-password`,
    });
  }

  // Always return success to prevent email enumeration
  return success(res, {
    message: 'If an account with this email exists, a password reset link has been sent.',
  });
}));

// ── Update Password (after reset) ──
router.put('/update-password', authRateLimit, asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    return error(res, ErrorCodes.WEAK_PASSWORD, 'Password must be at least 8 characters', 400);
  }

  if (!supabase) {
    return error(res, ErrorCodes.SERVICE_UNAVAILABLE, 'Password update requires Supabase', 503);
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return error(res, ErrorCodes.AUTH_INVALID, updateError.message, 400);
  }

  return success(res, { message: 'Password updated successfully' });
}));

// ── Get Profile (authenticated) ──
router.get('/profile', asyncHandler(async (req, res) => {
  const profile = await getProfile(req.userId);
  if (!profile) {
    return error(res, ErrorCodes.NOT_FOUND, 'Profile not found', 404);
  }

  // Never expose password hashes
  const { password_hash, ...safeProfile } = profile;
  return success(res, safeProfile);
}));

// ── Update Profile (authenticated) ──
router.put('/profile', asyncHandler(async (req, res) => {
  const { name, preferences } = req.body;

  if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
    return error(res, ErrorCodes.VALIDATION_ERROR, 'Name must be a string under 100 characters', 400);
  }

  const updateData = { id: req.userId, updated_at: new Date().toISOString() };
  if (name !== undefined) updateData.name = name;
  if (preferences !== undefined) updateData.preferences = preferences;

  const { data } = await upsertProfile(updateData);
  return success(res, data);
}));

// ── Verify Token / Refresh Session ──
router.post('/verify', asyncHandler(async (req, res) => {
  const profile = await getProfile(req.userId);
  if (!profile) {
    return error(res, ErrorCodes.AUTH_INVALID, 'Session expired. Please log in again.', 401);
  }

  const { password_hash, ...safeProfile } = profile;
  return success(res, {
    user: safeProfile,
    token: req.headers.authorization?.split(' ')[1],
  });
}));

export default router;