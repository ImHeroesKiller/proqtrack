import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORG_ID = 'ORG-MKB';
const ORG_NAME = 'Mitra Kreasi Bersama';
const KEEP_EMAIL = 'akbar@mkb.com';
const KEEP_ROLE = 'head';
const R2_BUCKET = 'proqtrack-mvp-files';

const requiredConfirm = `${ORG_ID}:${KEEP_EMAIL}`;
if (process.env.MKB_LAUNCH_RESET !== '1' || process.env.MKB_RESET_CONFIRM !== requiredConfirm) {
  throw new Error('MKB_LAUNCH_RESET_GUARD_FAILED');
}

const sqlq = value => String(value ?? '').replaceAll("'", "''");
const expect = (condition, message) => { if (!condition) throw new Error(message); };

function d1(sql) {
  const out = execFileSync(
    'npx',
    ['wrangler','d1','execute','DB','--remote','--env=','--json','--command',sql],
    { encoding:'utf8', stdio:['ignore','pipe','pipe'], env:process.env },
  );
  const start = out.indexOf('[');
  if (start < 0) throw new Error('D1_JSON_OUTPUT_MISSING');
  return JSON.parse(out.slice(start));
}
function rows(sql) {
  const data = d1(sql);
  const entry = Array.isArray(data) ? data.find(item => Array.isArray(item?.results)) : data;
  return entry?.results || [];
}
function row(sql) { return rows(sql)[0] || null; }
function inList(values) {
  const list = [...new Set(values.filter(Boolean).map(String))];
  return list.length ? list.map(value => `'${sqlq(value)}'`).join(',') : "('__NO_MATCH__')";
}

async function listR2Prefix(prefix) {
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '');
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '');
  expect(token && accountId, 'R2_CLEANUP_CREDENTIALS_REQUIRED');
  const objects = [];
  let cursor = '';
  do {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${R2_BUCKET}/objects`);
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('per_page', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers:{ authorization:`Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success !== true) {
      throw new Error(`R2_LIST_FAILED:${res.status}:${prefix}`);
    }
    objects.push(...(Array.isArray(data.result) ? data.result : []));
    cursor = data.result_info?.is_truncated ? String(data.result_info?.cursor || '') : '';
  } while (cursor);
  return objects;
}
async function deleteR2Key(key) {
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '');
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '');
  const encoded = String(key).split('/').map(encodeURIComponent).join('/');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${R2_BUCKET}/objects/${encoded}`;
  const res = await fetch(url, { method:'DELETE', headers:{ authorization:`Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success !== true) throw new Error(`R2_DELETE_FAILED:${res.status}:${key}`);
}
async function deleteR2Objects(keys) {
  let removed = 0;
  for (const key of [...new Set(keys.filter(Boolean).map(String))]) {
    await deleteR2Key(key);
    removed += 1;
  }
  return removed;
}

function operationalCounts() {
  return row(`
    SELECT
      (SELECT COUNT(*) FROM core_organization_users WHERE organization_id='${ORG_ID}') users,
      (SELECT COUNT(*) FROM core_clients WHERE organization_id='${ORG_ID}') clients,
      (SELECT COUNT(*) FROM core_projects WHERE organization_id='${ORG_ID}') projects,
      (SELECT COUNT(*) FROM core_employees WHERE organization_id='${ORG_ID}') employees,
      (SELECT COUNT(*) FROM core_outlets WHERE organization_id='${ORG_ID}') outlets,
      (SELECT COUNT(*) FROM core_products WHERE organization_id='${ORG_ID}') products,
      (SELECT COUNT(*) FROM core_competitors WHERE organization_id='${ORG_ID}') competitors,
      (SELECT COUNT(*) FROM core_visits WHERE organization_id='${ORG_ID}') visits,
      (SELECT COUNT(*) FROM core_attendance WHERE organization_id='${ORG_ID}') attendance,
      (SELECT COUNT(*) FROM core_leaves WHERE organization_id='${ORG_ID}') leaves,
      (SELECT COUNT(*) FROM core_stocks WHERE organization_id='${ORG_ID}') stocks,
      (SELECT COUNT(*) FROM core_product_sales WHERE organization_id='${ORG_ID}') sales,
      (SELECT COUNT(*) FROM core_survey_templates WHERE organization_id='${ORG_ID}') surveys,
      (SELECT COUNT(*) FROM core_survey_responses WHERE organization_id='${ORG_ID}') survey_responses,
      (SELECT COUNT(*) FROM core_field_evidence WHERE organization_id='${ORG_ID}') evidence,
      (SELECT COUNT(*) FROM core_inventory_cycles WHERE organization_id='${ORG_ID}') inventory_cycles,
      (SELECT COUNT(*) FROM core_inventory_cycles_v2 WHERE organization_id='${ORG_ID}') inventory_cycles_v2,
      (SELECT COUNT(*) FROM core_outlet_proposals WHERE organization_id='${ORG_ID}') outlet_proposals,
      (SELECT COUNT(*) FROM report_generation_jobs WHERE organization_id='${ORG_ID}') report_jobs,
      (SELECT COUNT(*) FROM core_report_schedules WHERE organization_id='${ORG_ID}') report_schedules,
      (SELECT COUNT(*) FROM core_workflow_requests WHERE organization_id='${ORG_ID}') workflows,
      (SELECT COUNT(*) FROM core_bulk_import_runs WHERE organization_id='${ORG_ID}') bulk_imports,
      (SELECT COUNT(*) FROM core_master_bulk_receipts WHERE organization_id='${ORG_ID}') bulk_receipts,
      (SELECT COUNT(*) FROM core_auth_sessions WHERE organization_id='${ORG_ID}') sessions,
      (SELECT COUNT(*) FROM core_auth_devices WHERE organization_id='${ORG_ID}') devices;
  `);
}

