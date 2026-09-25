import { readFile, readdir, stat } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../performance-budget.json', import.meta.url), 'utf8'));
const budgets = config.budgets || {};
const failures = [];
const rows = [];

async function sizeOf(path) {
  return (await stat(path)).size;
}

for (const [path, maxBytes] of Object.entries(budgets.source || {})) {
  const actual = await sizeOf(path);
  rows.push({ metric:path, actual, budget:maxBytes });
  if (actual > maxBytes) failures.push(`${path}: ${actual} > ${maxBytes} bytes`);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes:true });
  const out = [];
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

const srcFiles = await walk('src');
const frontendJs = srcFiles.filter(path => path.endsWith('.js'));
let frontendJsTotal = 0;
for (const path of frontendJs) frontendJsTotal += await sizeOf(path);
rows.push({ metric:'frontend JS total', actual:frontendJsTotal, budget:budgets.frontendJsTotalBytes });
if (frontendJsTotal > budgets.frontendJsTotalBytes) {
  failures.push(`frontend JS total: ${frontendJsTotal} > ${budgets.frontendJsTotalBytes} bytes`);
}

const manifest = JSON.parse(await readFile('dist/precache-manifest.json', 'utf8'));
const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
rows.push({ metric:'precache asset count', actual:assets.length, budget:budgets.distPrecacheAssetCount });
if (assets.length > budgets.distPrecacheAssetCount) {
  failures.push(`precache asset count: ${assets.length} > ${budgets.distPrecacheAssetCount}`);
}

let precacheBytes = 0;
for (const asset of assets) {
  const relative = String(asset).replace(/^\.\//, '');
  precacheBytes += await sizeOf(`dist/${relative}`);
}
rows.push({ metric:'precache total bytes', actual:precacheBytes, budget:budgets.distPrecacheTotalBytes });
if (precacheBytes > budgets.distPrecacheTotalBytes) {
  failures.push(`precache total bytes: ${precacheBytes} > ${budgets.distPrecacheTotalBytes} bytes`);
}

const report = {
  version: config.version || 1,
  generatedAt: new Date().toISOString(),
  metrics: rows,
  ok: failures.length === 0,
  failures,
};
await import('node:fs/promises').then(({ writeFile }) =>
  writeFile('dist/performance-budget-report.json', JSON.stringify(report, null, 2) + '\n', 'utf8')
);

for (const row of rows) {
  const pct = row.budget ? Math.round((row.actual / row.budget) * 100) : 0;
  console.log(`[perf-budget] ${row.metric}: ${row.actual} / ${row.budget} bytes (${pct}%)`);
}

if (failures.length) {
  console.error('[perf-budget] FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log('[perf-budget] PASS');
}
