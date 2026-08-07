/* ============================================
   OmniAI — Usage Limit Tests
   ============================================ */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

// Unit tests for the usage middleware logic
const { DAILY_LIMITS } = require('../src/middleware/usage');

describe('Usage Limits Configuration', () => {
  it('should define limits for free plan', () => {
    assert.ok(DAILY_LIMITS.free);
    assert.ok(DAILY_LIMITS.free.ai_chat > 0);
    assert.strictEqual(DAILY_LIMITS.free.ai_image, 3);
  });

  it('should define limits for premium plans', () => {
    assert.ok(DAILY_LIMITS.premium_monthly);
    assert.ok(DAILY_LIMITS.premium_annual);

    // Premium should have higher limits than free
    assert.ok(DAILY_LIMITS.premium_monthly.ai_chat > DAILY_LIMITS.free.ai_chat);
    assert.ok(DAILY_LIMITS.premium_monthly.ai_image > DAILY_LIMITS.free.ai_image);
  });

  it('should have document upload limits', () => {
    assert.ok(DAILY_LIMITS.free.document_upload > 0);
    assert.ok(DAILY_LIMITS.premium_monthly.document_upload > DAILY_LIMITS.free.document_upload);
  });

  it('should have all required action types', () => {
    const required = ['ai_chat', 'ai_writing', 'ai_image', 'ai_video', 'document_upload'];
    required.forEach(action => {
      assert.ok(DAILY_LIMITS.free[action] !== undefined, `Missing free limit for ${action}`);
      assert.ok(DAILY_LIMITS.premium_monthly[action] !== undefined, `Missing premium limit for ${action}`);
    });
  });
});

describe('Validation Schemas', () => {
  const { registerSchema, loginSchema, chatSchema, writingSchema } = require('../src/utils/validators');

  it('registerSchema — should reject short passwords', () => {
    const result = registerSchema.safeParse({ email: 'test@test.com', password: '123', name: 'Test' });
    assert.strictEqual(result.success, false);
  });

  it('registerSchema — should reject invalid emails', () => {
    const result = registerSchema.safeParse({ email: 'notanemail', password: 'ValidPass123!', name: 'Test' });
    assert.strictEqual(result.success, false);
  });

  it('registerSchema — should accept valid input', () => {
    const result = registerSchema.safeParse({ email: 'test@test.com', password: 'ValidPass123!', name: 'Test' });
    assert.strictEqual(result.success, true);
  });

  it('chatSchema — should reject empty messages', () => {
    const result = chatSchema.safeParse({ message: '' });
    assert.strictEqual(result.success, false);
  });

  it('chatSchema — should accept valid messages', () => {
    const result = chatSchema.safeParse({ message: 'Hello, AI!' });
    assert.strictEqual(result.success, true);
  });

  it('writingSchema — should accept valid input', () => {
    const result = writingSchema.safeParse({
      prompt: 'Write an email',
      type: 'email',
      tone: 'professional',
      length: 'medium',
    });
    assert.strictEqual(result.success, true);
  });

  it('writingSchema — should reject invalid tone', () => {
    const result = writingSchema.safeParse({
      prompt: 'Write',
      type: 'email',
      tone: 'nonexistent',
    });
    assert.strictEqual(result.success, false);
  });
});

describe('Error Handling', () => {
  const { AppError, AuthError, ForbiddenError, NotFoundError, UsageLimitError } = require('../src/utils/errors');

  it('AppError should have correct properties', () => {
    const err = new AppError('Test error', 400, 'TEST_CODE');
    assert.strictEqual(err.message, 'Test error');
    assert.strictEqual(err.statusCode, 400);
    assert.strictEqual(err.code, 'TEST_CODE');
    assert.strictEqual(err.isOperational, true);
  });

  it('AuthError should default to 401', () => {
    const err = new AuthError();
    assert.strictEqual(err.statusCode, 401);
    assert.strictEqual(err.code, 'AUTH_REQUIRED');
  });

  it('ForbiddenError should default to 403', () => {
    const err = new ForbiddenError();
    assert.strictEqual(err.statusCode, 403);
    assert.strictEqual(err.code, 'FORBIDDEN');
  });

  it('NotFoundError should default to 404', () => {
    const err = new NotFoundError();
    assert.strictEqual(err.statusCode, 404);
    assert.strictEqual(err.code, 'NOT_FOUND');
  });

  it('UsageLimitError should default to 429', () => {
    const err = new UsageLimitError();
    assert.strictEqual(err.statusCode, 429);
    assert.strictEqual(err.code, 'USAGE_LIMIT_REACHED');
  });
});