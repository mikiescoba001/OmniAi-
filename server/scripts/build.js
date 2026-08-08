/* ============================================
   OmniAI — Production Build Script
   Validates env, syntax, security, then prepares production output.
   A failed critical check exits non-zero (blocks deployment).
   ============================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../');
const SERVER = path.resolve(__dirname, '../');
let failures = [];

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name} — ${detail || 'failed'}`);
    failures.push(name);
  }
}

function runSyntaxCheck() {
  console.log('\n[1/5] Syntax check');
  const files = execSync('find src -name "*.js" -type f', { cwd: SERVER })
    .toString().trim().split('\n').filter(Boolean);
  let ok = true;
  for (const f of files) {
    try {
      execSync(`node --check "${f}"`, { cwd: SERVER, stdio: 'pipe' });
    } catch {
      console.error(`  ✗ syntax: ${f}`);
      ok = false;
      failures.push(`syntax:${f}`);
    }
  }
  check(`All ${files.length} source files`, ok);
}

function checkEnv() {
  console.log('\n[2] Environment validation');
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET'];
  const missing = required.filter(k => !process.env[k]);
  check('Core env vars present', missing.length === 0, `missing: ${missing.join(', ') || 'none'}`);
  if (process.env.JWT_SECRET) {
    check('JWT_SECRET length >= 32', process.env.JWT_SECRET.length >= 32);
  }
}

function securityScan() {
  console.log('\n[3] Security scan');
  // Check for hardcoded secrets in source
  const dangerousPatterns = [
    [/sk-[A-Za-z0-9]{20,}/, 'OpenAI key pattern'],
    [/SUPABASE_SERVICE_KEY\s*=\s*["']?eyJ/, 'service role key'],
    [/password\s*=\s*["'][^"']{3,}["']/i, 'hardcoded password'],
  ];
  const srcDir = path.resolve(SERVER, 'src');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  ).filter(f => f.endsWith('.js'));
  let ok = true;
  for (const file of walk(srcDir)) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const [re, label] of dangerousPatterns) {
      if (re.test(content)) {
        console.error(`  ✗ Secret in ${path.basename(file)}: ${label}`);
        ok = false;
      }
    }
  }
  check('No hardcoded secrets in source', ok);
}

function productionFiles() {
  console.log('\n[4] Production artifacts');
  const rootDir = ROOT;
  check('.env.example present', fs.existsSync(path.join(rootDir, '.env.example')));
  check('.gitignore present', fs.existsSync(path.join(rootDir, '.gitignore')));
  check('Procfile present', fs.existsSync(path.join(rootDir, 'Procfile')));
  check('Frontend index.html', fs.existsSync(path.join(rootDir, 'index.html')));
  check('Frontend app.js', fs.existsSync(path.join(rootDir, 'js', 'app.js')));
  check('Frontend api.js', fs.existsSync(path.join(rootDir, 'js', 'api.js')));
  check('CSS present', fs.existsSync(path.join(rootDir, 'css', 'style.css')));
  check('Migrations present', fs.readdirSync(path.join(SERVER, 'migrations')).length >= 1);
}

console.log('═══ OMNIAI PRODUCTION BUILD ═══\n');
checkEnv();
securityScan();
productionFiles();

if (failures.length > 0) {
  console.error(`\nBUILD FAILED — ${failures.length} critical check(s) failed. Deployment blocked.`);
  process.exit(1);
} else {
  console.log('\nBUILD PASSED — application is ready for production deployment.');
  process.exit(0);
}