import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Projects P1 uses combined search status and client filters', async () => {
  const src = await read('src/types/index.js');
  const helper = await read('src/lib/project-ui.js');
  assert.match(src, /id="projectSearch"/);
  assert.match(src, /id="projectStatusFilter"/);
  assert.match(src, /id="projectClientFilter"/);
  assert.match(src, /projectMatchesFilters/);
  assert.match(helper, /\(!q \|\| search\.includes\(q\)\)/);
  assert.match(helper, /\(!status \|\| String\(project\.status \|\| ''\) === status\)/);
  assert.match(helper, /\(!clientId \|\| String\(project\.clientId \|\| ''\) === clientId\)/);
});

test('Projects P1 waits for authoritative cloud commit before local persistence', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /async saveProject/);
  assert.match(src, /await commitOperationalChanges\((?:\[\{ entity:'projects', op:'upsert', row:data \}\]|authoritativeChanges)\)/);
  assert.match(src, /Project tersimpan dan tersinkron/);
});

test('Projects P1 prevents manager client reassignment in UI and Worker', async () => {
  const src = await read('src/types/index.js');
  const worker = await read('worker/operations.js');
  assert.match(src, /type="hidden" name="clientId"/);
  assert.match(worker, /currentClientId/);
  assert.match(worker, /nextClientId === currentClientId/);
  assert.match(worker, /clientAllowed\(claims, currentClientId\)/);
});

test('Projects P1 validates project identity client period values and lifecycle in Worker', async () => {
  const worker = await read('worker/operations.js');
  assert.match(worker, /validateProjectMutation/);
  for (const code of [
    'PROJECT_NAME_REQUIRED','PROJECT_CODE_REQUIRED','PROJECT_CLIENT_REQUIRED',
    'PROJECT_CLIENT_NOT_FOUND','PROJECT_PERIOD_REQUIRED','PROJECT_INVALID_PERIOD',
    'PROJECT_CODE_CONFLICT','PROJECT_INVALID_STATUS','PROJECT_INVALID_TRANSITION',
    'PROJECT_INVALID_CONTRACT_VALUE','PROJECT_INVALID_TARGET_VISITS','PROJECT_INVALID_TARGET_OUTLETS'
  ]) assert.match(worker, new RegExp(code));
  assert.match(worker, /projectTransitionAllowed/);
  assert.match(worker, /completed:new Set\(\)/);
  assert.match(worker, /cancelled:new Set\(\)/);
});

test('Projects P1 persists module settings through authoritative project metadata', async () => {
  const src = await read('src/types/index.js');
  assert.match(src, /modules: \{ \.\.\.defaultModules\(\),/);
  assert.match(src, /async setModule/);
  assert.match(src, /entity:'projects', op:'upsert', row:nextProject/);
  assert.match(src, /p\?\.modules \|\| db\.projectSettings/);
});

test('Projects P1 advances PWA cache', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /proqtrack-v12\.36/);
});
