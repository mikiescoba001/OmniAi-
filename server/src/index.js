/* ============================================
   OmniAI Server v2.1 — Launch Candidate
   ============================================ */
'use strict';

const dotenv = require('dotenv');
const envPath = require('path').resolve(__dirname, '../../.env');
const altEnvPath = require('path').resolve(__dirname, '../.env');
const fs = require('fs');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else if (fs.existsSync(altEnvPath)) {
  dotenv.config({ path: altEnvPath });
}
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// ============================================
// ENVIRONMENT VALIDATION (Phase 2)
// ============================================
const ENV = {
  // REQUIRED FOR CORE
  core: {
    SUPABASE_URL: { key: 'SUPABASE_URL', required: true },
    SUPABASE_SERVICE_KEY: { key: 'SUPABASE_SERVICE_KEY', required: true },
    JWT_SECRET: { key: 'JWT_SECRET', required: true, validate: v => v.length >= 32 },
  },
  // REQUIRED FOR AI
  ai: {
    OPENAI_API_KEY: { key: 'OPENAI_API_KEY', required: false },
    ANTHROPIC_API_KEY: { key: 'ANTHROPIC_API_KEY', required: false },
  },
  // REQUIRED FOR PAYMENTS
  payments: {
    STRIPE_SECRET_KEY: { key: 'STRIPE_SECRET_KEY', required: false },
    STRIPE_WEBHOOK_SECRET: { key: 'STRIPE_WEBHOOK_SECRET', required: false },
  },
  // REQUIRED FOR EMAIL
  email: {
    SENDGRID_API_KEY: { key: 'SENDGRID_API_KEY', required: false },
    RESEND_API_KEY: { key: 'RESEND_API_KEY', required: false },
    SMTP_HOST: { key: 'SMTP_HOST', required: false },
  },
  // REQUIRED FOR GOOGLE AUTH
  oauth: {
    GOOGLE_CLIENT_ID: { key: 'GOOGLE_CLIENT_ID', required: false },
    GOOGLE_CLIENT_SECRET: { key: 'GOOGLE_CLIENT_SECRET', required: false },
  },
};

function validateEnvironment() {
  const results = { optional: {} };

  for (const [group, vars] of Object.entries(ENV)) {
    const isCore = group === 'core';
    results[group] = { configured: [], missing: [] };
    if (isCore) results[group].ok = true;

    for (const [name, config] of Object.entries(vars)) {
      const value = process.env[config.key];
      if (!value) {
        results[group].missing.push(name);
        if (config.required && isCore) results[group].ok = false;
      } else if (config.validate && !config.validate(value)) {
        console.error(`  ⚠️  ${config.key} is set but appears invalid`);
        if (config.required && isCore) results[group].ok = false;
      } else {
        results[group].configured.push(name);
      }
    }
  }

  return results;
}

const envCheck = validateEnvironment();

if (!envCheck.core.ok) {
  console.error('');
  console.error('╔══════════════════════════════════════════════╗');
  console.error('║   OMNIAI — FATAL: MISSING CORE CONFIGURATION ║');
  console.error('╚══════════════════════════════════════════════╝');
  console.error('');
  console.error('The following required environment variables are missing:');
  envCheck.core.missing.forEach(v => console.error(`  ✗ ${ENV.core[v]?.key || v}`));
  console.error('');
  console.error('Copy .env.example to .env and fill in the values.');
  console.error('');
  process.exit(1);
}

// ============================================
// APP SETUP
// ============================================
const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS, 10) || 60000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
});
app.use(globalLimiter);

// Request correlation ID for observability
const { requestIdMiddleware } = require('./middleware/requestId');
app.use(requestIdMiddleware);

// Logging — redact sensitive headers
morgan.token('auth', (req) => req.headers.authorization ? '[REDACTED]' : '-');
app.use(morgan(process.env.NODE_ENV === 'production'
  ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms'
  : 'dev'));

// Body parsing with size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Analytics middleware (privacy-conscious)
const { analyticsMiddleware } = require('./services/analytics');
app.use(analyticsMiddleware);

// ============================================
// HEALTH & READINESS (Phase 1)
// ============================================
const { getReadiness, isHealthy } = require('./services/readiness');

