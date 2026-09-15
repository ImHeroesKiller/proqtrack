import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as reportTest, nextScheduleAt } from '../worker/reports.js';
import { __test as workflowTest } from '../worker/workflows.js';
import { __test as analyticsTest } from '../worker/analytics.js';
import { classifyRoute } from '../worker/hardening.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('M6 migration evolves report jobs and adds workflow automation schema', async () => {
  const sql = await read('migrations/0010_reporting_workflow_scale.sql');
  assert.match(sql, /ALTER TABLE report_generation_jobs ADD COLUMN organization_id/i);
  assert.match(sql, /ADD COLUMN lease_expires_at/i);
  assert.match(sql, /ADD COLUMN publication_status/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_report_schedule_slot/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_report_schedules/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_workflow_requests/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_workflow_steps/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_workflow_events/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS core_notifications/i);
  assert.match(sql, /idx_core_sales_analytics/i);
});

test('report engine supports bounded server-side report types and CSV escaping', () => {
  assert.deepEqual(reportTest.REPORT_TYPES, ['activity', 'attendance', 'sales', 'surveys', 'operational_summary']);
  assert.deepEqual(reportTest.REPORT_FORMATS, ['csv', 'json']);
  assert.equal(reportTest.csvCell('plain'), 'plain');
  assert.equal(reportTest.csvCell('a,b'), '"a,b"');
  assert.equal(reportTest.csvCell('a"b'), '"a""b"');
  const query = reportTest.buildReportQuery('attendance', 'ORG-1', 'PRJ-1', { from: '2026-09-01', to: '2026-09-30' }, 100, 0);
  assert.match(query.sql, /core_attendance/);
  assert.match(query.sql, /LIMIT \? OFFSET \?/);
  assert.ok(query.binds.includes('ORG-1'));
  assert.ok(query.binds.includes('PRJ-1'));
});

test('report schedules calculate next local run without relying on server timezone', () => {
  const next = nextScheduleAt({ cadence: 'daily', runHour: 7, timezone: 'Asia/Jakarta' }, new Date('2026-09-15T01:00:00Z'));
  assert.equal(next, '2026-09-16 00:00:00');
  const weekly = nextScheduleAt({ cadence: 'weekly', runHour: 9, runDay: 1, timezone: 'Asia/Jakarta' }, new Date('2026-09-15T01:00:00Z'));
  assert.ok(/^2026-09-21 02:00:00$/.test(weekly));
});

test('workflow definitions require staged approval and separation-friendly roles', () => {
  assert.deepEqual(workflowTest.ROLE_STEPS.attendance_correction, ['supervisor', 'manager']);
  assert.deepEqual(workflowTest.ROLE_STEPS.visit_exception, ['supervisor', 'manager']);
  assert.deepEqual(workflowTest.ROLE_STEPS.report_publish, ['head']);
  assert.deepEqual(workflowTest.ROLE_STEPS.survey_reopen, ['manager']);
  assert.equal(workflowTest.projectAllowed({ role: 'manager', projectIds: ['P1'] }, 'P1'), true);
  assert.equal(workflowTest.projectAllowed({ role: 'manager', projectIds: ['P1'] }, 'P2'), false);
});

test('analytics uses scoped projects and opaque cursor roundtrip', () => {
  assert.deepEqual(analyticsTest.scopedProjects({ role: 'manager', projectIds: ['P1', 'P2'] }, ''), ['P1', 'P2']);
  assert.deepEqual(analyticsTest.scopedProjects({ role: 'manager', projectIds: ['P1'] }, 'P2'), []);
  assert.equal(analyticsTest.scopedProjects({ role: 'head', projectIds: [] }, ''), null);
  const encoded = analyticsTest.b64urlEncode({ sort: '2026-09-15 10:00:00', id: 'X1' });
  assert.deepEqual(analyticsTest.b64urlDecode(encoded), { sort: '2026-09-15 10:00:00', id: 'X1' });
  assert.ok(analyticsTest.QUERY_DEFINITIONS.visits);
  assert.ok(analyticsTest.QUERY_DEFINITIONS.sales);
});

