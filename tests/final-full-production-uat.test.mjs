import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('final full-production UAT is isolated from real tenants and always cleans up', async () => {
  const script = await read('scripts/final-full-production-uat.mjs');
  assert.match(script, /ORG-UAT-FINAL-/);
  assert.match(script, /finalFullProductionUat/);
  assert.match(script, /finally \{\s*cleanup\(\);\s*\}/s);
  assert.match(script, /DELETE FROM core_organizations/);
  assert.match(script, /DELETE FROM auth_users/);
  assert.doesNotMatch(script, /ORG-MKB/);
  assert.doesNotMatch(script, /head@proqtrack\.id|akbar@mkb\.com|manager-re@proqtrack\.id/);
});

test('final UAT covers every production role below global superadmin', async () => {
  const script = await read('scripts/final-full-production-uat.mjs');
  for (const role of ['head','admin','manager','supervisor','employee']) {
    assert.ok(script.includes(`role:'${role}'`), `missing role ${role}`);
    assert.ok(script.includes(`login('${role}'`), `missing login ${role}`);
  }
  assert.match(script, /for\(const name of Object\.keys\(actors\)\) await session\(name\)/);
  assert.match(script, /DEVICE_ACCESS_DENIED/);
  assert.match(script, /cross-tenant employee login/);
});

test('final UAT covers full operational module chain and authority boundaries', async () => {
  const script = await read('scripts/final-full-production-uat.mjs');
  for (const marker of [
    "entity:'clients'", "entity:'projects'", "entity:'projectAssignments'",
    "entity:'outlets'", "entity:'products'", "entity:'competitors'",
    "entity:'competitorProducts'", "entity:'outletProposals'", "entity:'surveyTemplates'",
    "entity:'visits'", "entity:'stocks'", "entity:'productSales'",
    "entity:'inventoryCycles'", "entity:'surveyResponses'",
  ]) assert.ok(script.includes(marker), `missing ${marker}`);
  assert.match(script, /STOCK_DIRECT_MUTATION_DISABLED/);
  assert.match(script, /MANUAL_SALE_GOVERNANCE_REQUIRED/);
  assert.match(script, /derived stock expected 12/);
  assert.match(script, /derived sale expected 8/);
  assert.match(script, /outlet auto approval failed/);
  assert.match(script, /employee analytics must be forbidden/);
  assert.match(script, /employee report create must be forbidden/);
  assert.match(script, /report schedule create failed/);
  assert.match(script, /account management expected 403/);
  assert.match(script, /roleOnProject:'sales'/);
  assert.match(script, /supervisorId:ids\.supervisorEmp/);
  assert.match(script, /position_name='sales'/);
});

test('final UAT validates live analytics reports and cleanup invariants', async () => {
  const script = await read('scripts/final-full-production-uat.mjs');
  assert.match(script, /\/api\/analytics\/overview/);
  assert.match(script, /\/api\/reports/);
  assert.match(script, /\/api\/report-schedules/);
  assert.match(script, /kpis\?\.visits\?\.total/);
  assert.match(script, /kpis\?\.sales\?\.transactions/);
  assert.match(script, /kpis\?\.surveys\?\.responses/);
  assert.match(script, /cleanup residual/);
  assert.match(script, /SYNTHETIC_REPORT_PREFIX = 'reports\/ORG-UAT-FINAL-'/);
  assert.match(script, /cleanupSyntheticReportArtifacts/);
  assert.match(script, /synthetic report R2 residual/);
  assert.doesNotMatch(script, /report cancel failed/);
  assert.match(script, /report schedule list missing created schedule/);
  assert.match(script, /Final full-production UAT PASS/);
});

test('production workflow runs final module-role UAT before security gate', async () => {
  const workflow = await read('.github/workflows/cloudflare-mvp.yml');
  const uat = workflow.indexOf('Run final full-production module-role UAT');
  const security = workflow.indexOf('Verify security headers and auth boundaries');
  assert.ok(uat > 0, 'final full-production UAT step missing');
  assert.ok(security > uat, 'security gate must follow final module-role UAT');
  assert.match(workflow, /node scripts\/final-full-production-uat\.mjs/);
});
