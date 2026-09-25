import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('MKB launch reset is hard-scoped and keeps Akbar credential', async () => {
  const script = await read('scripts/mkb-launch-reset.mjs');
  assert.match(script, /const ORG_ID = 'ORG-MKB'/);
  assert.match(script, /const ORG_NAME = 'Mitra Kreasi Bersama'/);
  assert.match(script, /const KEEP_EMAIL = 'akbar@mkb\.com'/);
  assert.match(script, /const KEEP_ROLE = 'head'/);
  assert.match(script, /MKB_LAUNCH_RESET_GUARD_FAILED/);
  assert.match(script, /MKB_RESET_CONFIRM/);
  assert.match(script, /keeperHashFingerprint/);
  assert.match(script, /MKB_KEEP_USER_CREDENTIAL_CHANGED/);
  assert.doesNotMatch(script, /SET\s+password_hash/i);
  assert.doesNotMatch(script, /DELETE FROM core_organizations/i);
});

test('MKB launch reset clears operational, security, report and device state', async () => {
  const script = await read('scripts/mkb-launch-reset.mjs');
  for (const table of [
    'core_clients','core_projects','core_employees','core_outlets','core_products',
    'core_competitors','core_visits','core_attendance','core_leaves','core_stocks',
    'core_product_sales','core_survey_templates','core_survey_responses','core_field_evidence',
    'core_inventory_cycles','core_outlet_proposals',
    'report_generation_jobs','core_report_schedules','core_workflow_requests',
    'core_bulk_import_runs','core_master_bulk_receipts','core_auth_sessions','core_auth_devices'
  ]) {
    assert.match(script, new RegExp(`DELETE FROM ${table}`));
  }
  assert.doesNotMatch(script, /core_inventory_cycles_v2/);
  assert.match(script, /DELETE FROM core_organization_users[\s\S]*user_id <>/);
  assert.match(script, /DELETE FROM auth_users[\s\S]*NOT EXISTS/);
  assert.match(script, /UPDATE core_sync_state[\s\S]*revision=0[\s\S]*cutover_mode='cloud'/);
});

test('MKB launch reset deletes scoped R2 evidence/reports and validates zero residuals', async () => {
  const script = await read('scripts/mkb-launch-reset.mjs');
  assert.match(script, /evidence\/\$\{ORG_ID\}\//);
  assert.match(script, /reports\/\$\{ORG_ID\}\//);
  assert.match(script, /deleteR2Objects/);
  assert.match(script, /MKB_R2_EVIDENCE_RESIDUAL/);
  assert.match(script, /MKB_R2_REPORT_RESIDUAL/);
  assert.match(script, /operational data=0/);
  assert.match(script, /credential preserved/);
});

test('production workflow runs reset only for explicit one-shot marker', async () => {
  const workflow = await read('.github/workflows/cloudflare-mvp.yml');
  const reset = workflow.indexOf('Reset MKB tenant for launch');
  const verify = workflow.indexOf('Verify MKB real tenant isolation');
  assert.ok(reset > 0);
  assert.ok(verify > reset);
  assert.match(workflow, /contains\(github\.event\.head_commit\.message, '\[MKB-LAUNCH-RESET\]'\)/);
  assert.match(workflow, /MKB_RESET_CONFIRM: "ORG-MKB:akbar@mkb\.com"/);
  assert.match(workflow, /node scripts\/mkb-launch-reset\.mjs/);
  assert.match(workflow, /Upload MKB launch reset report/);
});