const organization = row(`
  SELECT id,code,name,status,timezone,metadata_json
  FROM core_organizations WHERE id='${ORG_ID}' LIMIT 1;
`);
expect(organization, 'MKB_ORGANIZATION_NOT_FOUND');
expect(organization.code === 'MKB', `MKB_CODE_MISMATCH:${organization.code}`);
expect(String(organization.name || '').trim().toLowerCase() === ORG_NAME.toLowerCase(), `MKB_NAME_MISMATCH:${organization.name}`);
expect(organization.status === 'active', `MKB_NOT_ACTIVE:${organization.status}`);

const memberships = rows(`
  SELECT au.id,au.email,au.password_hash,au.status AS user_status,ou.role,ou.status AS membership_status
  FROM core_organization_users ou
  JOIN auth_users au ON au.id=ou.user_id
  WHERE ou.organization_id='${ORG_ID}'
  ORDER BY lower(au.email);
`);
const keeper = memberships.find(item => String(item.email || '').toLowerCase() === KEEP_EMAIL);
expect(keeper, 'MKB_KEEP_USER_NOT_FOUND');
expect(keeper.user_status === 'active' && keeper.membership_status === 'active', 'MKB_KEEP_USER_NOT_ACTIVE');
expect(keeper.role === KEEP_ROLE, `MKB_KEEP_USER_ROLE_MISMATCH:${keeper.role}`);
expect(String(keeper.password_hash || '').length > 20, 'MKB_KEEP_USER_CREDENTIAL_MISSING');
const keeperHashFingerprint = createHash('sha256').update(String(keeper.password_hash)).digest('hex');

const projectIds = rows(`SELECT id FROM core_projects WHERE organization_id='${ORG_ID}'`).map(item => item.id);
const clientIds = rows(`SELECT id FROM core_clients WHERE organization_id='${ORG_ID}'`).map(item => item.id);
const orgUserIds = memberships.map(item => item.id);
const removeUserIds = memberships.filter(item => item.id !== keeper.id).map(item => item.id);

const projectList = inList(projectIds);
const clientList = inList(clientIds);
const userList = inList(orgUserIds);
const removeUserList = inList(removeUserIds);

const metadataKeys = projectIds.length
  ? rows(`SELECT object_key FROM file_metadata WHERE project_id IN (${projectList})`).map(item => item.object_key)
  : [];
const evidenceKeys = rows(`SELECT object_key FROM core_field_evidence WHERE organization_id='${ORG_ID}'`).map(item => item.object_key);
const reportKeys = rows(`SELECT result_key FROM report_generation_jobs WHERE organization_id='${ORG_ID}' AND result_key IS NOT NULL`).map(item => item.result_key);
const [evidencePrefixObjects, reportPrefixObjects] = await Promise.all([
  listR2Prefix(`evidence/${ORG_ID}/`),
  listR2Prefix(`reports/${ORG_ID}/`),
]);
const r2Keys = [
  ...metadataKeys,
  ...evidenceKeys,
  ...reportKeys,
  ...evidencePrefixObjects.map(item => item?.key),
  ...reportPrefixObjects.map(item => item?.key),
].filter(Boolean);

