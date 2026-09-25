import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  managedRoles,
  canManageAccount,
  canChangeAccountStatus,
  filterAccountRows,
  settingsTabsFor,
  accountErrorMessage,
  settingsConfirmMarkup,
} from '../src/lib/settings-ui.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Settings P3 UI role policy stays least-privilege and mirrors server hierarchy', async () => {
  assert.deepEqual(managedRoles('superadmin'), ['head','admin','manager','supervisor','employee']);
  assert.deepEqual(managedRoles('head'), ['admin','manager','supervisor','employee']);
  assert.deepEqual(managedRoles('admin'), ['manager','supervisor','employee']);
  assert.deepEqual(managedRoles('manager'), []);
  assert.deepEqual(managedRoles('supervisor'), []);
  assert.deepEqual(managedRoles('employee'), []);

  assert.equal(canManageAccount({ id:'A', role:'admin' }, { id:'B', role:'manager' }), true);
  assert.equal(canManageAccount({ id:'A', role:'admin' }, { id:'B', role:'head' }), false);
  assert.equal(canManageAccount({ id:'A', role:'head' }, { id:'A', role:'head' }), true);
  assert.equal(canChangeAccountStatus({ id:'A', role:'head' }, { id:'A', role:'head' }), false);

  const server = await read('worker/accounts.js');
  assert.match(server, /if \(actor === 'superadmin'\) return true/);
  assert.match(server, /if \(actor === 'head'\) return target !== 'head'/);
  assert.match(server, /if \(actor === 'admin'\) return \['manager','supervisor','employee'\]\.includes\(target\)/);
});

test('Settings P3 pure account filtering is deterministic', () => {
  const rows = [
    { name:'Alpha Manager', email:'alpha@example.com', role:'manager', status:'active' },
    { name:'Beta Sales', email:'beta@example.com', role:'employee', status:'suspended' },
    { name:'Gamma Sales', email:'gamma@example.com', role:'employee', status:'active' },
  ];
  assert.deepEqual(filterAccountRows(rows,{ query:'sales' }).map(row => row.email), ['beta@example.com','gamma@example.com']);
  assert.deepEqual(filterAccountRows(rows,{ role:'employee', status:'active' }).map(row => row.email), ['gamma@example.com']);
  assert.deepEqual(filterAccountRows(rows,{ query:'ALPHA', role:'manager' }).map(row => row.email), ['alpha@example.com']);
});

test('Settings P3 tab composition is role-aware without renderer duplication', () => {
  assert.deepEqual(settingsTabsFor({ role:'employee' }).map(([id]) => id), ['profil','keamanan','tampilan','perangkat','sesi']);
  assert.deepEqual(settingsTabsFor({ role:'manager' }).map(([id]) => id), ['profil','keamanan','tampilan','katalog','sesi']);
  assert.deepEqual(settingsTabsFor({ role:'admin' }).map(([id]) => id), ['profil','keamanan','tampilan','organisasi','katalog','absensi','sesi']);
});

test('Settings P3 centralized errors and confirmation markup preserve UX/security context', () => {
  assert.equal(
    accountErrorMessage({ code:'PROJECT_REQUIRED', payload:{ requestId:'REQ-123' } }),
    'Project wajib dipilih untuk role Manager. Ref: REQ-123',
  );
  const markup = settingsConfirmMarkup({
    title:'<Reset?>',
    message:'A & B',
    confirmLabel:'Reset',
  });
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.doesNotMatch(markup, /<Reset\?>/);
  assert.match(markup, /&lt;Reset\?&gt;/);
  assert.match(markup, /A &amp; B/);
});

test('Settings P3 orchestration file no longer owns policy helpers or runtime CSS injection', async () => {
  const [settings, helper, css, index] = await Promise.all([
    read('src/account-settings.js'),
    read('src/lib/settings-ui.js'),
    read('assets/settings.css'),
    read('index.html'),
  ]);

  assert.match(settings, /from '.\/lib\/settings-ui\.js'/);
  assert.match(settings, /settingsTabsFor\(acc\)/);
  assert.match(settings, /filterAccountRows\(allRows/);
  assert.match(settings, /settingsConfirmMarkup\(view\)/);

  assert.doesNotMatch(settings, /function roleLabel\(/);
  assert.doesNotMatch(settings, /function accountErrorMessage\(/);
  assert.doesNotMatch(settings, /function setSubmitBusy\(/);
  assert.doesNotMatch(settings, /function installStyles\(/);
  assert.doesNotMatch(settings, /style\.textContent/);

  assert.match(helper, /export function managedRoles/);
  assert.match(helper, /export function filterAccountRows/);
  assert.match(css, /\.am-settings\{/);
  assert.match(css, /@media\(max-width:800px\)/);
  assert.match(index, /<link rel="stylesheet" href="\.\/assets\/settings\.css" \/>/);
});
