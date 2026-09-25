import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('field photo renderers prefer cloud URL before base64 fallback', async () => {
  const [field, gallery] = await Promise.all([
    read('src/field-sales.js'),
    read('src/routes/field-photos-page.js'),
  ]);
  assert.match(field, /safePhotoUrl\(p\.photoUrl \|\| p\.dataUrl\)/);
  assert.match(gallery, /safePhotoUrl\(p\.photoUrl \|\| p\.dataUrl\)/);
  assert.doesNotMatch(field, /safePhotoUrl\(p\.dataUrl \|\| p\.photoUrl\)/);
  assert.doesNotMatch(gallery, /safePhotoUrl\(p\.dataUrl \|\| p\.photoUrl\)/);
});

test('successful field photo upload drops base64 and offline fallback is explicitly queued', async () => {
  const app = await read('src/app.js');
  assert.match(app, /dataUrl: photoUrl \? null : dataUrl/);
  assert.match(app, /photoUrl: photoUrl \|\| ''/);
  assert.match(app, /evidenceStatus: r2Key \? 'ready' : 'queued'/);
  assert.doesNotMatch(app, /photoUrl: photoUrl \|\| dataUrl/);
});

test('legacy field photo normalization does not duplicate cloud URLs into dataUrl', async () => {
  const db = await read('src/lib/db.js');
  assert.match(db, /String\(photo\.photoUrl \|\| ''\)\.startsWith\('data:image\/'\)/);
  assert.match(db, /photoUrl: String\(photo\.photoUrl \|\| ''\)\.startsWith\('data:image\/'\) \? '' : \(photo\.photoUrl \|\| ''\)/);
  assert.doesNotMatch(db, /dataUrl: photo\.dataUrl \|\| photo\.photoUrl \|\| ''/);
});
