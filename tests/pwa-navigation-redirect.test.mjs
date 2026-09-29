import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('PWA navigation shell never returns cached index.html redirect responses', async () => {
  const sw = await read('sw.js');
  const fallbackStart = sw.indexOf('const FALLBACK_SHELL = [');
  const fallbackEnd = sw.indexOf('];', fallbackStart);
  const fallback = sw.slice(fallbackStart, fallbackEnd);

  assert.match(fallback, /'\.\/'/);
  assert.doesNotMatch(fallback, /\.\/index\.html/);
  assert.match(sw, /cache\.match\('\.\/'\)/);
  assert.doesNotMatch(sw, /cache\.match\('\.\/index\.html'\)/);
});

test('PWA sanitizes redirected navigation responses before respondWith', async () => {
  const sw = await read('sw.js');

  assert.match(sw, /async function normalizeNavigationResponse\(response\)/);
  assert.match(sw, /response\.type === 'opaqueredirect'/);
  assert.match(sw, /if \(!response\.redirected\) return response/);
  assert.match(sw, /new Response\(await response\.arrayBuffer\(\)/);
  assert.match(sw, /headers\.delete\('content-length'\)/);
});

test('PWA network navigation fallback explicitly follows redirects on canonical shell', async () => {
  const sw = await read('sw.js');
  const start = sw.indexOf('async function navigationResponse');
  const end = sw.indexOf('function isRuntimeCacheable', start);
  const block = sw.slice(start, end);

  assert.match(block, /new URL\('\.\/', self\.registration\.scope\)/);
  assert.match(block, /redirect:'follow'/);
  assert.doesNotMatch(block, /fetch\(request\)/);
});

test('build keeps index.html in release hashing but excludes it from precache manifest', async () => {
  const build = await read('scripts/build.mjs');

  assert.match(build, /const shell = new Set\(\[/);
  assert.match(build, /"index\.html"/);
  assert.match(build, /const precachePaths = shellPaths\.filter\(path => path !== "index\.html"\)/);
  assert.match(build, /const assets = precachePaths\.map/);
});
