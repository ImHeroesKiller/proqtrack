import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('remaining operational records are tenant-scoped cloud authorities', async () => {
  const [sql, worker, client] = await Promise.all([
    read('migrations/0024_p2_operational_cloud_authority.sql'),
    read('worker/operations.js'),
    read('src/lib/cloud-data.js'),
  ]);
  for (const [entity, table] of [
    ['priceObservations','core_price_observations'],
    ['competitorIntel','core_competitor_intel'],
    ['outletProposals','core_outlet_proposals'],
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'i'));
    assert.match(sql, new RegExp(`FOREIGN KEY \\(organization_id\\)`));
    assert.match(worker, new RegExp(`${entity}: '${table}'`));
    assert.match(client, new RegExp(`'${entity}'`));
  }
});

test('outlet proposals do not create master outlets before final approval', async () => {
  const [db, worker] = await Promise.all([read('src/lib/db.js'), read('worker/operations.js')]);
  const createStart = db.indexOf('export function createOutletProposal');
  const reviewStart = db.indexOf('export function reviewOutletProposal', createStart);
  const createBody = db.slice(createStart, reviewStart);
  assert.doesNotMatch(createBody, /db\.outlets\.push\(outlet\)/);
  const reviewBody = db.slice(reviewStart, db.indexOf('export function getVisits', reviewStart));
  assert.doesNotMatch(reviewBody, /db\.outlets\.push\(outlet\)/);
  assert.match(reviewBody, /Master outlet is created atomically by the cloud authority/);
  assert.match(worker, /approvedProposalOutlet\(env, organizationId, row, existing\)/);
  assert.match(worker, /upsertStatements\(env, 'outlets', outletRow, organizationId\)/);
});

test('field photo metadata hydrates from authoritative evidence without becoming core sync data', async () => {
  const [client, evidence, bridge] = await Promise.all([
    read('src/lib/cloud-data.js'),
    read('worker/evidence.js'),
    read('src/lib/field-photo-evidence.js'),
  ]);
  assert.match(client, /fetchCloudFieldPhotos/);
  assert.match(client, /\/api\/evidence\?limit=250&offset=/);
  assert.match(client, /remote\.data\.fieldPhotos/);
  const collections = client.slice(client.indexOf('export const CLOUD_COLLECTIONS'), client.indexOf('const DB_KEY'));
  assert.doesNotMatch(collections, /'fieldPhotos'/);
  assert.match(evidence, /nextOffset/);
  assert.match(evidence, /LIMIT \? OFFSET \?/);
  assert.match(bridge, /id: evidenceId/);
});

test('revision conflict recovery is fail-closed and never auto-replays a whole local snapshot', async () => {
  const [offline, receipt] = await Promise.all([
    read('src/lib/offline-engine.js'),
    read('worker/m4-sync.js'),
  ]);
  const start = offline.indexOf('export async function recoverCloudConflict');
  const end = offline.indexOf('export function installOfflineEngine', start);
  const recovery = offline.slice(start, end);
  assert.match(recovery, /conflict-held/);
  assert.match(recovery, /resolution: pending \? 'manual' : 'server-wins'/);
  assert.doesNotMatch(recovery, /await replayLatestSnapshot/);
  assert.match(receipt, /'manual'/);
});

test('canonical live deploy target has no divergent named production namespace', async () => {
  const [config, pkg] = await Promise.all([read('wrangler.jsonc'), read('package.json')]);
  const wrangler = JSON.parse(config);
  const json = JSON.parse(pkg);
  assert.equal(wrangler.vars.ENVIRONMENT, 'mvp');
  assert.equal(wrangler.env?.production, undefined);
  assert.equal(json.scripts['deploy:production'], 'npm run deploy:live');
  assert.equal(json.scripts['db:migrate:production'], 'npm run db:migrate:live');
});

test('executable runtime is self-hosted and CSP can be tightened beyond the P2 baseline', async () => {
  const [html, headers, hardening, exportSource] = await Promise.all([
    read('index.html'), read('_headers'), read('worker/hardening.js'), read('src/types/reports-export.js'),
  ]);
  assert.doesNotMatch(html, /assets\/vendor\/leaflet\/leaflet\.js/);
  assert.match(html, /\.\/src\/entry\.js/);
  assert.doesNotMatch(html, /https:\/\/unpkg\.com/);
  assert.doesNotMatch(html, /<script type="module">/);
  for (const source of [headers, hardening]) {
    assert.match(source, /script-src 'self'/);
    assert.match(source, /script-src-elem 'self'/);
    assert.doesNotMatch(source, /script-src-attr 'unsafe-inline'/);
    assert.doesNotMatch(source, /https:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net)/);
  }
  assert.match(exportSource, /document-export\.js/);
  assert.doesNotMatch(exportSource, /jszip@|jspdf@|cdn\.jsdelivr\.net/);
});

test('legacy compatibility modules are retired from runtime and repository', async () => {
  const bootstrap = await read('src/bootstrap.js');
  assert.doesNotMatch(bootstrap, /uat-fixes\.js/);
  for (const path of [
    'src/uat-fixes.js',
    'src/reports/index.js',
    'src/reports/phase4.js',
    'src/types/reports-a11y.js',
    'src/types/reports-export-hotfix.js',
  ]) {
    await assert.rejects(() => access(new URL(`../${path}`, import.meta.url)));
  }
});

test('PWA precache is runtime-reachable instead of every source file', async () => {
  const [build, sw] = await Promise.all([read('scripts/build.mjs'), read('sw.js')]);
  assert.match(build, /runtimeGraph\("src\/entry\.js"\)/);
  assert.match(build, /localDependencies/);
  assert.match(build, /node_modules\/leaflet\/dist\/leaflet\.js/);
  assert.match(sw, /proqtrack-v12\.44/);
  assert.match(sw, /\.\/src\/entry\.js/);
});
