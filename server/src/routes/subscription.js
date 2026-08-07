/* ============================================
   OmniAI — Subscription Routes
   Server-side plan enforcement — never trust the client.
   ============================================ */
'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../db/supabase');
const { success } = require('../utils/response');
const { AppError } = require('../utils/errors');

const router = Router();
router.use(authenticate);

/**
 * GET /api/subscription
 * Get current user's subscription
 */
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_start, current_period_end, canceled_at')
      .eq('user_id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    success(res, {
      subscription: data || { plan: 'free', status: 'active' },
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/subscription/create-checkout
 * Create a checkout session for premium subscription
 * NOTE: Requires Stripe configuration. Returns checkout URL or instructions.
 */
router.post('/create-checkout', async (req, res, next) => {
  try {
    const { planId } = req.body;

    if (!planId || !['premium_monthly', 'premium_annual'].includes(planId)) {
      throw new AppError('Invalid plan ID. Choose premium_monthly or premium_annual.', 400, 'INVALID_PLAN');
    }

    // Check if already premium
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', req.user.id)
      .single();

    if (existing && existing.plan !== 'free' && existing.status === 'active') {
      throw new AppError('You already have an active premium subscription.', 409, 'ALREADY_PREMIUM');
    }

    // TODO: Integrate Stripe
    // const session = await stripe.checkout.sessions.create({ ... });
    // return success(res, { url: session.url });

    success(res, {
      message: 'Stripe integration required. Set STRIPE_SECRET_KEY in .env to enable payments.',
      note: 'Payment provider not configured. This is a placeholder for Stripe checkout integration.',
      planId,
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/subscription/webhook
 * Stripe webhook endpoint for subscription events
 */
router.post('/webhook', async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'];

    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
      return success(res, { received: true, note: 'Stripe webhook secret not configured.' });
    }

    // TODO: Verify and process Stripe webhook
    // const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

    success(res, { received: true });
  } catch (err) { next(err); }
});

/**
 * POST /api/subscription/cancel
 * Cancel premium subscription
 */
router.post('/cancel', async (req, res, next) => {
  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (!sub || sub.plan === 'free') {
      throw new AppError('No active premium subscription to cancel.', 400, 'NO_SUBSCRIPTION');
    }

    await supabase.from('subscriptions').update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
    }).eq('user_id', req.user.id);

    // Log audit event
    await supabase.from('audit_log').insert({
      user_id: req.user.id,
      action: 'subscription_canceled',
      resource: 'subscriptions',
      metadata: { previous_plan: sub.plan },
    });

    success(res, { message: 'Subscription canceled. You will retain premium access until the end of the billing period.' });
  } catch (err) { next(err); }
});

/**
 * POST /api/subscription/restore
 * Restore free plan after cancellation/expiration
 */
router.post('/restore', async (req, res, next) => {
  try {
    await supabase.from('subscriptions').upsert({
      user_id: req.user.id,
      plan: 'free',
      status: 'active',
    }, { onConflict: 'user_id' });

    success(res, { message: 'Free plan restored.' });
  } catch (err) { next(err); }
});

module.exports = router;