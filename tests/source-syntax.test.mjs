import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const roots = ['src', 'worker', 'scripts'];
const extensions = new Set(['.js', '.mjs']);

async function collect(dir) {
  const absolute = path.join(root, dir);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(relative));
    else if (extensions.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

test('all runtime JavaScript sources pass Node syntax parsing', async () => {
  const files = ['sw.js'];
  for (const dir of roots) files.push(...await collect(dir));

  const failures = [];
  for (const file of files.sort()) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], {
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      failures.push({
        file,
        output: (result.stderr || result.stdout || '').trim(),
      });
    }
  }

  assert.equal(
    failures.length,
    0,
    failures.map(item => `${item.file}:\n${item.output}`).join('\n\n'),
  );
});
