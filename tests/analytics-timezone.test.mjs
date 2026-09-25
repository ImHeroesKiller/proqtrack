import test from 'node:test';
import assert from 'node:assert/strict';
import { __analyticsTime, __test } from '../worker/analytics.js';

test('Jakarta local day converts to the correct UTC boundary across midnight', () => {
  assert.equal(
    __analyticsTime.zonedMidnightUtc('2026-09-26', 'Asia/Jakarta'),
    '2026-09-25T17:00:00.000Z',
  );
  assert.equal(
    __analyticsTime.zonedMidnightUtc('2026-09-27', 'Asia/Jakarta'),
    '2026-09-26T17:00:00.000Z',
  );
  assert.equal(__analyticsTime.timezoneOffsetMinutes('2026-09-25T17:00:00.000Z', 'Asia/Jakarta'), 420);
});

test('analytics default range uses the organization local calendar instead of UTC date', () => {
  const utcLate = new Date('2026-09-25T17:30:00.000Z');
  assert.equal(__test.localDateAt(utcLate, 'Asia/Jakarta'), '2026-09-26');
  assert.equal(__test.localDateAt(utcLate, 'UTC'), '2026-09-25');
});

test('analytics uses half-open UTC timestamp ranges for instant-based entities', async () => {
  const source = await import('node:fs/promises').then(fs =>
    fs.readFile(new URL('../worker/analytics.js', import.meta.url), 'utf8')
  );
  assert.match(source, /datetime\(COALESCE\(completed_at,started_at,scheduled_at,created_at\)\) >= datetime\(\?\)/);
  assert.match(source, /datetime\(sold_at\) >= datetime\(\?\) AND datetime\(sold_at\) < datetime\(\?\)/);
  assert.match(source, /datetime\(COALESCE\(submitted_at,created_at\)\) >= datetime\(\?\)/);
  assert.match(source, /localDateOnly: true/);
  assert.match(source, /timezone FROM core_organizations/);
});

test('Jakarta event just after local midnight belongs to the new local day window', () => {
  const from = Date.parse(__analyticsTime.zonedMidnightUtc('2026-09-26', 'Asia/Jakarta'));
  const to = Date.parse(__analyticsTime.zonedMidnightUtc('2026-09-27', 'Asia/Jakarta'));
  const event = Date.parse('2026-09-25T17:37:00.000Z');
  assert.ok(event >= from && event < to);
});
