/* ============================================
   OmniAI — Production Verify Script
   Live smoke test against a running server.
   ============================================ */
'use strict';

const http = require('http');
const BASE = process.env.TEST_URL || 'http://localhost:3001';

function req(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { 'Content-Type': 'application/json' };
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(url, { method, headers }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function rawBody(path, raw) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE);
    const r = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    r.on('error', () => resolve({ status: 0, body: '' }));
    r.write(raw); r.end();
  });
}

(async () => {
  let pass = 0, fail = 0;
  const results = [];
  function test(name, cond, detail) {
    if (cond) { pass++; results.push(`  ✓ ${name}`); }
    else { fail++; results.push(`  ✗ ${name} — ${detail || ''}`); }
  }

  // 1. Health endpoint
  const health = await req('GET', '/health');
  test('Health endpoint responds', [200, 503].includes(health.status), `status ${health.status}`);

  // 2-3. Frontend + assets
  const home = await req('GET', '/');
  test('Frontend index.html loads', home.status === 200 && home.body.includes('OmniAI'), `status ${home.status}`);
  const css = await req('GET', '/css/style.css');
  test('CSS loads', css.status === 200);
  const appJs = await req('GET', '/js/app.js');
  test('app.js loads', appJs.status === 200);
  const apiJs = await req('GET', '/js/api.js');
  test('api.js loads', apiJs.status === 200);

  // 4-5. Auth protection
  const unauth = await req('GET', '/api/auth/me');
  test('Protected endpoint rejects unauthenticated', unauth.status === 401, `status ${unauth.status}`);

  // 6. Validation error → 400
  const badReg = await req('POST', '/api/auth/register', { email: 'bad', password: 'x' });
  test('Validation returns 400', badReg.status === 400, `status ${badReg.status}`);

  // 7. 404 for unknown API route
  const nf = await req('GET', '/api/nonexistent');
  test('Unknown API route → 404', nf.status === 404, `status ${nf.status}`);

  // 8. Malformed JSON → 400
  const raw = await rawBody('/api/auth/login', '{invalid');
  test('Malformed JSON → 400', raw.status === 400, `status ${raw.status}`);

  // 9. Admin route protected
  const adminNoAuth = await req('GET', '/api/admin/dashboard');
  test('Admin route protected', adminNoAuth.status === 401, `status ${adminNoAuth.status}`);

  // 10. Beta status endpoint
  const betaStatus = await req('GET', '/api/beta/status');
  test('Beta status endpoint responds', [200, 401].includes(betaStatus.status), `status ${betaStatus.status}`);

  console.log('\n═══ OMNIAI PRODUCTION SMOKE TEST ═══\n');
  results.forEach(r => console.log(r));
  console.log(`\nPassed: ${pass} | Failed: ${fail}`);
  console.log(fail === 0 ? '\nPRODUCTION SMOKE TEST: PASS' : '\nPRODUCTION SMOKE TEST: FAIL');
  process.exit(fail === 0 ? 0 : 1);
})().catch(err => {
  console.error('Smoke test crashed:', err.message);
  process.exit(1);
});