import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('go-live pipeline gates both canonical worker and custom domain', async () => {
  const workflow = await read('.github/workflows/cloudflare-mvp.yml');
  assert.match(workflow, /PROQTRACK_BASE_URL: https:\/\/proqtrack\.arywibowo\.workers\.dev/);
  assert.match(workflow, /PROQTRACK_CUSTOM_BASE_URL: https:\/\/proqtrack\.msg-os\.com/);
  assert.match(workflow, /Verify custom domain pre-deploy baseline/);
  assert.match(workflow, /Verify custom domain post-deploy health and security/);
  assert.match(workflow, /Verify superadmin login through custom domain/);
  assert.match(workflow, /Custom domain unauthenticated \$path returned HTTP/);
});

test('custom-domain gate validates security headers and M7 dependencies', async () => {
  const workflow = await read('.github/workflows/cloudflare-mvp.yml');
  assert.match(workflow, /PROQTRACK_CUSTOM_HEALTH_URL/);
  assert.match(workflow, /hardeningSchema/);
  assert.match(workflow, /reportingSchema/);
  assert.match(workflow, /uatSchema/);
  assert.match(workflow, /x-content-type-options: nosniff/);
  assert.match(workflow, /x-frame-options: DENY/);
  assert.match(workflow, /strict-transport-security:/);
  assert.match(workflow, /content-security-policy:/);
});