test('M6 routes are first-class low-cardinality observability groups', () => {
  assert.equal(classifyRoute('/api/reports'), 'reporting');
  assert.equal(classifyRoute('/api/report-schedules'), 'reporting');
  assert.equal(classifyRoute('/api/workflows/1'), 'workflow');
  assert.equal(classifyRoute('/api/notifications'), 'workflow');
  assert.equal(classifyRoute('/api/analytics/overview'), 'analytics');
  assert.equal(classifyRoute('/api/query/visits'), 'analytics');
});

test('gateway routes M6 APIs before legacy locked data API', async () => {
  const source = await read('worker/main.js');
  assert.match(source, /handleReportRoute/);
  assert.match(source, /handleWorkflowRoute/);
  assert.match(source, /handleAnalyticsRoute/);
  assert.match(source, /enqueueDueReportSchedules/);
  assert.match(source, /processReportQueue/);
  assert.match(source, /recoverExpiredReportLeases/);
  const reporting = source.indexOf('response = await handleReportRoute(request');
  const legacy = source.indexOf('response = await forwardWithAuthoritativeClaims(request');
  assert.ok(reporting >= 0 && legacy > reporting);
});

test('report processor writes private R2 output with lease retry and approval linkage', async () => {
  const source = await read('worker/reports.js');
  assert.match(source, /lease_expires_at=datetime\('now','\+5 minutes'\)/);
  assert.match(source, /reports\/\$\{job\.organization_id\}\/\$\{job\.id\}/);
  assert.match(source, /env\.FILES\.put/);
  assert.match(source, /result_sha256/);
  assert.match(source, /publication_status/);
  assert.match(source, /createWorkflowRequestInternal/);
  assert.match(source, /INSERT OR IGNORE INTO report_generation_jobs/);
});

test('analytics cursor codec uses Worker-standard encoding primitives', async () => {
  const source = await read('worker/analytics.js');
  assert.match(source, /new TextEncoder\(\)/);
  assert.match(source, /new TextDecoder\(\)/);
  assert.doesNotMatch(source, /\bunescape\(/);
  assert.doesNotMatch(source, /\bescape\(/);
});

test('M6 browser bridge exposes analytics reports schedules workflows and notifications', async () => {
  const [client, bootstrap] = await Promise.all([read('src/lib/m6-client.js'), read('assets/logo.js')]);
  assert.match(client, /window\.ProQTrackM6 = M6/);
  assert.match(client, /\/api\/analytics\/overview/);
  assert.match(client, /\/api\/reports/);
  assert.match(client, /\/api\/report-schedules/);
  assert.match(client, /\/api\/workflows/);
  assert.match(client, /\/api\/notifications/);
  assert.match(bootstrap, /m6-client\.js/);
});

test('M6 config keeps legacy APIs locked and bounds report workload', async () => {
  const config = await read('wrangler.jsonc');
  assert.match(config, /"APP_MILESTONE": "M6"/);
  assert.match(config, /"REPORT_MAX_ROWS": "20000"/);
  assert.match(config, /"REPORT_BATCH_ROWS": "1000"/);
  assert.match(config, /"REPORT_QUEUE_MAX_JOBS": "3"/);
  assert.match(config, /"API_REPORT_RATE_LIMIT_PER_MINUTE": "20"/);
  assert.match(config, /"MVP_DATA_API_ENABLED": "false"/);
  assert.match(config, /"MVP_FILE_API_ENABLED": "false"/);
});

test('health checks M6 reporting schema while retaining M5 hardening readiness', async () => {
  const source = await read('worker/hardening.js');
  assert.match(source, /reportingSchemaReady/);
  assert.match(source, /core_report_schedules/);
  assert.match(source, /core_workflow_requests/);
  assert.match(source, /APP_MILESTONE/);
  assert.match(source, /reportingSchema: reportingSchemaReady/);
});
