import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Settings P2 replaces native destructive confirms with in-app confirmation flow', async () => {
  const [settings, helper] = await Promise.all([
    read('src/account-settings.js'),
    read('src/lib/settings-ui.js'),
  ]);
  assert.doesNotMatch(settings, /\bconfirm\(/);
  assert.match(settings, /function openSettingsConfirm/);
  assert.match(settings, /settingsConfirmMarkup\(view\)/);
  assert.match(settings, /async runPendingConfirm\(\)/);
  assert.match(settings, /action:'logoutAll'/);
  assert.match(settings, /action:'resetDevice'/);
  assert.match(settings, /action:'toggleStatus'/);
  assert.match(helper, /role="dialog"/);
  assert.match(helper, /aria-modal="true"/);
});

test('Settings P2 standardizes form busy states and duplicate action feedback', async () => {
  const [settings, helper] = await Promise.all([
    read('src/account-settings.js'),
    read('src/lib/settings-ui.js'),
  ]);
  assert.match(helper, /export function setSubmitBusy/);
  assert.match(helper, /submit\.disabled = true/);
  assert.match(helper, /submit\.setAttribute\('aria-busy','true'\)/);
  assert.match(settings, /preferenceSaveInFlight/);
  assert.match(settings, /setSubmitBusy\(form,true,'Menyimpan profil…'\)/);
  assert.match(settings, /setSubmitBusy\(form,true,'Memperbarui…'\)/);
  assert.match(settings, /setSubmitBusy\(form,true,'Menyimpan organisasi…'\)/);
  assert.match(settings, /setSubmitBusy\(form,true,id \? 'Menyimpan…' : 'Membuat akun…'\)/);
});

test('Settings P2 organization and account refresh expose retryable inline state without toast loops', async () => {
  const settings = await read('src/account-settings.js');
  assert.match(settings, /organizationProfileAttemptedOrg/);
  assert.match(settings, /organizationProfileSyncError/);
  assert.match(settings, /async refreshOrganizationProfile\(\)/);
  assert.match(settings, /accountSyncAttemptedOrg/);
  assert.match(settings, /accountSyncError/);
  assert.match(settings, /accountSyncLastAt/);
  assert.match(settings, /async refreshAccounts\(\)/);
  assert.match(settings, /class="am-sync-row/);
  assert.doesNotMatch(settings, /toast\(\`Sinkronisasi akun gagal:/);
});

test('Settings P2 account filtering is debounced, resettable and result-aware', async () => {
  const settings = await read('src/account-settings.js');
  assert.match(settings, /let accountFilterTimer = null/);
  assert.match(settings, /setTimeout\(\(\) => \{[\s\S]*\},180\)/);
  assert.match(settings, /requestAnimationFrame/);
  assert.match(settings, /clearAccountFilters\(\)/);
  assert.match(settings, /<strong>\$\{rows\.length\}<\/strong> dari \$\{allRows\.length\} akun/);
  assert.match(settings, /Tidak ada akun sesuai filter/);
  assert.match(settings, /Reset filter/);
});

test('Settings P2 Accounts uses server device status only and mobile card semantics', async () => {
  const [settings, css] = await Promise.all([
    read('src/account-settings.js'),
    read('assets/settings.css'),
  ]);
  assert.doesNotMatch(settings, /deviceId/);
  assert.match(settings, /a\.deviceBound/);
  assert.match(settings, /data-label="Akun"/);
  assert.match(settings, /data-label="Aksi"/);
  assert.match(css, /\.am-account-table thead\{display:none\}/);
  assert.match(css, /\.am-account-table td::before\{content:attr\(data-label\)/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /\.am-account-actions\{display:grid;grid-template-columns:1fr\}/);
});

test('Settings P2 mobile Settings tabs are accessible and horizontally scrollable', async () => {
  const [settings, css] = await Promise.all([
    read('src/account-settings.js'),
    read('assets/settings.css'),
  ]);
  assert.match(settings, /role="tablist"/);
  assert.match(settings, /role="tab"/);
  assert.match(settings, /aria-selected=/);
  assert.match(settings, /role="tabpanel"/);
  assert.match(css, /\.am-tabs\{flex-wrap:nowrap;overflow-x:auto/);
  assert.match(css, /\.am-tab\{flex:0 0 auto\}/);
});

test('Settings P2 closes copy and empty-state dead ends', async () => {
  const settings = await read('src/account-settings.js');
  assert.match(settings, /Katalog outlet per project/);
  assert.match(settings, /Tidak ada project aktif/);
  assert.match(settings, /Simpan katalog outlet/);
  assert.match(settings, /Project \(wajib untuk Manager\)/);
  assert.match(settings, /Hanya Superadmin, Head, dan Admin yang dapat mengelola akun organisasi/);
  assert.doesNotMatch(settings, /Only Superadmin, Head, and Admin/);
  assert.doesNotMatch(settings, /Save outlet catalog/);
});
