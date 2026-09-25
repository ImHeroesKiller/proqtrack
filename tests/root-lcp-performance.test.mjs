import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('critical styles are browser-discoverable before the module entry executes', async () => {
  const html = await read('index.html');
  const script = html.indexOf('<script type="module" src="./src/entry.js"></script>');
  assert.ok(script > 0);
  for (const href of [
    './assets/phase0.css',
    './assets/phase0-v2.css',
    './assets/sidebar-collapse.css',
    './assets/field-mobile.css',
    './assets/ui-2026.css',
    './assets/mobile-sales.css',
    './assets/org-theme.css',
    './assets/settings.css',
  ]) {
    const link = html.indexOf(`<link rel="stylesheet" href="${href}" />`);
    assert.ok(link >= 0 && link < script, `${href} must be discovered before entry.js`);
  }
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /<link rel="icon" href="\.\/assets\/icon-proqtrack\.svg"/);
});

test('critical UI CSS has no external @import font waterfall', async () => {
  const css = await read('assets/ui-2026.css');
  assert.doesNotMatch(css, /@import\s+url\(/i);
  assert.doesNotMatch(css, /fonts\.googleapis\.com/i);
  assert.match(css, /font-family:\s*Inter, ui-sans-serif, system-ui/);
});

test('entry path no longer observes the entire document during bootstrap', async () => {
  const [entry, logo] = await Promise.all([read('src/entry.js'), read('assets/logo.js')]);
  assert.doesNotMatch(entry, /MutationObserver/);
  assert.doesNotMatch(logo, /MutationObserver/);
  assert.doesNotMatch(logo, /ensureLink\('stylesheet'/);
  assert.match(entry, /await import\('\.\/bootstrap\.js'\)/);
});

test('authenticated reload paints restore shell before local DB parsing or branding work', async () => {
  const app = await read('src/app.js');
  assert.match(app, /sessionRestoring:\s*Boolean\(getApiToken\(\)\)/);
  assert.match(app, /function renderSessionRestoring\(\)/);
  const renderStart = app.indexOf('function render()');
  const renderEnd = app.indexOf('// ===== Sidebar =====', renderStart);
  const body = app.slice(renderStart, renderEnd);
  const shellGuard = body.indexOf('state.sessionRestoring && getApiToken()');
  const orgRead = body.indexOf('getOrganization(getCurrentOrgId())');
  assert.ok(shellGuard >= 0 && orgRead > shellGuard, 'restore shell must precede local DB-backed branding');
  const initStart = app.indexOf('function init()');
  const init = app.slice(initStart, app.indexOf('init();', initStart) + 7);
  assert.match(init, /if \(!state\.sessionRestoring\) getDB\(\)/);
});

test('tenant-bound session restore overlaps auth validation and core bootstrap', async () => {
  const bridge = await read('src/lib/cloud-data.js');
  assert.match(bridge, /getApiTokenMeta/);
  const start = bridge.indexOf('export async function restoreCloudSession');
  const end = bridge.indexOf('export async function establishCloudSession', start);
  const body = bridge.slice(start, end);
  const sessionPromise = body.indexOf("const sessionPromise = apiJson('/api/auth/session')");
  const bootstrapPromise = body.indexOf("const bootstrapPromise = hasTenantHint ? apiJson('/api/core/bootstrap')");
  const awaitSession = body.indexOf('const session = await sessionPromise');
  assert.ok(sessionPromise >= 0 && bootstrapPromise > sessionPromise && awaitSession > bootstrapPromise);
  assert.match(body, /prefetchedRemote: bootstrapPromise \? await bootstrapPromise : null/);
  assert.match(bridge, /bootstrapOperationalData\(localDb, account = \{\}, \{ prefetchedRemote = null \} = \{\}\)/);
});

test('profile refresh is after authenticated paint and not awaited on the LCP path', async () => {
  const cutover = await read('src/cloud-cutover.js');
  const start = cutover.indexOf('async function restoreCloudSessionOnReload');
  const end = cutover.indexOf('async function cloudLogout', start);
  const body = cutover.slice(start, end);
  const loggedIn = body.indexOf('state.loggedIn = true');
  const route = body.indexOf('forceRoute(state.route)');
  const profile = body.indexOf('queueMicrotask(() => syncCurrentOrganizationProfile');
  assert.ok(loggedIn >= 0 && route > loggedIn && profile > route);
  assert.doesNotMatch(body.slice(route, profile), /await\s+syncCurrentOrganizationProfile/);
});

test('production bootstrap excludes synthetic UAT seed from the critical path and parallelizes independent modules', async () => {
  const bootstrap = await read('src/bootstrap.js');
  assert.match(bootstrap, /function shouldLoadUatSeed\(\)/);
  assert.match(bootstrap, /proqtrack_enable_uat_seed/);
  assert.match(bootstrap, /if \(shouldLoadUatSeed\(\)\) await load\('\.\/data\/uat-seed-v1\.js'/);
  assert.match(bootstrap, /await Promise\.all\(\[/);
  assert.match(bootstrap, /load\('\.\/cloud-cutover\.js'/);
  assert.match(bootstrap, /load\('\.\/m4-bootstrap\.js'/);
  assert.match(bootstrap, /load\('\.\/lib\/m6-client\.js'/);
  assert.match(bootstrap, /load\('\.\/app\.js'/);
});

test('service worker install is deferred until load plus idle', async () => {
  const m4 = await read('src/m4-bootstrap.js');
  assert.match(m4, /function registerServiceWorkerAfterPaint\(\)/);
  assert.match(m4, /window\.addEventListener\('load', register, \{ once:true \}\)/);
  assert.match(m4, /requestIdleCallback\(run, \{ timeout:5000 \}\)/);
  assert.doesNotMatch(m4, /if \('serviceWorker' in navigator\) \{\s*navigator\.serviceWorker\.register/s);
});

test('entry remains a native ES module so classic-script defer changes are unnecessary', async () => {
  const html = await read('index.html');
  assert.match(html, /<script type="module" src="\.\/src\/entry\.js"><\/script>/);
  assert.doesNotMatch(html, /<script\s+src="\.\/src\/bootstrap\.js"/);
});
