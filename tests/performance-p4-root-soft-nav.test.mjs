import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('root soft-navigation keeps optional runtime behind authenticated paint', async () => {
  const bootstrap = await read('src/bootstrap.js');
  assert.match(bootstrap, /function afterAuthenticatedPaint\(\)/);
  assert.match(bootstrap, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(bootstrap, /proqtrack:render-complete/);
  assert.match(bootstrap, /requestIdleCallback\(\(\) => run\(\), \{ timeout:5000 \}\)/);
  assert.doesNotMatch(bootstrap, /timeout:2500/);
});

test('bulk upload runtimes are removed from the app critical dependency graph', async () => {
  const app = await read('src/app.js');
  assert.doesNotMatch(app, /^import ['"]\.\/bulk-employees\.js['"];?$/m);
  assert.doesNotMatch(app, /^import ['"]\.\/bulk-master\.js['"];?$/m);
  assert.match(app, /import\('\.\/bulk-employees\.js'\)/);
  assert.match(app, /import\('\.\/bulk-master\.js'\)/);
  assert.match(app, /FT\.openBulkEmployees/);
  assert.match(app, /FT\.openBulkMaster/);
});

test('manager dashboard uses indexed employee and outlet lookup for visible visits', async () => {
  const app = await read('src/app.js');
  const start = app.indexOf('function renderManagerDashboard');
  const end = app.indexOf('function renderSupervisorDashboard', start);
  const body = app.slice(start, end);
  assert.match(body, /const employeeById = new Map/);
  assert.match(body, /const outletById = new Map/);
  assert.match(body, /employeeById\.get\(String\(v\.employeeId\)\)/);
  assert.match(body, /outletById\.get\(String\(v\.outletId\)\)/);
  assert.doesNotMatch(body, /getOutlets\(\)\.find/);
});

test('supervisor dashboard aggregates visit and sales metrics once per render', async () => {
  const app = await read('src/app.js');
  const start = app.indexOf('function renderSupervisorDashboard');
  const end = app.indexOf('function renderDashboard', start);
  const body = app.slice(start, end);
  assert.match(body, /const visitsTodayByEmployee = new Map\(\)/);
  assert.match(body, /const monthSalesByEmployee = new Map\(\)/);
  assert.match(body, /for \(const sale of getProductSales\(\)\)/);
  assert.doesNotMatch(body, /visitsTodayCount\(e\.id\)/);
  assert.doesNotMatch(body, /monthSalesAmount\(e\.id\)/);
});

test('idle optional modules stop compiling when page is hidden', async () => {
  const bootstrap = await read('src/bootstrap.js');
  assert.match(bootstrap, /document\.visibilityState !== 'visible'/);
  assert.match(bootstrap, /if \(!window\.FT\?\.state\?\.loggedIn/);
});
