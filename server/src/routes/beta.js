/* ============================================
   OmniAI — Beta Feature Routes
   Feedback, search, account deletion, data export
   ============================================ */
'use strict';

const { Router } = require('express');
const { z } = require('zod');
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../db/supabase');
const { AppError } = require('../utils/errors');
const { success } = require('../utils/response');

const router = Router();

// All beta routes require authentication
router.use(authenticate);

// ============================================
// USER FEEDBACK
// ============================================
const feedbackSchema = z.object({
  category: z.enum(['bug', 'feature_request', 'performance', 'ai_quality', 'general']),
  message: z.string().min(1).max(5000),
});

router.post('/feedback', async (req, res, next) => {
  try {
    const { category, message } = feedbackSchema.parse(req.body);

    await supabase.from('feedback').insert({
      user_id: req.user.id,
      category,
      message,
    });

    req.trackEvent?.('feedback_submitted', { category });
    success(res, { message: 'Thank you for your feedback!' });
  } catch (err) { next(err); }
});

// ============================================
// AI RESPONSE FEEDBACK
// ============================================
const aiFeedbackSchema = z.object({
  feature: z.string().min(1),
  rating: z.enum(['helpful', 'not_helpful']),
  regenerated: z.boolean().optional(),
  responseId: z.string().optional(),
});

router.post('/ai-feedback', async (req, res, next) => {
  try {
    const { feature, rating, regenerated, responseId } = aiFeedbackSchema.parse(req.body);

    await supabase.from('ai_feedback').insert({
      user_id: req.user.id,
      feature,
      rating,
      regenerated: regenerated || false,
      response_id: responseId || null,
    });

    success(res, { message: 'Feedback recorded.' });
  } catch (err) { next(err); }
});

// ============================================
// GLOBAL SEARCH
// ============================================
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return success(res, { results: [] });
    }

    const searchTerm = `%${q}%`;

    // Search across multiple user-owned content types
    const [conversations, documents, notes, todos, content] = await Promise.all([
      supabase.from('conversations')
        .select('id, title, type, created_at')
        .eq('user_id', req.user.id)
        .ilike('title', searchTerm)
        .order('updated_at', { ascending: false })
        .limit(10),
      supabase.from('documents')
        .select('id, original_name, created_at')
        .eq('user_id', req.user.id)
        .ilike('original_name', searchTerm)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('notes')
        .select('id, title, created_at')
        .eq('user_id', req.user.id)
        .ilike('title', searchTerm)
        .order('updated_at', { ascending: false })
        .limit(10),
      supabase.from('todos')
        .select('id, text, done, created_at')
        .eq('user_id', req.user.id)
        .ilike('text', searchTerm)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('generated_content')
        .select('id, type, prompt, created_at')
        .eq('user_id', req.user.id)
        .ilike('prompt', searchTerm)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const results = [];
    (conversations.data || []).forEach(c => results.push({ type: 'conversation', id: c.id, title: c.title, created_at: c.created_at }));
    (documents.data || []).forEach(d => results.push({ type: 'document', id: d.id, title: d.original_name, created_at: d.created_at }));
    (notes.data || []).forEach(n => results.push({ type: 'note', id: n.id, title: n.title, created_at: n.created_at }));
    (todos.data || []).forEach(t => results.push({ type: 'todo', id: t.id, title: t.text, done: t.done, created_at: t.created_at }));
    (content.data || []).forEach(c => results.push({ type: 'content', id: c.id, title: c.prompt, subtype: c.type, created_at: c.created_at }));

    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    success(res, { results: results.slice(0, 20), query: q });
  } catch (err) { next(err); }
});