const before = operationalCounts();
console.log(`MKB launch reset preflight PASS: organization=${organization.name}; users=${before.users}; projects=${before.projects}; employees=${before.employees}; outlets=${before.outlets}; R2 objects=${new Set(r2Keys).size}`);

const removedR2 = await deleteR2Objects(r2Keys);

// Rows without organization_id are removed only through IDs captured from MKB before master deletion.
if (projectIds.length || clientIds.length || orgUserIds.length) {
  d1(`
    DELETE FROM security_audit_logs
    WHERE project_id IN (${projectList})
       OR client_id IN (${clientList})
       OR actor_id IN (${userList});
  `);
}
if (projectIds.length) {
  d1(`DELETE FROM file_metadata WHERE project_id IN (${projectList});`);
}
d1(`DELETE FROM app_snapshots WHERE id LIKE '%${ORG_ID}%';`);

d1(`
  DELETE FROM core_workflow_events WHERE organization_id='${ORG_ID}';
  DELETE FROM core_workflow_steps WHERE organization_id='${ORG_ID}';
  DELETE FROM core_workflow_requests WHERE organization_id='${ORG_ID}';
  DELETE FROM core_notifications WHERE organization_id='${ORG_ID}';
  DELETE FROM core_report_schedules WHERE organization_id='${ORG_ID}';
  DELETE FROM report_generation_jobs WHERE organization_id='${ORG_ID}';

  DELETE FROM core_bulk_import_chunks WHERE organization_id='${ORG_ID}';
  DELETE FROM core_bulk_import_runs WHERE organization_id='${ORG_ID}';
  DELETE FROM core_master_bulk_receipts WHERE organization_id='${ORG_ID}';
  DELETE FROM core_sync_revision_guards WHERE organization_id='${ORG_ID}';
  DELETE FROM core_sync_conflicts WHERE organization_id='${ORG_ID}';
  DELETE FROM core_sync_mutations WHERE organization_id='${ORG_ID}';
  DELETE FROM core_operational_audit_logs WHERE organization_id='${ORG_ID}';
  DELETE FROM core_api_idempotency_keys WHERE organization_id='${ORG_ID}';
  DELETE FROM core_legacy_import_batches WHERE organization_id='${ORG_ID}';

  DELETE FROM core_outlet_proposals WHERE organization_id='${ORG_ID}';
  DELETE FROM core_competitor_intel WHERE organization_id='${ORG_ID}';
  DELETE FROM core_price_observations WHERE organization_id='${ORG_ID}';
  DELETE FROM core_inventory_cycles_v2 WHERE organization_id='${ORG_ID}';
  DELETE FROM core_inventory_cycles WHERE organization_id='${ORG_ID}';
  DELETE FROM core_stocks WHERE organization_id='${ORG_ID}';
  DELETE FROM core_leaves WHERE organization_id='${ORG_ID}';
  DELETE FROM core_survey_responses WHERE organization_id='${ORG_ID}';
  DELETE FROM core_field_evidence WHERE organization_id='${ORG_ID}';
  DELETE FROM core_survey_questions WHERE organization_id='${ORG_ID}';
  DELETE FROM core_survey_templates WHERE organization_id='${ORG_ID}';
  DELETE FROM core_product_sales WHERE organization_id='${ORG_ID}';
  DELETE FROM core_attendance_points WHERE organization_id='${ORG_ID}';
  DELETE FROM core_attendance WHERE organization_id='${ORG_ID}';
  DELETE FROM core_visits WHERE organization_id='${ORG_ID}';
  DELETE FROM core_project_products WHERE organization_id='${ORG_ID}';
  DELETE FROM core_products WHERE organization_id='${ORG_ID}';
  DELETE FROM core_competitor_products WHERE organization_id='${ORG_ID}';
  DELETE FROM core_competitors WHERE organization_id='${ORG_ID}';
  DELETE FROM core_project_outlets WHERE organization_id='${ORG_ID}';
  DELETE FROM core_outlets WHERE organization_id='${ORG_ID}';
  DELETE FROM core_employee_project_assignments WHERE organization_id='${ORG_ID}';
  DELETE FROM core_project_memberships WHERE organization_id='${ORG_ID}';
  DELETE FROM core_employees WHERE organization_id='${ORG_ID}';
  DELETE FROM core_projects WHERE organization_id='${ORG_ID}';
  DELETE FROM core_clients WHERE organization_id='${ORG_ID}';

  DELETE FROM core_auth_devices WHERE organization_id='${ORG_ID}';
  DELETE FROM core_auth_sessions WHERE organization_id='${ORG_ID}';

  DELETE FROM core_organization_users
  WHERE organization_id='${ORG_ID}' AND user_id <> '${sqlq(keeper.id)}';

  UPDATE auth_users
  SET project_ids='[]', client_ids='[]'
  WHERE id='${sqlq(keeper.id)}';

  UPDATE core_sync_state
  SET revision=0,last_mutation_id=NULL,cutover_mode='cloud',updated_at=CURRENT_TIMESTAMP
  WHERE organization_id='${ORG_ID}';

  UPDATE core_organizations
  SET updated_at=CURRENT_TIMESTAMP
  WHERE id='${ORG_ID}';
`);

