import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VISITS_PAGE_SIZE, visitMatchesFilters, paginateVisits, visitCorrectionErrorMessage } from '../src/lib/visit-ui.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Visits P3 helper keeps filtering logic independent from DOM', () => {
  const visit = { status:'in_progress', employeeId:'EMP-1', projectId:'PRJ-1', outletId:'OUT-1', date:'2026-09-24' };
  assert.equal(visitMatchesFilters(visit,{ status:'checked-in', employeeId:'EMP-1', projectId:'PRJ-1', outletId:'OUT-1', dateFrom:'2026-09-24', dateTo:'2026-09-24', search:'alpha' },'Alpha Outlet'),true);
  assert.equal(visitMatchesFilters(visit,{ status:'completed' },'Alpha Outlet'),false);
});

test('Visits P3 pagination is bounded and deterministic', () => {
  const items = Array.from({length:45},(_,i)=>i);
  const page = paginateVisits(items,3,VISITS_PAGE_SIZE);
  assert.equal(page.currentPage,3);
  assert.equal(page.pageCount,3);
  assert.equal(page.from,41);
  assert.equal(page.to,45);
  assert.deepEqual(page.items,[40,41,42,43,44]);
});

test('Visits P3 exposes user-safe correction errors', () => {
  assert.match(visitCorrectionErrorMessage('WORKFLOW_ALREADY_PENDING'),/masih menunggu persetujuan/);
  assert.doesNotMatch(visitCorrectionErrorMessage('SOME_INTERNAL_ERROR'),/SOME_INTERNAL_ERROR/);
});

test('Visits P3 adds accessibility and PWA wiring', async () => {
  const app = await read('src/app.js');
  const html = await read('index.html');
  const sw = await read('sw.js');
  assert.match(app,/role="status" aria-live="polite"/);
  assert.match(app,/visitMatchesFilters/);
  assert.match(app,/paginateVisits/);
  assert.match(html,/\.sr-only/);
  assert.match(sw,/src\/lib\/visit-ui\.js/);
  assert.match(sw,/proqtrack-v12\.39/);
});
