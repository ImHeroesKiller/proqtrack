import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0006_unified_auth_tenant_security.sql', import.meta.url), 'utf8');
const authz = readFileSync(new URL('../worker/authz.js', import.meta.url), 'utf8');
const gateway = readFileSync(new URL('../worker/main.js', import.meta.url), 'utf8');
const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('M2 persists revocable server sessions in D1', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS\s+core_auth_sessions/i);
  assert.match(migration, /\buser_id\b/i);
  assert.match(migration, /\borganization_id\b/i);
  assert.match(migration, /\bexpires_at\b/i);
  assert.match(migration, /CHECK\s*\(status IN \('active','revoked','expired'\)\)/i);
});

test('M2 bootstraps the canonical existing tenant without copying legacy project/client claim JSON', () => {
  assert.match(migration, /'ORG-DEFAULT'/);
  assert.match(migration, /INSERT OR IGNORE INTO core_organization_users/i);
  assert.doesNotMatch(migration, /project_ids/i);
  assert.doesNotMatch(migration, /client_ids/i);
});

test('authorization resolver reads normalized membership and project tables', () => {
  assert.match(authz, /FROM core_organization_users/i);
  assert.match(authz, /FROM core_project_memberships/i);
  assert.match(authz, /JOIN core_projects/i);
  assert.match(authz, /FROM core_auth_sessions/i);
  assert.doesNotMatch(authz, /user\.project_ids/i);
  assert.doesNotMatch(authz, /user\.client_ids/i);
});

test('every protected API request is gated before reaching the legacy worker', () => {
  assert.match(gateway, /authenticateAuthoritatively\(request, env\)/);
  assert.match(gateway, /forwardWithAuthoritativeClaims/);
  assert.match(gateway, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(gateway, /authErrorResponse/);
});

test('all Cloudflare environments use the M2 gateway and bounded session TTL', () => {
  assert.equal(wrangler.main, 'worker/main.js');
  for (const vars of [wrangler.vars, wrangler.env.development.vars, wrangler.env.staging.vars, wrangler.env.production.vars]) {
    assert.equal(vars.API_AUTH_REQUIRED, 'true');
    assert.equal(vars.API_SESSION_TTL_SECONDS, '28800');
    assert.equal(vars.MVP_DATA_API_ENABLED, 'false');
    assert.equal(vars.MVP_FILE_API_ENABLED, 'false');
  }
});
