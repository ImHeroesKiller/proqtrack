import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { __test as orgServer } from '../worker/organizations.js';
import { normalizeThemeColor, organizationTheme } from '../src/lib/organization-branding.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('organization admin normalizes codes and preserves profile metadata', () => {
  assert.equal(orgServer.normalizeCode(' mkb sales 01 '), 'MKBSALES01');
  assert.equal(orgServer.normalizeCode('MKB-01_test'), 'MKB-01_TEST');
  const meta = JSON.parse(orgServer.metadata({
    legalName:'PT Mitra Kreasi Bersama',
    industry:'Outsourcing',
    city:'Jakarta',
    notes:'Tenant production',
  }));
  assert.equal(meta.legalName, 'PT Mitra Kreasi Bersama');
  assert.equal(meta.city, 'Jakarta');
  assert.equal(orgServer.validTimezone('Asia/Makassar'), 'Asia/Makassar');
  assert.equal(orgServer.validTimezone('Mars/Olympus'), '');
  const logo = 'data:image/png;base64,' + Buffer.from('ok').toString('base64');
  assert.equal(orgServer.normalizedLogo(logo), logo);
  assert.throws(() => orgServer.normalizedLogo('data:image/svg+xml;base64,PHN2Zz4='), /ORGANIZATION_LOGO_INVALID/);
});

test('organization create is D1 authoritative and starts cloud cutover', async () => {
  const worker = await read('worker/organizations.js');
  assert.match(worker, /INSERT INTO core_organizations/);
  assert.match(worker, /INSERT INTO core_sync_state/);
  assert.match(worker, /VALUES\(\?,0,'cloud'/);
  assert.match(worker, /ORGANIZATION_ADMIN_FORBIDDEN/);
  assert.match(worker, /ACTIVE_ORGANIZATION_CANNOT_BE_DISABLED/);
  assert.doesNotMatch(worker, /localStorage/);
});

test('organization UI no longer writes local-only organization records', async () => {
  const ui = await read('src/organization.js');
  assert.match(ui, /await createCloudOrganization/);
  assert.match(ui, /await updateCloudOrganization/);
  assert.match(ui, /await this\.switchTo\(org\.id/);
  assert.doesNotMatch(ui, /createOrganization\(data\)/);
  assert.doesNotMatch(ui, /updateOrganization\(id, data\)/);
});

test('M7 health, PWA and deployment smoke include organization authority', async () => {
  const [hardening, sw, main, workflow, migration] = await Promise.all([
    read('worker/hardening.js'),
    read('sw.js'),
    read('worker/main.js'),
    read('.github/workflows/cloudflare-mvp.yml'),
    read('migrations/0014_cloud_organization_admin.sql'),
  ]);
  assert.match(hardening, /metadata_json/);
  assert.match(sw, /proqtrack-v12/);
  assert.match(sw, /cloud-organizations\.js/);
  assert.match(main, /handleOrganizationAdminRoute/);
  assert.match(workflow, /\/api\/admin\/organizations/);
  assert.match(migration, /ALTER TABLE core_organizations ADD COLUMN metadata_json/);
});


test('current organization profile is authoritative and separated from superadmin lifecycle', async () => {
  const [worker, main, client, settings, app, preview] = await Promise.all([
    read('worker/organizations.js'),
    read('worker/main.js'),
    read('src/lib/cloud-organizations.js'),
    read('src/account-settings.js'),
    read('src/app.js'),
    read('src/reports/phase4-preview.js'),
  ]);
  assert.match(worker, /\/api\/organization\/profile/);
  assert.match(worker, /PROFILE_ROLES = new Set\(\['superadmin','head','admin'\]\)/);
  assert.match(worker, /update_organization_profile/);
  assert.match(worker, /ORGANIZATION_TIMEZONE_INVALID/);
  assert.match(worker, /ORGANIZATION_LOGO_TOO_LARGE/);
  assert.match(main, /url\.pathname === '\/api\/organization\/profile'/);
  assert.match(client, /syncCurrentOrganizationProfile/);
  assert.match(client, /updateCurrentOrganizationProfile/);
  assert.match(settings, /await updateCurrentOrganizationProfile/);
  assert.doesNotMatch(settings, /updateAppSettings\(\{ companyName:/);
  assert.doesNotMatch(settings, /image\/svg\+xml/);
  assert.match(settings, /organizationSaveInFlight/);
  assert.match(settings, /192 \* 1024/);
  assert.match(app, /const activeBrand = getOrganization\(getCurrentOrgId\(\)\)/);
  assert.match(preview, /org=organization\(db\)/);
  assert.match(preview, /org\.logo/);
  assert.match(preview, /org\.name/);
});

test('organization lifecycle UI blocks active-tenant disable and duplicate mutations', async () => {
  const ui = await read('src/organization.js');
  assert.match(ui, /const isCurrent = .*getCurrentOrgId/);
  assert.match(ui, /Workspace aktif tidak dapat dinonaktifkan/);
  assert.match(ui, /organizationSaveInFlight/);
  assert.match(ui, /organizationSwitchInFlight/);
  assert.match(ui, /const db = getDB\(\)/);
  assert.doesNotMatch(ui, /JSON\.parse\(localStorage\.getItem\('proqtrack_db_v6'\)/);
});


test('organization theme color is validated and derives a full tenant palette', () => {
  assert.equal(orgServer.normalizedThemeColor('#2563EB'), '#2563eb');
  assert.throws(() => orgServer.normalizedThemeColor('orange'), /ORGANIZATION_THEME_INVALID/);
  assert.equal(normalizeThemeColor('#0F766E'), '#0f766e');
  const theme = organizationTheme({ themeColor:'#2563eb' });
  assert.equal(theme.brand, '#2563eb');
  assert.match(theme.dark, /^#[0-9a-f]{6}$/);
  assert.match(theme.bright, /^#[0-9a-f]{6}$/);
  assert.equal(theme.rgb, '37, 99, 235');
});

test('full application branding follows the active organization profile', async () => {
  const [settings, app, cutover, entry, logo, themeCss, worker] = await Promise.all([
    read('src/account-settings.js'),
    read('src/app.js'),
    read('src/cloud-cutover.js'),
    read('src/entry.js'),
    read('assets/logo.js'),
    read('assets/org-theme.css'),
    read('worker/organizations.js'),
  ]);
  assert.match(settings, /name="themeColor"/);
  assert.match(settings, /type="color"/);
  assert.match(settings, /previewThemeColor/);
  assert.match(settings, /selectThemeColor/);
  assert.match(settings, /themeColor:normalizeThemeColor/);
  assert.match(app, /applyOrganizationBranding\(currentBrand\)/);
  assert.match(app, /brand\.name \|\| 'ProQTrack'/);
  assert.match(cutover, /syncCurrentOrganizationProfile/);
  assert.match(entry, /dataset\.orgBranding === '1'/);
  assert.match(logo, /assets\/org-theme\.css/);
  assert.match(themeCss, /--brand-rgb/);
  assert.match(themeCss, /html\[data-org-branding="1"\] \.btn-primary/);
  assert.match(themeCss, /html\[data-org-branding="1"\] \.sidebar-logo img/);
  assert.match(worker, /themeColor:/);
});


test('report preview inherits organization theme color', async () => {
  const preview = await read('src/reports/phase4-preview.js');
  assert.match(preview, /--r4-brand:/);
  assert.match(preview, /org\.themeColor/);
  assert.match(preview, /var\(--r4-brand/);
});
