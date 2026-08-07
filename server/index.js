import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';
import { validateEnvironment } from './middleware/validate.js';
import { globalRateLimit } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import aiRoutes from './routes/ai.js';
import fileRoutes from './routes/files.js';
import productivityRoutes from './routes/productivity.js';
import learningRoutes from './routes/learning.js';
import businessRoutes from './routes/business.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = config.port;

// ── Validate environment on startup ──
const missingVars = validateEnvironment();

// ── Global error log (for admin dashboard, bounded) ──
global.__errorLog = [];
global.__requestLog = [];

// ── Security Middleware ──
app.use(helmet({
  contentSecurityPolicy: false, // SPA needs inline scripts
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Global Rate Limiter ──
app.use(globalRateLimit);

// ── Request logging & observability ──
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      time: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.userId || 'anonymous',
      ip: req.ip,
    };

    // Log slow requests (> 5s)
    if (duration > 5000) {
      console.warn(`SLOW: ${req.method} ${req.path} (${duration}ms)`);
    }

    // Log errors
    if (res.statusCode >= 500) {
      console.error(`ERROR: ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
    }

    // Store for admin dashboard (keep last 500)
    global.__requestLog.push(logEntry);
    if (global.__requestLog.length > 500) global.__requestLog.shift();
  });
  next();
});

// ── API Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/files', fileRoutes);
app.use('/api', productivityRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/admin', adminRoutes);

// ── Health check ──
app.get('/api/health', (req, res) => {
  const healthy = {
    status: 'ok',
    version: '2.1.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    services: {
      server: true,
      ai: !!config.openai.apiKey,
      database: !!config.supabase.url && !!config.supabase.serviceKey,
      auth: !!config.jwt.secret,
    },
    configuration: {
      jwtConfigured: config.jwt.secret.length >= 32,
      envVarsMissing: missingVars.length === 0,
      rateLimits: {
        free: `${config.rateLimit.freeMax}/min`,
        premium: `${config.rateLimit.premiumMax}/min`,
      },
    },
  };
  res.json(healthy);
});

// ── Serve frontend in production ──
const publicPath = path.join(__dirname, '..', 'public');

// In development, don't serve frontend (use dev server)
if (config.nodeEnv !== 'development' || process.env.SERVE_FRONTEND) {
  app.use(express.static(publicPath, {
    maxAge: config.nodeEnv === 'production' ? '1d' : 0,
    etag: true,
    lastModified: true,
  }));

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'API route not found' },
      });
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// ── Global error handler (never expose internals to users) ──
app.use((err, req, res, _next) => {
  // Log error internally
  console.error('Unhandled error:', err.message);
  const errorEntry = {
    time: new Date().toISOString(),
    path: req.path,
    method: req.method,
    message: err.message,
    userId: req.userId || 'anonymous',
  };
  global.__errorLog.push(errorEntry);
  if (global.__errorLog.length > 100) global.__errorLog.shift();

  // Safe user-facing response
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: statusCode === 500
        ? 'An unexpected error occurred. Please try again later.'
        : err.message,
    },
  });
});

// ── Start ──
export function startServer() {
  app.listen(PORT, () => {
    console.log(`\n  ✦ OmniAI Server v2.1`);
    console.log(`  ─────────────────────────────`);
    console.log(`  API:    http://localhost:${PORT}/api`);
    console.log(`  Front:  http://localhost:${PORT}`);
    console.log(`  Env:    ${config.nodeEnv}`);
    console.log(`  AI:     ${config.openai.apiKey ? '✓ Connected' : '✗ Not configured'}`);
    console.log(`  DB:     ${config.supabase.url ? '✓ Connected' : '✗ Not configured'}`);
    console.log(`  JWT:    ${config.jwt.secret.length >= 32 ? '✓ Secure' : config.jwt.secret ? '⚠ Weak' : '✗ Not configured'}`);
    console.log(`\n  Environment validation: ${missingVars.length === 0 ? '✓ All passed' : `⚠ ${missingVars.length} warnings`}\n`);
  });
}

// Auto-start when run directly
startServer();

export default app;