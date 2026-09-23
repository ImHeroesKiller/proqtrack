import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.PROQTRACK_BASE_URL || 'https://proqtrack.arywibowo.workers.dev';
const CREDS_FILE = process.env.PROQTRACK_UAT_CREDENTIALS;
const ARTIFACT_DIR = process.env.PROQTRACK_UAT_ARTIFACT_DIR || 'uat-artifacts';
if (!CREDS_FILE) throw new Error('PROQTRACK_UAT_CREDENTIALS is required');

const cfg = JSON.parse(await readFile(CREDS_FILE, 'utf8'));
await mkdir(ARTIFACT_DIR, { recursive: true });

const results = [];
const failures = [];
const technicalTerms = /\b(?:D1|Cloudflare|GitHub|R2|Wrangler|stack trace|schema migration)\b/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function seedLocalIdentity(page, actor) {
  await page.evaluate(({ actor, org, project }) => {
    const key = 'proqtrack_db_v6';
    const mirror = 'proqtrack_db_v7';
    let db = {};
    try { db = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { db = {}; }

    const ensure = name => {
      if (!Array.isArray(db[name])) db[name] = [];
      return db[name];
    };
    for (const name of [
      'accounts','employees','organizations','clients','projects','projectAssignments','outlets',
      'visits','attendance','products','leaves','stocks','priceObservations','competitors',
      'competitorProducts','competitorIntel','fieldPhotos','productSales','outletProposals',
      'attendancePoints','projectProducts','reportTemplates','reportJobs','reportExports',
      'reportFilters','reportApprovals','reportSchedules','auditLogs','surveyTemplates','surveyResponses'
    ]) ensure(name);

    db.accounts = db.accounts.filter(row => row.id !== actor.id && String(row.email || '').toLowerCase() !== actor.email.toLowerCase());
    db.accounts.push({
      id: actor.id,
      organizationId: actor.role === 'superadmin' ? null : org.id,
      projectId: actor.role === 'manager' ? project.id : null,
      email: actor.email,
      name: actor.name,
      password: actor.password,
      role: actor.role,
      employeeId: actor.employeeId || null,
      status: 'active',
      mustChangePassword: false,
    });

    if (actor.employeeId) {
      db.employees = db.employees.filter(row => row.id !== actor.employeeId);
      db.employees.push({
        id: actor.employeeId,
        organizationId: org.id,
        employeeCode: actor.employeeCode || actor.employeeId,
        name: actor.name,
        email: actor.email,
        role: actor.role === 'supervisor' ? 'Supervisor' : 'Field Sales',
        status: 'active',
        area: 'UAT Jakarta',
        supervisorId: actor.supervisorEmployeeId || null,
      });
    }

    db.organizations = db.organizations.filter(row => row.id !== org.id);
    db.organizations.push({ id: org.id, code: org.code, name: org.name, status: 'active' });
    db.currentOrganizationId = org.id;
    db._version = Number(db._version || 15);
    localStorage.setItem('proqtrack_current_org', org.id);
    localStorage.setItem(key, JSON.stringify(db));
    localStorage.setItem(mirror, JSON.stringify(db));
    sessionStorage.clear();
  }, { actor, org: cfg.organization, project: cfg.project });
}

async function waitForApp(page, actor) {
  await page.waitForFunction(
    role => window.FT?.state?.loggedIn === true && window.FT?.state?.account?.role === role,
    actor.role,
    { timeout: 20000 },
  );
  await page.waitForFunction(() => window.__PROQTRACK_BOOT__?.stage === 'ready', null, { timeout: 10000 });
  const boot = await page.evaluate(() => window.__PROQTRACK_BOOT__);
  assert(boot?.stage === 'ready', `${actor.label}: runtime boot is not ready`);
}

async function inspectPage(page, actor, route, expected) {
  await page.evaluate(hash => { location.hash = hash; }, route);
  await page.waitForTimeout(route.includes('projects') || route.includes('team') || route.includes('reports') ? 1400 : 650);

  const state = await page.evaluate(() => ({
    hash: location.hash,
    title: document.querySelector('.topbar-title')?.textContent?.trim() || '',
    text: document.body.innerText.slice(0, 25000),
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    role: window.FT?.state?.account?.role || '',
  }));

  assert(state.role === actor.role, `${actor.label}: role changed on ${route}`);
  assert(!/Halaman tidak ditemukan/i.test(state.text), `${actor.label}: not-found page on ${route}`);
  assert(!/Memuat modul Project Management\.\.\./i.test(state.text), `${actor.label}: project module stuck loading on ${route}`);
  assert(!/Data belum dapat dimuat/i.test(state.text), `${actor.label}: cloud bootstrap error visible on ${route}`);
  assert(!technicalTerms.test(state.text), `${actor.label}: technical infrastructure term leaked in UI on ${route}`);
  assert(state.width <= state.viewport + 12, `${actor.label}: horizontal overflow on ${route}: ${state.width} > ${state.viewport}`);
  if (expected) {
    const ok = state.text.toLowerCase().includes(expected.toLowerCase()) || state.title.toLowerCase().includes(expected.toLowerCase());
    assert(ok, `${actor.label}: expected "${expected}" on ${route}; title="${state.title}"`);
  }

  results.push({ actor: actor.label, role: actor.role, route, title: state.title, status: 'PASS' });
}

async function runActor(browser, actor) {
  const context = await browser.newContext({
    viewport: actor.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: actor.mobile ? 2 : 1,
    isMobile: actor.mobile,
    hasTouch: actor.mobile,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
  });
  const page = await context.newPage();
  const pageErrors = [];
  const api5xx = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', msg => {
    if (msg.type() === 'error' && !/favicon|Failed to load resource.*404/i.test(msg.text())) pageErrors.push(`console: ${msg.text()}`);
  });
  page.on('response', response => {
    try {
      const url = new URL(response.url());
      if (url.origin === new URL(BASE_URL).origin && url.pathname.startsWith('/api/') && response.status() >= 500) {
        api5xx.push(`${response.status()} ${url.pathname}`);
      }
    } catch {}
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#loginEmail', { timeout: 15000 });
    await seedLocalIdentity(page, actor);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#loginEmail', { timeout: 15000 });

    if (actor.label === 'Merchandiser') {
      const toggle = page.locator('.password-toggle');
      await toggle.click();
      assert(await page.locator('#loginPassword').getAttribute('type') === 'text', 'Password eye did not reveal password');
      await toggle.click();
      assert(await page.locator('#loginPassword').getAttribute('type') === 'password', 'Password eye did not hide password');
    }

    await page.locator('#loginEmail').fill(actor.email);
    await page.locator('#loginPassword').fill(actor.password);
    if (actor.label === 'Merchandiser') await page.locator('#loginPassword').press('Enter');
    else await page.getByRole('button', { name: 'Masuk ke Dashboard' }).click();

    await waitForApp(page, actor);
    await page.waitForTimeout(700);

    if (actor.clickRoute) {
      const link = page.locator(`.nav-item[href="${actor.clickRoute}"]`).first();
      await link.waitFor({ state: 'visible', timeout: 8000 });
      await link.click();
      await page.waitForFunction(route => location.hash === route, actor.clickRoute, { timeout: 5000 });
    }

    for (const item of actor.routes) await inspectPage(page, actor, item.route, item.expected);

    if (actor.forbidden) {
      await page.evaluate(hash => { location.hash = hash; }, actor.forbidden);
      await page.waitForTimeout(700);
      const hash = await page.evaluate(() => location.hash);
      assert(hash !== actor.forbidden, `${actor.label}: forbidden route remained accessible: ${actor.forbidden}`);
      results.push({ actor: actor.label, role: actor.role, route: actor.forbidden, status: 'PASS', detail: `redirected to ${hash}` });
    }

    await page.screenshot({ path: path.join(ARTIFACT_DIR, `${actor.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`), fullPage: true });

    assert(pageErrors.length === 0, `${actor.label}: browser errors: ${pageErrors.join(' | ')}`);
    assert(api5xx.length === 0, `${actor.label}: API 5xx responses: ${api5xx.join(' | ')}`);

    const logout = page.locator('.logout-btn');
    if (await logout.count()) {
      await logout.first().click();
      await page.waitForSelector('#loginEmail', { timeout: 8000 });
    }
    results.push({ actor: actor.label, role: actor.role, status: 'PASS', detail: 'login/navigation/responsive/logout' });
  } catch (error) {
    failures.push({ actor: actor.label, role: actor.role, error: error?.stack || String(error), pageErrors, api5xx });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `FAIL-${actor.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
  }
}

const byKey = cfg.actors;
const actors = [
  {
    ...byKey.budi, label: 'Merchandiser', mobile: true, clickRoute: '#/myvisits',
    routes: [
      { route: '#/myday', expected: 'My Day' },
      { route: '#/myvisits', expected: 'My Visits' },
      { route: '#/mysales', expected: 'Product Sales' },
      { route: '#/myattendance', expected: 'My Attendance' },
      { route: '#/myleaves', expected: 'Leave' },
      { route: '#/settings', expected: 'Settings' },
    ],
    forbidden: '#/accounts',
  },
  {
    ...byKey.nadia, label: 'SPG', mobile: true, clickRoute: '#/mysales',
    routes: [
      { route: '#/myday', expected: 'My Day' },
      { route: '#/myprices', expected: 'Price & Discount' },
      { route: '#/myintel', expected: 'Competitor Intel' },
      { route: '#/myphotos', expected: 'Field Photos' },
      { route: '#/settings', expected: 'Settings' },
    ],
    forbidden: '#/accounts',
  },
  {
    ...byKey.rizky, label: 'Supervisor', mobile: true, clickRoute: '#/visits',
    routes: [
      { route: '#/', expected: 'Team Home' },
      { route: '#/myday', expected: 'My Day' },
      { route: '#/my-team', expected: 'Team' },
      { route: '#/visits', expected: 'Visits' },
      { route: '#/attendance', expected: 'Attendance' },
      { route: '#/leaves', expected: 'Leave' },
      { route: '#/outlet-approvals', expected: 'Outlet Approvals' },
      { route: '#/settings', expected: 'Settings' },
    ],
    forbidden: '#/accounts',
  },
  {
    ...byKey.manager, label: 'Manager', mobile: false, clickRoute: '#/employees',
    routes: [
      { route: '#/', expected: 'Project Home' },
      { route: '#/projects', expected: 'Project' },
      { route: '#/assignments', expected: 'Assignment' },
      { route: '#/employees', expected: 'Employees' },
      { route: '#/outlets', expected: 'Outlet' },
      { route: '#/products', expected: 'Products' },
      { route: '#/sales', expected: 'Product Sales' },
      { route: '#/stocks', expected: 'Outlet Stock' },
      { route: '#/competitor-analysis', expected: 'Competitor Analysis' },
      { route: '#/reports', expected: 'Reports' },
      { route: '#/settings', expected: 'Settings' },
    ],
    forbidden: '#/organizations',
  },
  {
    ...byKey.head, label: 'Head', mobile: false, clickRoute: '#/accounts',
    routes: [
      { route: '#/', expected: 'Organization Home' },
      { route: '#/employees', expected: 'Employees' },
      { route: '#/accounts', expected: 'Accounts' },
      { route: '#/reports', expected: 'Reports' },
      { route: '#/settings', expected: 'Settings' },
    ],
    forbidden: '#/organizations',
  },
  {
    ...byKey.superadmin, label: 'Superadmin', mobile: false, clickRoute: '#/organizations',
    routes: [
      { route: '#/', expected: 'Organization Home' },
      { route: '#/organizations', expected: 'Organizations' },
      { route: '#/accounts', expected: 'Accounts' },
      { route: '#/reports', expected: 'Reports' },
      { route: '#/settings', expected: 'Settings' },
    ],
  },
];

const browser = await chromium.launch({ headless: true });
for (const actor of actors) await runActor(browser, actor);
await browser.close();

const summary = {
  baseUrl: BASE_URL,
  organization: cfg.organization.id,
  project: cfg.project.id,
  testedAt: new Date().toISOString(),
  roles: actors.map(a => ({ label: a.label, role: a.role, mobile: a.mobile })),
  checks: results,
  failures,
  passed: failures.length === 0,
};
await writeFile(path.join(ARTIFACT_DIR, 'browser-summary.json'), JSON.stringify(summary, null, 2));
console.log(`BROWSER_UAT_SUMMARY=${JSON.stringify({ passed: summary.passed, checks: results.length, failures: failures.length })}`);
if (failures.length) {
  for (const failure of failures) console.error(`BROWSER_UAT_FAIL ${failure.actor}: ${failure.error.split('\n')[0]}`);
  process.exit(1);
}
console.log('Full production browser UAT PASS for Merchandiser, SPG, Supervisor, Manager, Head, Superadmin');
