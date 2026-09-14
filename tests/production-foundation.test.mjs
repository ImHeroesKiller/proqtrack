import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0005_production_foundation.sql', import.meta.url), 'utf8');
const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

function tableBody(name) {
  const match = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${name}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'));
  assert.ok(match, `missing production table: ${name}`);
  return match[1];
}

test('production schema defines the normalized operational foundation', () => {
  const expected = [
    'organizations',
    'organization_users',
    'clients',
    'projects',
    'project_memberships',
    'employees',
    'employee_project_assignments',
    'outlets',
    'project_outlets',
    'visits',
    'attendance',
    'products',
    'product_sales',
    'survey_templates',
    'survey_questions',
    'survey_responses',
    'survey_answers',
    'field_evidence',
    'operational_audit_logs',
    'api_idempotency_keys',
    'legacy_import_batches'
  ];

  for (const table of expected) tableBody(table);
});

test('every tenant-owned production table carries organization_id', () => {
  const tenantTables = [
    'organization_users',
    'clients',
    'projects',
    'project_memberships',
    'employees',
    'employee_project_assignments',
    'outlets',
    'project_outlets',
    'visits',
    'attendance',
    'products',
    'product_sales',
    'survey_templates',
    'survey_questions',
    'survey_responses',
    'survey_answers',
    'field_evidence',
    'operational_audit_logs',
    'api_idempotency_keys',
    'legacy_import_batches'
  ];

  for (const table of tenantTables) {
    assert.match(tableBody(table), /\borganization_id\b/i, `${table} is missing organization_id`);
  }
});

test('cross-tenant relationships use organization-scoped foreign keys', () => {
  for (const table of ['projects', 'project_memberships', 'employee_project_assignments', 'visits', 'attendance', 'product_sales', 'survey_responses', 'field_evidence']) {
    assert.match(
      tableBody(table),
      /FOREIGN KEY\s*\([^)]*organization_id[^)]*\)[\s\S]*?REFERENCES\s+\w+\s*\([^)]*organization_id[^)]*\)/i,
      `${table} lacks an organization-scoped relationship`
    );
  }
});

test('foundation migration is additive to legacy auth and state tables', () => {
  assert.doesNotMatch(migration, /DROP\s+TABLE/i);
  assert.doesNotMatch(migration, /ALTER\s+TABLE\s+auth_users/i);
  assert.doesNotMatch(migration, /ALTER\s+TABLE\s+app_snapshots/i);
  assert.match(migration, /ALTER TABLE file_metadata ADD COLUMN organization_id TEXT/i);
  assert.match(migration, /ALTER TABLE security_audit_logs ADD COLUMN organization_id TEXT/i);
  assert.match(migration, /ALTER TABLE report_generation_jobs ADD COLUMN organization_id TEXT/i);
});

test('Cloudflare environments are isolated and production APIs stay locked', () => {
  const names = ['development', 'staging', 'production'];
  const dbNames = new Set();
  const bucketNames = new Set();

  for (const name of names) {
    const env = wrangler.env?.[name];
    assert.ok(env, `missing wrangler env: ${name}`);
    assert.equal(env.vars.ENVIRONMENT, name);
    assert.equal(env.vars.MVP_DATA_API_ENABLED, 'false');
    assert.equal(env.vars.MVP_FILE_API_ENABLED, 'false');
    assert.equal(env.vars.API_AUTH_REQUIRED, 'true');
    assert.equal(env.d1_databases?.[0]?.binding, 'DB');
    assert.equal(env.r2_buckets?.[0]?.binding, 'FILES');
    dbNames.add(env.d1_databases[0].database_name);
    bucketNames.add(env.r2_buckets[0].bucket_name);
  }

  assert.equal(dbNames.size, names.length, 'D1 database names must be isolated per environment');
  assert.equal(bucketNames.size, names.length, 'R2 bucket names must be isolated per environment');
  assert.equal(wrangler.vars.MVP_DATA_API_ENABLED, 'false');
  assert.equal(wrangler.vars.MVP_FILE_API_ENABLED, 'false');
});
