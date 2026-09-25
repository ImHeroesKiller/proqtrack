import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('P3A db decomposition keeps competitor and field photo API stable behind domain module', async () => {
  const [db, domain] = await Promise.all([
    read('src/lib/db.js'),
    read('src/lib/db-competitor-photo.js'),
  ]);

  assert.match(db, /createCompetitorPhotoDomain/);
  assert.match(db, /export function getCompetitors\(\) \{ return competitorPhotoDomain\.getCompetitors\(\); \}/);
  assert.match(db, /export function createFieldPhoto\(data\) \{ return competitorPhotoDomain\.createFieldPhoto\(data\); \}/);
  assert.match(db, /export \{ FIELD_PHOTO_TYPES \}/);

  assert.match(domain, /export function createCompetitorPhotoDomain/);
  assert.match(domain, /assertOrgAdmin\(\)/);
  assert.match(domain, /assertCanAccessEmployee\(owner\)/);
  assert.match(domain, /assertOperationalContext\(getDB\(\), data/);
  assert.match(domain, /function getCompetitorAnalysisSummary\(\)/);
});

test('P3A competitor and photo domain does not own persistence or session state', async () => {
  const domain = await read('src/lib/db-competitor-photo.js');
  assert.doesNotMatch(domain, /localStorage/);
  assert.doesNotMatch(domain, /window\.FT/);
  assert.doesNotMatch(domain, /DB_KEY/);
  assert.doesNotMatch(domain, /function saveDB/);
});
