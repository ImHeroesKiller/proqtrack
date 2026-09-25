import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('P3C removes legacy demo fixture payload from production project runtime', async () => {
  const migration = await read('src/types/project-management-migration.js');
  assert.doesNotMatch(migration, /allowLegacyDemoSeed|demoSeed/);
  assert.doesNotMatch(migration, /Nusantara Distribusi Prima|Apotek Sehat Sentosa|Retail Execution Jabodetabek/);
  assert.doesNotMatch(migration, /add\("PRJ001"/);
});

test('P3C project navigation contains no code after unconditional return path', async () => {
  const index = await read('src/types/index.js');
  assert.doesNotMatch(index, /applyModuleVisibility\(\);\s*return;\s*let items = \[\]/);
});
