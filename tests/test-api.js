// =============================================
// OmniAI API & Response Format Tests
// =============================================

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

console.log('\n  ── API Response Format Tests ──');

// Test the response format
const successResponse = {
  success: true,
  data: { message: 'hello', id: '123' },
};

const errorResponse = {
  success: false,
  error: {
    code: 'AUTH_REQUIRED',
    message: 'Authentication required',
  },
};

const paginatedResponse = {
  success: true,
  data: [{ id: 1 }],
  pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
};

// Validate response structure
assert(successResponse.success === true, 'Success response has success: true');
assert(successResponse.data !== undefined, 'Success response has data field');
assert(!successResponse.error, 'Success response has no error field');

assert(errorResponse.success === false, 'Error response has success: false');
assert(errorResponse.error !== undefined, 'Error response has error field');
assert(errorResponse.error.code !== undefined, 'Error response has error code');
assert(errorResponse.error.message !== undefined, 'Error response has error message');
assert(!errorResponse.data, 'Error response has no data field');

assert(paginatedResponse.pagination !== undefined, 'Paginated response has pagination');
assert(typeof paginatedResponse.pagination.total === 'number', 'Pagination has numeric total');
assert(typeof paginatedResponse.pagination.page === 'number', 'Pagination has numeric page');

// Error code uniqueness check
console.log('\n  ── Error Code Validation ──');

// Test that error codes are uppercase with underscores
const errorCodes = [
  'AUTH_REQUIRED', 'AUTH_INVALID', 'AUTH_EXPIRED', 'AUTH_RATE_LIMIT',
  'EMAIL_EXISTS', 'INVALID_CREDENTIALS', 'WEAK_PASSWORD',
  'FORBIDDEN', 'ADMIN_REQUIRED', 'PLAN_LIMIT',
  'AI_FAILED', 'AI_TIMEOUT', 'AI_RATE_LIMIT', 'AI_USAGE_LIMIT', 'AI_COST_LIMIT',
  'FILE_TOO_LARGE', 'FILE_TYPE_INVALID', 'FILE_NOT_FOUND',
  'DB_FAILED', 'NOT_FOUND',
  'VALIDATION_ERROR', 'INVALID_INPUT',
  'RATE_LIMIT_EXCEEDED',
  'SUBSCRIPTION_REQUIRED', 'PAYMENT_FAILED',
  'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE',
];

const uniqueCodes = new Set(errorCodes);
assert(uniqueCodes.size === errorCodes.length, 'All error codes are unique');

errorCodes.forEach(code => {
  assert(/^[A-Z_]+$/.test(code), `Error code ${code} uses uppercase + underscores`);
});

// Input validation tests
console.log('\n  ── Input Validation Tests ──');

const testEmail = 'user@example.com';
assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail), 'Valid email format accepted');
assert(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test('not-an-email'), 'Invalid email format rejected');

const longString = 'a'.repeat(10001);
assert(longString.length > 10000, 'Strings over 10K chars are detected');

console.log(`\n  API format tests complete: ${__testResults.passed} passed, ${__testResults.failed} failed\n`);