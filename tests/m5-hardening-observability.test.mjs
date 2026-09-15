import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyRoute, __test as hardeningTest } from '../worker/hardening.js';
import { __test as maintenanceTest } from '../worker/maintenance.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('route classification is bounded and low-cardinality', () => {
  assert.equal(classifyRoute('/api/health'), 'health');
  assert.equal(classifyRoute('/api/auth/login'), 'auth');
  assert.equal(classifyRoute('/api/core/sync'), 'core');
  assert.equal(classifyRoute('/api/evidence/EV-1'), 'evidence');
  assert.equal(classifyRoute('/api/monitoring/summary'), 'monitoring');
  assert.equal(classifyRoute('/api/report-jobs'), 'legacy_api');
  assert.equal(classifyRoute('/src/app.js'), 'asset');
});

test('hardening numeric clamps reject unsafe extremes', () => {
  assert.equal(hardeningTest.clampInt('10', 120, 1, 100), 10);
  assert.equal(hardeningTest.clampInt('-2', 120, 1, 100), 1);
  assert.equal(hardeningTest.clampInt('999', 120, 1, 100), 100);
  assert.equal(maintenanceTest.clampDays('14', 7, 1, 90), 14);
  assert.equal(maintenanceTest.clampDays('500', 7, 1, 90), 90);
});

test('M5 migration adds distributed limit metrics and maintenance tables', async () => {
  const sql = await read('migrations/0009_production_hardening_observability.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_rate_limit_buckets/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_observability_minute/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_maintenance_runs/i);
  assert.match(sql, /PRIMARY KEY\(bucket_minute, route_group, method, status_class\)/i);
});

test('gateway hardening uses D1 distributed rate limiting and hashed subjects', async () => {
  const source = await read('worker/hardening.js');
  assert.match(source, /core_rate_limit_buckets/);
  assert.match(source, /ON CONFLICT\(bucket_key\) DO UPDATE/);
  assert.match(source, /sha256Hex\(rawSubject\)/);
  assert.doesNotMatch(source, /new Map\(/);
  assert.match(source, /x-ratelimit-reset/);
  assert.match(source, /security_audit_logs/);
});

test('gateway applies security headers and records minute telemetry', async () => {
  const source = await read('worker/hardening.js');
  assert.match(source, /strict-transport-security/);
  assert.match(source, /headers\.set\('content-security-policy'/);
  assert.doesNotMatch(source, /headers\.set\('content-security-policy-report-only'/);
  assert.match(source, /permissions-policy/);
  assert.match(source, /core_observability_minute/);
  assert.match(source, /event: 'http_request'/);
  assert.match(source, /monitoringSummary/);
  assert.match(source, /milestone: 'M5'/);
});

test('main gateway enforces M5 controls before operational dispatch', async () => {
  const source = await read('worker/main.js');
  const loginLimit = source.indexOf("scope: 'auth_login'");
  const authDispatch = source.indexOf('handleAuthRoute(request');
  const authoritativeAuth = source.indexOf('authenticateAuthoritatively(request');
  const apiLimit = source.indexOf('limit: apiLimitFor(url, request, env)');
  const operational = source.indexOf('handleOperationalGateway(request');
  assert.ok(loginLimit >= 0 && authDispatch > loginLimit);
  assert.ok(authoritativeAuth >= 0 && apiLimit > authoritativeAuth && operational > apiLimit);
  assert.match(source, /finalizeResponse/);
  assert.match(source, /runProductionMaintenance/);
});

test('scheduled maintenance expires sessions and cleans transient operational state', async () => {
  const source = await read('worker/maintenance.js');
  assert.match(source, /SET status='expired'/);
  assert.match(source, /datetime\(expires_at\)/);
  assert.match(source, /DELETE FROM core_rate_limit_buckets/);
  assert.match(source, /DELETE FROM core_observability_minute/);
  assert.match(source, /storage_status='uploading'/);
  assert.match(source, /env\.FILES\.delete/);
  assert.match(source, /core_maintenance_runs/);
});

test('wrangler enables cron and explicit M5 production limits', async () => {
  const config = await read('wrangler.jsonc');
  assert.match(config, /"crons": \["\*\/15 \* \* \* \*"\]/);
  assert.match(config, /"API_SYNC_RATE_LIMIT_PER_MINUTE": "60"/);
  assert.match(config, /"API_EVIDENCE_RATE_LIMIT_PER_MINUTE": "30"/);
  assert.match(config, /"OBSERVABILITY_RETENTION_DAYS": "14"/);
  assert.match(config, /"CORE_EVIDENCE_API_ENABLED": "true"/);
  assert.match(config, /"MVP_FILE_API_ENABLED": "false"/);
});

test('static asset build includes Cloudflare security header rules', async () => {
  const [build, headers] = await Promise.all([read('scripts/build.mjs'), read('_headers')]);
  assert.match(build, /"_headers"/);
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /Content-Security-Policy:/);
  assert.doesNotMatch(headers, /Content-Security-Policy-Report-Only:/);
  assert.match(headers, /Strict-Transport-Security:/);
});

test('CI and deploy workflows enforce audit recovery migration order and smoke checks', async () => {
  const [ci, deploy, recovery] = await Promise.all([
    read('.github/workflows/ci.yml'),
    read('.github/workflows/cloudflare-mvp.yml'),
    read('.github/workflows/d1-backup.yml'),
  ]);
  assert.match(ci, /npm audit --audit-level=critical/);
  const recoveryIndex = deploy.indexOf('Record pre-deploy D1 Time Travel bookmark');
  const migrateIndex = deploy.indexOf('Apply D1 migrations before deploy');
  const workerIndex = deploy.indexOf('Deploy Worker after migration');
  assert.ok(recoveryIndex >= 0 && migrateIndex > recoveryIndex && workerIndex > migrateIndex);
  assert.match(deploy, /d1 time-travel info proqtrack-mvp --json/);
  assert.doesNotMatch(deploy, /d1 export proqtrack-mvp/);
  assert.match(deploy, /hardeningSchema/);
  assert.match(deploy, /Unauthenticated evidence endpoint/);
  assert.match(deploy, /\^content-security-policy:/);
  assert.match(deploy, /content-security-policy-report-only/);
  assert.match(recovery, /cron: '17 2 \* \* \*'/);
  assert.match(recovery, /d1 time-travel info proqtrack-mvp --json/);
  assert.doesNotMatch(recovery, /d1 export proqtrack-mvp/);
  assert.match(recovery, /retention-days: 30/);
});
