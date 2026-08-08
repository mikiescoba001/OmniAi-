/* ============================================
   OmniAI — Authentication Tests
   ============================================ */
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createClient } = require('@supabase/supabase-js');

// NOTE: These tests require a running server and Supabase connection.
// They are designed as integration tests against a real backend.

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';

async function api(method, path, body = null, token = null) {
  const url = new URL(path, BASE_URL);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(url, { method, headers }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Generate unique test email
const TEST_EMAIL = `test-${Date.now()}@omniai-test.com`;
const TEST_PASSWORD = 'TestPassword123!';
const TEST_NAME = 'Test User';
let testToken = null;
let testUserId = null;

describe('Authentication', () => {
  it('POST /api/auth/register — should create a new user', async () => {
    const res = await api('POST', '/api/auth/register', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: TEST_NAME,
    });

    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.data.user);
    assert.ok(res.data.data.user.id);
    assert.strictEqual(res.data.data.user.email, TEST_EMAIL);
    assert.ok(res.data.data.accessToken);
    testToken = res.data.data.accessToken;
    testUserId = res.data.data.user.id;
  });

  it('POST /api/auth/login — should authenticate existing user', async () => {
    const res = await api('POST', '/api/auth/login', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.data.accessToken);
    assert.strictEqual(res.data.data.user.email, TEST_EMAIL);
    testToken = res.data.data.accessToken;
  });

  it('POST /api/auth/login — should reject invalid password', async () => {
    const res = await api('POST', '/api/auth/login', {
      email: TEST_EMAIL,
      password: 'wrongpassword',
    });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.success, false);
  });

  it('GET /api/auth/me — should return authenticated user', async () => {
    const res = await api('GET', '/api/auth/me', null, testToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.email, TEST_EMAIL);
    assert.ok(res.data.data.subscription);
  });

  it('GET /api/auth/me — should reject without token', async () => {
    const res = await api('GET', '/api/auth/me');

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.success, false);
  });

  it('POST /api/auth/register — should reject duplicate email', async () => {
    const res = await api('POST', '/api/auth/register', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: TEST_NAME,
    });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.data.success, false);
  });
});

describe('Protected Routes', () => {
  it('GET /api/ai/usage — should require authentication', async () => {
    const res = await api('GET', '/api/ai/usage');
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/ai/usage — should work with valid token', async () => {
    const res = await api('GET', '/api/ai/usage', null, testToken);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.data.usage);
  });
});

describe('Health Check', () => {
  it('GET /health — should return healthy status', async () => {
    const res = await api('GET', '/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.status, 'healthy');
  });
});

// Cleanup — run after tests
after(async () => {
  if (testToken) {
    try {
      await api('POST', '/api/auth/logout', {}, testToken);
    } catch { /* ignore */ }
  }
});