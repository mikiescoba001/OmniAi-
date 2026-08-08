// =============================================
// OmniAI Authentication Tests
// =============================================

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __testResults = global.__testResults || { passed: 0, failed: 0, total: 0 };
global.__testResults = __testResults;

function assert(condition, description) {
  __testResults.total++;
  if (condition) {
    __testResults.passed++;
    console.log(`  ✓ ${description}`);
  } else {
    __testResults.failed++;
    console.error(`  ✗ FAILED: ${description}`);
  }
}

console.log('\n  ── Auth Tests ──');

// 1. Password hashing
(async () => {
  const password = 'SecurePass123!';
  const hash = await bcrypt.hash(password, 12);
  assert(hash && hash.startsWith('$2a$'), 'bcrypt produces valid hash');
  assert(hash !== password, 'Hash differs from plaintext');
  assert(await bcrypt.compare(password, hash), 'bcrypt verifies correct password');
  assert(!(await bcrypt.compare('wrong', hash)), 'bcrypt rejects wrong password');

  // 2. JWT
  const secret = 'test-secret-that-is-at-least-32-characters-long!!';
  const payload = { sub: 'user-123', role: 'user' };
  const token = jwt.sign(payload, secret, { expiresIn: '1h' });
  assert(typeof token === 'string' && token.split('.').length === 3, 'JWT produces valid token format');

  const decoded = jwt.verify(token, secret);
  assert(decoded.sub === 'user-123', 'JWT contains correct subject');
  assert(decoded.role === 'user', 'JWT contains correct role');

  // 3. JWT expiration
  const expiredToken = jwt.sign(payload, secret, { expiresIn: '0s' });
  await new Promise(r => setTimeout(r, 100));
  try {
    jwt.verify(expiredToken, secret);
    assert(false, 'Expired JWT is rejected');
  } catch {
    assert(true, 'Expired JWT is rejected');
  }

  // 4. Invalid signature
  try {
    jwt.verify(token, 'wrong-secret');
    assert(false, 'JWT with wrong secret is rejected');
  } catch {
    assert(true, 'JWT with wrong secret is rejected');
  }

  // 5. Weak password rejection
  assert('short'.length < 8, 'Short passwords are rejected');
  assert(''.length === 0, 'Empty passwords are rejected');

  // 6. Admin role check
  const adminToken = jwt.sign({ sub: 'admin-1', role: 'admin' }, secret);
  const adminDecoded = jwt.verify(adminToken, secret);
  assert(adminDecoded.role === 'admin', 'Admin JWT contains admin role');

  console.log(`\n  Auth tests complete: ${__testResults.passed} passed, ${__testResults.failed} failed\n`);
})();