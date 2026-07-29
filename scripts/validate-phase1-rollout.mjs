import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const add = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });

const configText = read('wrangler.jsonc');
const config = JSON.parse(configText.replace(/^\s*\/\/.*$/gm, ''));
const frontend = read('src/phase1-frontend-read.js');
const workerApp = read('worker/app.js');
const identityRead = read('worker/identity-read.js');
const worker = `${workerApp}\n${identityRead}`;
const migration = read('migrations/0003_identity_organization.sql');

add('Worker entrypoint', config.main === 'worker/app.js', `main=${config.main}`);
add('D1 binding', config.d1_databases?.some(item => item.binding === 'DB'), 'binding DB required');
add('R2 binding', config.r2_buckets?.some(item => item.binding === 'FILES'), 'binding FILES required');
add('Production data API remains locked', config.vars?.MVP_DATA_API_ENABLED === 'false', `MVP_DATA_API_ENABLED=${config.vars?.MVP_DATA_API_ENABLED}`);
add('Backend auth remains required', config.vars?.API_AUTH_REQUIRED === 'true', `API_AUTH_REQUIRED=${config.vars?.API_AUTH_REQUIRED}`);
add('SPA API worker routing', Array.isArray(config.assets?.run_worker_first) && config.assets.run_worker_first.includes('/api/*'), 'run_worker_first includes /api/*');
add('Frontend is read-only', !/method\s*:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i.test(frontend), 'no write HTTP methods in phase 1 frontend');
add('No global MutationObserver', !/MutationObserver/.test(frontend), 'explicit router hooks only');
add('Bounded API requests', /AbortController/.test(frontend), 'request timeout guard present');
add('Identity API routes present', /['"]\/api\/identity\/employees['"]/.test(identityRead) && /['"]\/api\/identity\/accounts['"]/.test(identityRead), 'employee and account endpoints');
add('Write methods blocked', /request\.method\s*!==\s*['"]GET['"]/.test(identityRead) && /READ_ONLY_ENDPOINT/.test(identityRead) && /405/.test(identityRead), 'read-only endpoint guard');
add('Identity migration present', /CREATE TABLE IF NOT EXISTS employees/i.test(migration) && /CREATE TABLE IF NOT EXISTS accounts/i.test(migration), 'employees/accounts schema');

const failed = checks.filter(check => !check.pass);
console.log('\nPhase 1 remote rollout readiness\n');
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.name} — ${check.detail}`);
}
console.log(`\nResult: ${checks.length - failed.length}/${checks.length} checks passed.`);

if (failed.length) {
  console.error('\nRemote rollout is BLOCKED. No remote command was executed.');
  process.exitCode = 1;
} else {
  console.log('\nRemote rollout configuration is READY FOR REVIEW.');
  console.log('No migration, D1 write, or deployment was executed by this validator.');
}
