import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/utils.js';
import { seedAccounts } from '../src/data/seed.js';
import { buildUatDatabase, VERSION as UAT_SEED_VERSION } from '../src/data/uat-seed-v1.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HASH = /^sha256\$[0-9a-f]{64}$/;
const FORBIDDEN = [
  'Proqpay2026',
  'DEMO_PASSWORD',
  'upgradeLegacyDemoPasswords',
  'demo123',
];
const SOURCE_FILES = [
  'src/data/seed.js',
  'src/data/uat-seed-v1.js',
  'src/lib/db.js',
  'README.md',
  '.github/workflows/cloudflare-mvp.yml',
  '.github/workflows/ci.yml',
  '.github/dependabot.yml',
];

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

test('seed accounts store hashes only', () => {
  assert.ok(seedAccounts.length >= 4);
  for (const account of seedAccounts) {
    assert.match(account.password, HASH, account.email);
    assert.equal(hashPassword(account.password), account.password);
  }
});

test('UAT seed accounts store hashes only and bump to v7', () => {
  assert.equal(UAT_SEED_VERSION, 7);
  const accounts = buildUatDatabase().accounts;
  assert.ok(accounts.some(a => a.role === 'superadmin'));
  for (const account of accounts) {
    assert.match(account.password, HASH, account.email);
    assert.equal(hashPassword(account.password), account.password);
  }
});

test('UAT apply() is a no-op in Node', () => {
  assert.equal(typeof window, 'undefined');
});

test('public source does not contain published demo passwords or auto-mint', () => {
  for (const rel of SOURCE_FILES) {
    const text = read(rel);
    for (const needle of FORBIDDEN) {
      assert.equal(text.includes(needle), false, `${rel} still contains ${needle}`);
    }
  }
  const db = read('src/lib/db.js');
  assert.match(db, /function ensurePlatformAccounts/);
  assert.doesNotMatch(db, /Superadmin ProQTrack/);
  assert.doesNotMatch(db, /const hasSuper/);
  assert.match(db, /rotateRetiredSeedPasswords/);
  assert.match(db, /export function resumeSession/);
  assert.match(db, /function deviceBindingOf/);
  assert.match(db, /export \{ getActor \}/);
  const uat = read('src/data/uat-seed-v1.js');
  assert.match(uat, /typeof window==='undefined'/);
  const workflow = read('.github/workflows/cloudflare-mvp.yml');
  assert.match(workflow, /wrangler whoami/);
  assert.match(workflow, /secret put API_AUTH_SECRET/);
  assert.match(workflow, /already present/);
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /npm test/);
  const dependabot = read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: npm/);
  for (const rel of ['tests/acl.test.mjs', 'tests/device.test.mjs', 'tests/schema.test.mjs']) {
    assert.doesNotMatch(read(rel), /Pqt-UAT/);
  }
});
