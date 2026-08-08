/* ============================================
   OmniAI — Admin Routes
   Completely inaccessible to normal users.
   ============================================ */
'use strict';

const { Router } = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { supabase } = require('../db/supabase');
const { success } = require('../utils/response');

const router = Router();

// All admin routes require authentication + admin authorization
router.use(authenticate, requireAdmin);

/**
 * GET /api/admin/dashboard
 * Admin dashboard overview
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const [
      { count: totalUsers },
      { count: premiumUsers },
      { count: activeToday },
      { count: newToday },
      { count: totalConversations },
      { count: totalImages },
      { count: totalDocuments },
      { count: totalUsage },
      { count: feedbackCount },
      { count: aiFeedbackCount },
      { count: errorCount },
      { data: recentErrors },
    ] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('subscriptions').select('id', { count: 'exact', head: true }).not('plan', 'eq', 'free'),
      supabase.from('usage_log').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('conversations').select('id', { count: 'exact', head: true }),
      supabase.from('images').select('id', { count: 'exact', head: true }),
      supabase.from('documents').select('id', { count: 'exact', head: true }),
      supabase.from('usage_log').select('id', { count: 'exact', head: true }),
      supabase.from('feedback').select('id', { count: 'exact', head: true }),
      supabase.from('ai_feedback').select('id', { count: 'exact', head: true }),
      supabase.from('error_events').select('id', { count: 'exact', head: true }),
      supabase.from('error_events').select('*').order('created_at', { ascending: false }).limit(20),
    ]);

    // Recent events
    const { data: recentEvents } = await supabase
      .from('admin_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    // Positive vs negative AI feedback
    const { count: positiveFeedback } = await supabase
      .from('ai_feedback').select('id', { count: 'exact', head: true }).eq('rating', 'helpful');
    const { count: negativeFeedback } = await supabase
      .from('ai_feedback').select('id', { count: 'exact', head: true }).eq('rating', 'not_helpful');

    success(res, {
      stats: {
        totalUsers: totalUsers || 0,
        premiumUsers: premiumUsers || 0,
        activeToday: activeToday || 0,
        newToday: newToday || 0,
        totalConversations: totalConversations || 0,
        totalImages: totalImages || 0,
        totalDocuments: totalDocuments || 0,
        totalAiRequests: totalUsage || 0,
        totalFeedback: feedbackCount || 0,
        aiFeedbackPositive: positiveFeedback || 0,
        aiFeedbackNegative: negativeFeedback || 0,
        totalErrors: errorCount || 0,
      },
      recentErrors: recentErrors || [],
      recentEvents: recentEvents || [],
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/users
 * List users with pagination
 */
router.get('/users', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = (page - 1) * limit;
    const search = req.query.search;

    let query = supabase
      .from('users')
      .select('id, email, name, email_verified, created_at', { count: 'exact' });

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get subscription info for each user
    const userIds = (data || []).map(u => u.id);
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('user_id, plan, status')
      .in('user_id', userIds);

    const subMap = {};
    (subs || []).forEach(s => { subMap[s.user_id] = s; });

    const users = (data || []).map(u => ({
      ...u,
      subscription: subMap[u.id] || { plan: 'free', status: 'active' },
    }));

    success(res, {
      users,
      pagination: { page, limit, total: count, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/users/:id
 * Get detailed user information
 */
router.get('/users/:id', async (req, res, next) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, email, name, email_verified, created_at')
      .eq('id', req.params.id)
      .single();

    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } });

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.params.id)
      .single();

    // Get recent usage
    const { data: usage } = await supabase
      .from('usage_log')
      .select('action, created_at')
      .eq('user_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(20);

    success(res, {
      user,
      subscription: sub || { plan: 'free', status: 'active' },
      recentUsage: usage || [],
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/usage
 * Usage analytics
 */
router.get('/usage', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data: usageByDay } = await supabase
      .from('usage_log')
      .select('action, created_at')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    // Aggregate by day and action
    const daily = {};
    (usageByDay || []).forEach(row => {
      const day = row.created_at.split('T')[0];
      if (!daily[day]) daily[day] = {};
      daily[day][row.action] = (daily[day][row.action] || 0) + 1;
    });

    success(res, {
      period: `${days} days`,
      daily,
      total: (usageByDay || []).length,
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/events
 * Admin events / error log
 */
router.get('/events', async (req, res, next) => {
  try {
    const severity = req.query.severity;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('admin_events')
      .select('*', { count: 'exact' });

    if (severity) query = query.eq('severity', severity);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    success(res, {
      events: data || [],
      pagination: { page, limit, total: count, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/admin/events
 * Log an admin event
 */
router.post('/events', async (req, res, next) => {
  try {
    const { event_type, severity, message, metadata } = req.body;
    if (!event_type || !message) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'event_type and message are required.' } });
    }

    await supabase.from('admin_events').insert({
      event_type,
      severity: severity || 'info',
      message,
      metadata: metadata || {},
    });

    success(res, { message: 'Event logged.' }, 201);
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/audit-log
 * View audit log entries
 */
router.get('/audit-log', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('audit_log')
      .select('*, users!inner(name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    success(res, {
      entries: data || [],
      pagination: { page, limit, total: count, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/subscriptions
 * Subscription overview
 */
router.get('/subscriptions', async (req, res, next) => {
  try {
    const { data: planCounts } = await supabase
      .from('subscriptions')
      .select('plan, status');

    const summary = { free: 0, premium_monthly: 0, premium_annual: 0, canceled: 0 };
    (planCounts || []).forEach(s => {
      if (s.status === 'canceled') summary.canceled++;
      else if (summary[s.plan] !== undefined) summary[s.plan]++;
    });

    success(res, { summary });
  } catch (err) { next(err); }
});

module.exports = router;