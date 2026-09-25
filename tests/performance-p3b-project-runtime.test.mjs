import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('P3B project management migration is physically extracted behind orchestrator', async () => {
  const [index, migration] = await Promise.all([
    read('src/types/index.js'),
    read('src/types/project-management-migration.js'),
  ]);

  assert.match(index, /createProjectManagementMigration/);
  assert.match(index, /const \{ defaultModules, migrateV7 \} = projectManagementMigration/);
  assert.doesNotMatch(index, /if \(allowLegacyDemoSeed && !db\.clients\.length\)/);

  assert.match(migration, /export function createProjectManagementMigration/);
  assert.match(migration, /if \(allowLegacyDemoSeed && !db\.clients\.length\)/);
  assert.match(migration, /db\.projectAssignments = rows/);
  assert.match(migration, /projectSettings\.push/);
});

test('P3B migration module stays persistence-agnostic and dependency injected', async () => {
  const migration = await read('src/types/project-management-migration.js');
  assert.doesNotMatch(migration, /localStorage/);
  assert.doesNotMatch(migration, /window\.FT/);
  assert.match(migration, /readDB/);
  assert.match(migration, /writeDB/);
  assert.match(migration, /DEFAULT_ORG_ID/);
});