// Public health check
app.get('/health', async (req, res) => {
  const healthy = await isHealthy();
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    data: {
      status: healthy ? 'healthy' : 'degraded',
      version: '2.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

// Protected status endpoint — requires admin auth
app.get('/api/status', require('./middleware/auth').authenticate, require('./middleware/auth').requireAdmin, async (req, res) => {
  const readiness = await getReadiness();
  res.json({
    success: true,
    data: {
      ...readiness,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      uptime: process.uptime(),
    },
  });
});

// ============================================
// ROUTES
// ============================================
const { aiKillSwitchMiddleware } = require('./services/killswitch');

const authRoutes = require('./routes/auth');
const aiRoutes = require('./routes/ai');
const documentRoutes = require('./routes/documents');
const productivityRoutes = require('./routes/productivity');
const adminRoutes = require('./routes/admin');
const subscriptionRoutes = require('./routes/subscription');

const betaRoutes = require('./routes/beta');

app.use('/api/auth', authRoutes);
app.use('/api/ai', aiKillSwitchMiddleware, aiRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/productivity', productivityRoutes);
app.use('/api/beta', betaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Admin kill switch control
app.post('/api/admin/kill-switch', require('./middleware/auth').authenticate, require('./middleware/auth').requireAdmin, async (req, res, next) => {
  try {
    const { active } = req.body;
    if (typeof active !== 'boolean') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'active must be a boolean.' } });
    }
    const { setKillSwitch } = require('./services/killswitch');
    await setKillSwitch(active, req.user.id);
    res.json({
      success: true,
      data: { killSwitchActive: active, message: active ? 'AI generation disabled.' : 'AI generation enabled.' },
    });
  } catch (err) { next(err); }
});

// ============================================
// STATIC FRONTEND (production single-process serving)
// ============================================
const FRONTEND_DIR = process.env.FRONTEND_DIR || require('path').resolve(__dirname, '../../');

// Serve static assets (css, js, images)
app.use(express.static(FRONTEND_DIR, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health' || req.path === '/api/status') {
    return next();
  }
  res.sendFile(require('path').join(FRONTEND_DIR, 'index.html'));
});

// ============================================
// ERROR HANDLING
// ============================================
const { AppError } = require('./utils/errors');

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
});

app.use((err, req, res, _next) => {
  // Log only truly unexpected errors, not handled HTTP-level errors
  const isHandledError = err.isOperational || err.status || err.statusCode || err.name === 'ZodError';
  if (!isHandledError) {
    console.error('UNEXPECTED ERROR:', err);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE' || err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'Request entity too large.' },
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Invalid JSON in request body.' },
    });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data.',
        details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      },
    });
  }

  // Never expose stack traces
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
});

// ============================================
// STARTUP REPORT
// ============================================
const server = app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║     ✦ OMNIAI — Launch Candidate      ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log(`  Server:    http://localhost:${PORT}`);
  console.log(`  Health:    http://localhost:${PORT}/health`);
  console.log(`  Version:   2.1.0`);
  console.log(`  Node:      ${process.version}`);
  console.log(`  Env:       ${process.env.NODE_ENV || 'development'}`);
  console.log('');

  // Report configured integrations
  const integrations = [
    ['AI Provider', envCheck.ai.configured.length > 0 ? 'CONFIGURED' : 'NOT CONFIGURED'],
    ['Payments', envCheck.payments.configured.length > 0 ? 'CONFIGURED' : 'NOT CONFIGURED'],
    ['Email', envCheck.email.configured.length > 0 ? 'CONFIGURED' : 'NOT CONFIGURED'],
    ['Google OAuth', envCheck.oauth.configured.length > 0 ? 'CONFIGURED' : 'NOT CONFIGURED'],
  ];

  const maxLabel = Math.max(...integrations.map(i => i[0].length));
  integrations.forEach(([label, status]) => {
    const icon = status === 'CONFIGURED' ? '✓' : '○';
    console.log(`  ${icon}  ${label.padEnd(maxLabel)}  ${status}`);
  });

  if (process.env.AI_KILL_SWITCH === 'true') {
    console.log('');
    console.log('  ⚠️  AI KILL SWITCH IS ACTIVE (AI_KILL_SWITCH=true)');
  }

  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received — shutting down...');
  server.close(() => process.exit(0));
});

module.exports = app;