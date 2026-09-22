import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/0005_production_foundation.sql', import.meta.url), 'utf8');
const wrangler = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

function coreTableBody(name) {
  const table = `core_${name}`;
  const match = migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'));
  assert.ok(match, `missing production table: ${table}`);
  return match[1];
}

test('production schema defines the normalized namespaced operational foundation', () => {
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
    'field_evidence',
    'operational_audit_logs',
    'api_idempotency_keys',
    'legacy_import_batches'
  ];

  for (const table of expected) coreTableBody(table);
});

test('every tenant-owned core table carries organization_id', () => {
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
    'field_evidence',
    'operational_audit_logs',
    'api_idempotency_keys',
    'legacy_import_batches'
  ];

  for (const table of tenantTables) {
    assert.match(coreTableBody(table), /\borganization_id\b/i, `${table} is missing organization_id`);
  }
});

test('cross-tenant relationships use organization-scoped foreign keys', () => {
  for (const table of [
    'projects',
    'project_memberships',
    'employee_project_assignments',
    'visits',
    'attendance',
    'product_sales',
    'survey_responses',
    'field_evidence'
  ]) {
    assert.match(
      coreTableBody(table),
      /FOREIGN KEY\s*\([^)]*organization_id[^)]*\)[\s\S]*?REFERENCES\s+core_\w+\s*\([^)]*organization_id[^)]*\)/i,
      `${table} lacks an organization-scoped relationship`
    );
  }
});

test('foundation migration never mutates or collides with legacy operational tables', () => {
  assert.doesNotMatch(migration, /DROP\s+TABLE/i);
  assert.doesNotMatch(migration, /ALTER\s+TABLE/i);

  for (const legacyName of ['organizations', 'clients', 'projects', 'employees', 'outlets', 'attendance', 'products']) {
    assert.doesNotMatch(
      migration,
      new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${legacyName}\\s*\\(`, 'i'),
      `foundation must not create/reuse legacy table name: ${legacyName}`
    );
  }

  assert.match(migration, /CREATE TABLE IF NOT EXISTS\s+core_organizations/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS\s+core_clients/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS\s+core_projects/i);
});

test('default config is the canonical live target while development and staging stay isolated', () => {
  assert.equal(wrangler.vars.ENVIRONMENT, 'mvp');
  assert.equal(wrangler.vars.MVP_DATA_API_ENABLED, 'false');
  assert.equal(wrangler.vars.MVP_FILE_API_ENABLED, 'false');
  assert.equal(wrangler.vars.API_AUTH_REQUIRED, 'true');
  assert.equal(wrangler.d1_databases?.[0]?.database_name, 'proqtrack-mvp');
  assert.equal(wrangler.r2_buckets?.[0]?.bucket_name, 'proqtrack-mvp-files');
  assert.equal(wrangler.env?.production, undefined);

  const names = ['development', 'staging'];
  const dbNames = new Set([wrangler.d1_databases[0].database_name]);
  const bucketNames = new Set([wrangler.r2_buckets[0].bucket_name]);
  for (const name of names) {
    const env = wrangler.env?.[name];
    assert.ok(env, `missing wrangler env: ${name}`);
    assert.equal(env.vars.ENVIRONMENT, name);
    assert.equal(env.vars.MVP_DATA_API_ENABLED, 'false');
    assert.equal(env.vars.MVP_FILE_API_ENABLED, 'false');
    assert.equal(env.vars.API_AUTH_REQUIRED, 'true');
    dbNames.add(env.d1_databases[0].database_name);
    bucketNames.add(env.r2_buckets[0].bucket_name);
  }
  assert.equal(dbNames.size, 3);
  assert.equal(bucketNames.size, 3);
});
