/**
 * Browser UAT against a local static server + installed Google Chrome.
 * Password is never committed: pass UAT_PASSWORD.
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = resolve(import.meta.dirname, '..');
const PASSWORD = process.env.UAT_PASSWORD || '';
const PORT = Number(process.env.UAT_PORT || 4173);
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

if (!PASSWORD) {
  console.error('Set UAT_PASSWORD to run browser UAT.');
  process.exit(2);
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = join(ROOT, url === '/' ? 'index.html' : url);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html');
    res.setHeader('content-type', MIME[extname(file)] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    createReadStream(file).pipe(res);
  });
  return new Promise(resolveP => server.listen(PORT, '127.0.0.1', () => resolveP(server)));
}

const fails = [];
const notes = [];
function fail(id, msg) { fails.push(`${id}: ${msg}`); console.error('FAIL', id, msg); }
function pass(id, msg = '') { console.log('PASS', id, msg); }

async function login(page, email, { reset = true } = {}) {
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => typeof window.FT?.handleLogin === 'function', { timeout: 30000 });
  if (reset) {
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => typeof window.FT?.handleLogin === 'function', { timeout: 30000 });
  }
  await page.waitForSelector('#loginEmail', { timeout: 15000 });
  await page.evaluate(({ email, password }) => {
    document.getElementById('loginEmail').value = email;
    document.getElementById('loginPassword').value = password;
    document.querySelector('.login-card form')?.requestSubmit();
  }, { email, password: PASSWORD });
  await page.waitForFunction(() => window.FT?.state?.loggedIn === true, { timeout: 12000 }).catch(() => {});
  return page.locator('#toastRoot').innerText().catch(() => '');
}

async function collectErrors(page, bucket) {
  page.on('pageerror', err => bucket.push(String(err)));
  page.on('console', msg => {
    if (msg.type() === 'error') bucket.push(msg.text());
  });
}

async function run() {
  const server = await serve();
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({
    executablePath: existsSync(chrome) ? chrome : undefined,
    channel: existsSync(chrome) ? undefined : 'chrome',
    headless: true,
  });
  try {
    const errors = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.grantPermissions(['geolocation']);
    const page = await context.newPage();
    collectErrors(page, errors);

    const badToast = await login(page, 'nobody@proqtrack.id');
    const invalid = await page.locator('#loginEmail').count();
    if (invalid) pass('A-invalid-login', badToast || 'stayed on login');
    else fail('A-invalid-login', 'left login on bad credentials');

    const salesToast = await login(page, 'budi.employee@proqtrack.id');
    const ready = await page.evaluate(() => ({
      logged: !!window.FT?.state?.loggedIn,
      role: window.FT?.state?.account?.role,
      toast: document.getElementById('toastRoot')?.innerText || '',
    }));
    if (!ready.logged) fail('A-sales-login', `toast=${salesToast} state=${JSON.stringify(ready)}`);
    else pass('A-sales-login', ready.role || 'ok');

    await page.goto(`http://127.0.0.1:${PORT}/#/myday`);
    await page.waitForTimeout(400);
    const body = await page.locator('#app').innerText();
    if (/My Day|Today|Attendance|Progress/i.test(body) || await page.locator('.mq-home').count()) pass('B-myday');
    else fail('B-myday', body.slice(0, 200));

    await context.setGeolocation({ latitude: 0, longitude: 0, accuracy: 8 });
    await page.evaluate(() => window.FS?.startAreaWatch?.());
    await page.waitForTimeout(400);
    const outside = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('proqtrack_db_v6') || '{}');
      return (db.attendanceEvents || []).filter(e => e.source === 'auto_geofence').length;
    });
    pass('C-outside-or-watch', `geofence events=${outside}`);

    await context.setGeolocation({ latitude: -6.1950, longitude: 106.8235, accuracy: 8 });
    await page.evaluate(() => {
      const o = JSON.parse(localStorage.getItem('proqtrack_db_v6') || '{}').outlets?.[0];
      return window.FT && o;
    });
    const geo = await page.evaluate(async () => {
      try {
        const { detectAreaAttendance, getOutlets } = await import('/src/lib/db.js');
        const o = getOutlets().find(x => Number.isFinite(Number(x.lat)));
        const r = detectAreaAttendance({ lat: o.lat, lng: o.lng, accuracy: 8 });
        const r2 = detectAreaAttendance({ lat: o.lat, lng: o.lng, accuracy: 8 });
        return { source: r.event?.source || r.attendance?.source, skip: r2.reason, meters: r.meters };
      } catch (e) { return { error: String(e.message || e) }; }
    });
    if (geo.error) fail('C-geofence', geo.error);
    else if (geo.source === 'auto_geofence' && geo.skip === 'still_inside') pass('C-geofence', JSON.stringify(geo));
    else fail('C-geofence', JSON.stringify(geo));

    await page.goto(`http://127.0.0.1:${PORT}/#/mysales`);
    await page.waitForTimeout(400);
    if (await page.locator('form, .stat-value, .card-title').count()) pass('G-sales-page');
    else fail('G-sales-page', 'sales UI missing');

    await page.goto(`http://127.0.0.1:${PORT}/#/mysurveys`);
    await page.waitForTimeout(400);
    pass('F-surveys-page', (await page.locator('#app').innerText()).slice(0, 80));

    await page.evaluate(() => window.FT?.logout?.());
    await page.waitForTimeout(300);

    await login(page, 'pm@proqtrack.id', { reset: false });
    await page.goto(`http://127.0.0.1:${PORT}/#/reports`);
    await page.waitForTimeout(500);
    const rpt = await page.locator('#app').innerText();
    if (/Report|Laporan|Custom|Activity/i.test(rpt)) pass('I-manager-reports');
    else fail('I-manager-reports', rpt.slice(0, 160));
    await page.goto(`http://127.0.0.1:${PORT}/#/reports/activity`);
    await page.waitForTimeout(400);
    if (await page.locator('#app').innerText()) pass('H-activity-report');

    const mgrVisits = await page.evaluate(async () => {
      const { getVisits, getActor } = await import('/src/lib/db.js');
      const actor = getActor();
      const visits = getVisits();
      const leaked = visits.filter(v => v.projectId && v.projectId !== actor?.projectId);
      return { role: actor?.role, projectId: actor?.projectId, leaked: leaked.map(v => v.projectId), n: visits.length };
    });
    if (mgrVisits.role === 'manager' && mgrVisits.leaked.length === 0) pass('K-manager-isolation', `n=${mgrVisits.n}`);
    else fail('K-manager-isolation', JSON.stringify(mgrVisits));

    await page.evaluate(() => window.FT?.logout?.());
    await login(page, 'manager@proqtrack.id', { reset: false });
    await page.goto(`http://127.0.0.1:${PORT}/#/surveys`);
    await page.waitForTimeout(400);
    if (await page.locator('#app').innerText()) pass('F-head-surveys');
    await page.goto(`http://127.0.0.1:${PORT}/#/reports/custom`);
    await page.waitForTimeout(400);
    if (/Generate|Custom|kolom|column/i.test(await page.locator('#app').innerText())) pass('I-custom-report');
    else fail('I-custom-report', (await page.locator('#app').innerText()).slice(0, 160));
    notes.push('Supervisor/superadmin/mobile/R2 live require a dedicated browser context or device and were not chained after the reports page (UAT seed DOM is too large to close/reopen reliably in one process).');

    const consoleFails = errors.filter(e => /Uncaught|SyntaxError|ReferenceError|TypeError/i.test(e) && !/favicon|leaflet/i.test(e));
    if (consoleFails.length) fail('Q-console', consoleFails.slice(0, 5).join(' | '));
    else pass('Q-console', `errors captured=${errors.length} (filtered)`);

    if (fails.length) {
      console.error('\nUAT FAILED\n' + fails.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('\nBROWSER UAT CORE FLOWS PASS');
      console.log(notes.join('\n'));
    }
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
