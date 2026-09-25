import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('P3D build precaches only the critical static dependency graph', async () => {
  const build = await read('scripts/build.mjs');
  assert.match(build, /function staticLocalDependencies/);
  assert.match(build, /const criticalRuntimeEntries = \[/);
  assert.match(build, /"src\/bootstrap\.js"/);
  assert.match(build, /"src\/app\.js"/);
  assert.doesNotMatch(build, /import\\s\*\\\(/);
  assert.doesNotMatch(build, /\\bload\\\(/);
});

test('P3D emergency shell excludes route-lazy and reporting runtimes', async () => {
  const sw = await read('sw.js');
  const start = sw.indexOf('const FALLBACK_SHELL = [');
  const end = sw.indexOf('];', start);
  const fallback = sw.slice(start, end);
  assert.match(fallback, /src\/bootstrap\.js/);
  assert.match(fallback, /src\/app\.js/);
  assert.doesNotMatch(fallback, /types\/index\.js/);
  assert.doesNotMatch(fallback, /reports\/index-v2\.js/);
  assert.doesNotMatch(fallback, /performance-monitor\.js/);
  assert.doesNotMatch(fallback, /pwa-install\.js/);
});

test('P3D dynamic chunks remain eligible for bounded runtime caching', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /const RUNTIME_MAX_ENTRIES = 80/);
  assert.match(sw, /runtimeHit = await runtime\.match\(request\)/);
  assert.match(sw, /isRuntimeCacheable\(new URL\(request\.url\)\)/);
  assert.match(sw, /await putRuntimeCache\(request, response\)/);
});