if (removeUserIds.length) {
  d1(`
    DELETE FROM auth_users
    WHERE id IN (${removeUserList})
      AND role <> 'superadmin'
      AND NOT EXISTS (
        SELECT 1 FROM core_organization_users ou WHERE ou.user_id=auth_users.id
      );
  `);
}

const after = operationalCounts();
const postMemberships = rows(`
  SELECT au.id,au.email,au.password_hash,au.status AS user_status,ou.role,ou.status AS membership_status
  FROM core_organization_users ou
  JOIN auth_users au ON au.id=ou.user_id
  WHERE ou.organization_id='${ORG_ID}';
`);
expect(postMemberships.length === 1, `MKB_POST_USER_COUNT:${postMemberships.length}`);
const postKeeper = postMemberships[0];
expect(String(postKeeper.email || '').toLowerCase() === KEEP_EMAIL, `MKB_POST_KEEP_USER_MISMATCH:${postKeeper.email}`);
expect(postKeeper.role === KEEP_ROLE && postKeeper.user_status === 'active' && postKeeper.membership_status === 'active', 'MKB_POST_KEEP_USER_NOT_ACTIVE_HEAD');
const postHashFingerprint = createHash('sha256').update(String(postKeeper.password_hash || '')).digest('hex');
expect(postHashFingerprint === keeperHashFingerprint, 'MKB_KEEP_USER_CREDENTIAL_CHANGED');

const zeroFields = Object.entries(after).filter(([key]) => key !== 'users');
const residual = zeroFields.filter(([,value]) => Number(value) !== 0);
expect(Number(after.users) === 1, `MKB_POST_USERS_EXPECTED_1_GOT_${after.users}`);
expect(residual.length === 0, `MKB_OPERATIONAL_RESIDUAL:${JSON.stringify(Object.fromEntries(residual))}`);

const syncState = row(`SELECT revision,cutover_mode FROM core_sync_state WHERE organization_id='${ORG_ID}'`);
expect(syncState && Number(syncState.revision) === 0 && syncState.cutover_mode === 'cloud', 'MKB_SYNC_STATE_NOT_RESET');

const [remainingEvidence, remainingReports] = await Promise.all([
  listR2Prefix(`evidence/${ORG_ID}/`),
  listR2Prefix(`reports/${ORG_ID}/`),
]);
expect(remainingEvidence.length === 0, `MKB_R2_EVIDENCE_RESIDUAL:${remainingEvidence.length}`);
expect(remainingReports.length === 0, `MKB_R2_REPORT_RESIDUAL:${remainingReports.length}`);

mkdirSync('recovery', { recursive:true });
const reportPath = `recovery/mkb-launch-reset-${String(process.env.GITHUB_SHA || 'manual').slice(0,40)}.json`;
const report = {
  organization:{ id:ORG_ID, name:ORG_NAME, code:'MKB' },
  retainedUser:{ email:KEEP_EMAIL, role:KEEP_ROLE, credentialPreserved:true },
  before,
  after,
  removedOrganizationMemberships:removeUserIds.length,
  removedR2Objects:removedR2,
  r2EvidenceRemaining:remainingEvidence.length,
  r2ReportsRemaining:remainingReports.length,
  syncState:{ revision:Number(syncState.revision), cutoverMode:syncState.cutover_mode },
  completedAt:new Date().toISOString(),
};
writeFileSync(reportPath, JSON.stringify(report,null,2) + '\n', 'utf8');

console.log(`MKB launch reset PASS: retained only ${KEEP_EMAIL}; operational data=0; sessions/devices=0; R2 evidence/reports=0; credential preserved; report=${reportPath}`);
