// =============================================
// OmniAI Production Test Suite
// =============================================

import './test-auth.js';
import './test-api.js';
import './test-database.js';

console.log('\n  ✦ OmniAI Test Suite');
console.log('  ─────────────────────────────\n');

// Run all tests and collect results
const results = global.__testResults || { passed: 0, failed: 0, total: 0 };

console.log(`\n  Results: ${results.passed} passed, ${results.failed} failed, ${results.total} total\n`);

if (results.failed > 0) {
  console.error('  ❌ Some tests failed. Review output above.');
  process.exit(1);
} else {
  console.log('  ✅ All tests passed!\n');
}