// ============================================
// RECENT ACTIVITY
// ============================================
router.get('/recent', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const [conversations, documents, notes, content] = await Promise.all([
      supabase.from('conversations')
        .select('id, title, type, updated_at')
        .eq('user_id', req.user.id)
        .order('updated_at', { ascending: false })
        .limit(limit),
      supabase.from('documents')
        .select('id, original_name, created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase.from('notes')
        .select('id, title, updated_at')
        .eq('user_id', req.user.id)
        .order('updated_at', { ascending: false })
        .limit(limit),
      supabase.from('generated_content')
        .select('id, type, prompt, created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);

    const items = [];
    (conversations.data || []).forEach(c => items.push({ type: 'conversation', id: c.id, title: c.title, time: c.updated_at, icon: '💬' }));
    (documents.data || []).forEach(d => items.push({ type: 'document', id: d.id, title: d.original_name, time: d.created_at, icon: '📄' }));
    (notes.data || []).forEach(n => items.push({ type: 'note', id: n.id, title: n.title, time: n.updated_at, icon: '📝' }));
    (content.data || []).forEach(c => items.push({ type: 'content', id: c.id, title: c.prompt, time: c.created_at, icon: '✨' }));

    items.sort((a, b) => new Date(b.time) - new Date(a.time));
    success(res, { items: items.slice(0, limit) });
  } catch (err) { next(err); }
});

// ============================================
// ACCOUNT DELETION
// ============================================
router.delete('/account', async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Verify password for sensitive operation
    const { password } = req.body || {};
    if (!password) {
      throw new AppError('Password is required to delete your account.', 400, 'PASSWORD_REQUIRED');
    }

    const bcrypt = require('bcryptjs');
    const { data: user } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError('Invalid password.', 401, 'INVALID_PASSWORD');
    }

    // Delete user — all related data cascades via FK ON DELETE CASCADE
    await supabase.from('users').delete().eq('id', userId);

    req.trackEvent?.('account_deleted');
    success(res, { message: 'Your account and all associated data have been permanently deleted.' });
  } catch (err) { next(err); }
});

// ============================================
// DATA EXPORT
// ============================================
router.get('/export', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [conversations, documents, notes, todos, habits, goals, content, images] = await Promise.all([
      supabase.from('conversations').select('*').eq('user_id', userId),
      supabase.from('documents').select('id, original_name, mime_type, size_bytes, created_at').eq('user_id', userId),
      supabase.from('notes').select('*').eq('user_id', userId),
      supabase.from('todos').select('*').eq('user_id', userId),
      supabase.from('habits').select('*, habit_logs(*)').eq('user_id', userId),
      supabase.from('goals').select('*').eq('user_id', userId),
      supabase.from('generated_content').select('*').eq('user_id', userId),
      supabase.from('images').select('*').eq('user_id', userId),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      conversations: conversations.data || [],
      documents: documents.data || [],
      notes: notes.data || [],
      todos: todos.data || [],
      habits: habits.data || [],
      goals: goals.data || [],
      generated_content: content.data || [],
      images: images.data || [],
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="omniai-export.json"');
    res.json(exportData);
  } catch (err) { next(err); }
});

// ============================================
// ONBOARDING STATE
// ============================================
router.put('/onboarding', async (req, res, next) => {
  try {
    const schema = z.object({
      interests: z.array(z.string()).max(10).optional(),
      completed: z.boolean().optional(),
    });
    const { interests, completed } = schema.parse(req.body);

    const updates = {};
    if (interests) updates.interests = interests;
    if (completed !== undefined) updates.onboarding_completed = completed;

    await supabase.from('profiles').update(updates).eq('user_id', req.user.id);

    success(res, { message: 'Onboarding updated.' });
  } catch (err) { next(err); }
});

// ============================================
// BETA STATUS
// ============================================
router.get('/status', async (req, res, next) => {
  try {
    const { BETA_CONFIG } = require('../services/beta');
    const { getRemainingUsage } = require('../middleware/usage');
    const plan = req.subscription?.plan || 'free';
    const usage = await getRemainingUsage(req.user.id, plan);

    success(res, {
      beta: BETA_CONFIG.mode,
      version: BETA_CONFIG.version,
      plan,
      usage,
      features: BETA_CONFIG.features,
    });
  } catch (err) { next(err); }
});

module.exports = router;