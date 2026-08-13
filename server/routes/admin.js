import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { success, error, ErrorCodes, asyncHandler } from '../middleware/response.js';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

// ── Dashboard Stats ──
router.get('/dashboard', asyncHandler(async (req, res) => {
  const { supabase } = await import('../models/database.js');
  let stats;

  if (supabase) {
    // Real queries from Supabase
    const [
      { count: totalUsers },
      { count: activeToday },
      { data: premiumUsers },
      { data: usageData },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('usage').select('user_id', { count: 'exact', head: true })
        .gte('date', new Date().toISOString().slice(0, 10)),
      supabase.from('profiles').select('id').not('plan', 'eq', 'free'),
      supabase.from('usage').select('type, count').gte('date', new Date().toISOString().slice(0, 10)),
    ]);

    const totalPremium = premiumUsers?.length || 0;
    const totalChats = usageData?.filter(u => u.type === 'chat').reduce((s, u) => s + (u.count || 0), 0) || 0;
    const totalImages = usageData?.filter(u => u.type === 'image').reduce((s, u) => s + (u.count || 0), 0) || 0;

    stats = {
      totalUsers: totalUsers || 0,
      activeToday: activeToday || 0,
      premiumUsers: totalPremium,
      totalChats,
      totalImages,
    };
  } else {
    // Fallback for development
    stats = {
      totalUsers: 0,
      activeToday: 0,
      premiumUsers: 0,
      totalChats: 0,
      totalImages: 0,
      note: 'Database not configured. Connect Supabase for real stats.',
    };
  }

  return success(res, {
    ...stats,
    monthlyRevenue: 0,
    avgResponseTime: 'N/A',
    serverUptime: process.uptime(),
    requestsLogged: global.__requestLog?.length || 0,
    errorsLogged: global.__errorLog?.length || 0,
  });
}));

// ── Users List ──
router.get('/users', asyncHandler(async (req, res) => {
  const { supabase } = await import('../models/database.js');
  const { search, limit = 50, offset = 0 } = req.query;

  if (supabase) {
    let query = supabase.from('profiles')
      .select('id, email, name, plan, role, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (search) {
      query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data: users, count } = await query;
    return success(res, { users: users || [], total: count || 0 });
  }

  return success(res, { users: [], total: 0, note: 'Database not configured' });
}));

// ── Update User Plan ──
router.put('/users/:id/plan', asyncHandler(async (req, res) => {
  const { plan } = req.body;
  const validPlans = ['free', 'premium_monthly', 'premium_annual'];

  if (!validPlans.includes(plan)) {
    return error(res, ErrorCodes.VALIDATION_ERROR, `Invalid plan. Must be one of: ${validPlans.join(', ')}`, 400);
  }

  const { upsertProfile } = await import('../models/database.js');
  await upsertProfile({
    id: req.params.id,
    plan,
    updated_at: new Date().toISOString(),
  });

  return success(res, { message: 'Plan updated successfully' });
}));

// ── AI Usage Analytics ──
router.get('/ai-usage', asyncHandler(async (req, res) => {
  const { supabase } = await import('../models/database.js');

  if (supabase) {
    const { data: today } = await supabase.from('usage')
      .select('type, count')
      .gte('date', new Date().toISOString().slice(0, 10));

    const { data: weekly } = await supabase.from('usage')
      .select('type, count, date')
      .gte('date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));

    const formatUsage = (data) => ({
      chats: data?.filter(u => u.type === 'chat').reduce((s, u) => s + (u.count || 0), 0) || 0,
      images: data?.filter(u => u.type === 'image').reduce((s, u) => s + (u.count || 0), 0) || 0,
      writing: data?.filter(u => u.type === 'writing').reduce((s, u) => s + (u.count || 0), 0) || 0,
      total: data?.reduce((s, u) => s + (u.count || 0), 0) || 0,
    });

    return success(res, {
      today: formatUsage(today),
      thisWeek: formatUsage(weekly),
    });
  }

  return success(res, {
    today: { chats: 0, images: 0, writing: 0, total: 0 },
    thisWeek: { chats: 0, images: 0, writing: 0, total: 0 },
    note: 'Database not configured',
  });
}));

// ── Error Log ──
router.get('/errors', asyncHandler(async (req, res) => {
  const errors = global.__errorLog?.slice(-100) || [];
  return success(res, { errors, total: errors.length });
}));

// ── Request Log ──
router.get('/requests', asyncHandler(async (req, res) => {
  const requests = global.__requestLog?.slice(-200) || [];
  return success(res, { requests, total: requests.length });
}));

export default router;