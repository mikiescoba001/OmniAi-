// =============================================
// OmniAI Environment Validation
// Fails loudly when production requirements are missing
// =============================================

import config from '../config.js';

const PRODUCTION_REQUIRED = {
  JWT_SECRET: () => config.jwt.secret && config.jwt.secret.length >= 32,
  SUPABASE_URL: () => !!config.supabase.url,
  SUPABASE_SERVICE_KEY: () => !!config.supabase.serviceKey,
  OPENAI_API_KEY: () => !!config.openai.apiKey,
};

const DEVELOPMENT_REQUIRED = {
  JWT_SECRET: () => config.jwt.secret && config.jwt.secret.length >= 16,
};

export function validateEnvironment() {
  const isProduction = config.nodeEnv === 'production';
  const required = isProduction ? PRODUCTION_REQUIRED : DEVELOPMENT_REQUIRED;
  const missing = [];

  for (const [key, check] of Object.entries(required)) {
    if (!check()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const level = isProduction ? 'CRITICAL' : 'WARNING';
    const message = isProduction
      ? `${level}: Missing required environment variables: ${missing.join(', ')}. Server will not start.`
      : `${level}: Missing recommended environment variables: ${missing.join(', ')}. Some features will not work.`;

    console.error(`\n  ╔══════════════════════════════════════════════╗`);
    console.error(`  ║  ${level}                                  ║`);
    console.error(`  ║  ${message.padEnd(42)}  ║`);
    console.error(`  ╚══════════════════════════════════════════════╝\n`);

    if (isProduction) {
      process.exit(1);
    }
  }

  return missing;
}

/**
 * Middleware to check if a service is configured
 */
export function requireService(serviceName) {
  return (req, res, next) => {
    const configs = {
      openai: !!config.openai.apiKey,
      supabase: !!config.supabase.url && !!config.supabase.serviceKey,
    };

    if (!configs[serviceName]) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `${serviceName} service is not configured. Please contact the administrator.`,
        },
      });
    }
    next();
  };
}