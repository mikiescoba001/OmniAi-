import rateLimit from 'express-rate-limit';
import config from '../config.js';

export const globalRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

export function aiRateLimit(req, res, next) {
  const isPremium = req.user?.plan === 'premium';
  const max = isPremium ? config.rateLimit.premiumMax : config.rateLimit.freeMax;

  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max,
    message: {
      error: `Rate limit exceeded. Free: ${config.rateLimit.freeMax}/min, Premium: ${config.rateLimit.premiumMax}/min`,
      remaining: 0,
      limit: max,
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (r) => r.userId || r.ip,
  });

  return limiter(req, res, next);
}

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});