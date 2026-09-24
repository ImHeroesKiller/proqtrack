import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Project module visibility reads authoritative project.modules first', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /projects = \(db\.projects \|\| \[\]\)\.filter\(\(p\) => ids\.has\(p\.id\)\)/);
  assert.match(src, /const modules = p\.modules \|\| legacySettings\[p\.id\]\?\.modules \|\| defaultModules\(\)/);
  assert.match(src, /return modules\?\.\[m\] !== false/);
});
