import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('logged-out router exposes privacy and terms pages without authentication', async () => {
  const app = await read('src/app.js');
  assert.match(app, /publicRoute === '#\/privacy'/);
  assert.match(app, /publicRoute === '#\/terms-of-reference'/);
  assert.match(app, /renderPublicLegalPage\('privacy'\)/);
  assert.match(app, /renderPublicLegalPage\('terms'\)/);
});

test('login revamp preserves production login controls and adds legal links', async () => {
  const app = await read('src/app.js');
  for (const marker of [
    'login-page-v2','login-shell','login-showcase','login-auth-panel','login-card-v2',
    'loginEmail','loginPassword','FT.handleLogin(event)','FT.toggleLoginPassword(this)',
    'autocomplete="username"','autocomplete="current-password"',
    'Privacy Policy','Terms of Reference',
    'href="#/privacy"','href="#/terms-of-reference"',
  ]) assert.ok(app.includes(marker), `missing ${marker}`);
  assert.match(app, /event\.key==='Enter'/);
  assert.doesNotMatch(app, /D1|Cloudflare|GitHub/);
});

test('desktop login gets two-panel layout while mobile remains single-card', async () => {
  const css = await read('assets/ui-2026.css');
  assert.match(css, /\.login-showcase\s*\{[\s\S]*?display:none/);
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*?\.login-shell\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*?\.login-showcase\s*\{[\s\S]*?display:flex/);
  assert.match(css, /@media \(max-width: 899px\)[\s\S]*?\.login-shell\s*\{[\s\S]*?max-width:380px/);
});

test('public legal pages contain operational privacy and governance coverage', async () => {
  const app = await read('src/app.js');
  for (const marker of [
    'Berlaku sejak','25 September 2026','Informasi yang diproses',
    'Lokasi, foto, dan evidence','Penyimpanan dan keamanan',
    'Tujuan penggunaan','Pengguna dan kewenangan','Akurasi dan integritas data',
    'Perangkat dan keamanan akun','Tanggung jawab organisasi',
  ]) assert.ok(app.includes(marker), `missing legal section: ${marker}`);
  assert.match(app, /tenant isolation/);
  assert.match(app, /role, organisasi, project, dan assignment/);
});

test('legal pages provide accessible return path to login', async () => {
  const app = await read('src/app.js');
  assert.match(app, /aria-label="Kembali ke login"/);
  assert.match(app, /href="#\/login">← Kembali ke Login<\/a>/);
  assert.match(app, /href="#\/login">Kembali ke halaman login →<\/a>/);
});
