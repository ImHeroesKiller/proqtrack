import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, passwordMatches, publicAccount } from '../src/lib/utils.js';

test('hashes plaintext and matches the original', () => {
  const hashed = hashPassword('demo123');
  assert.match(hashed, /^sha256\$[0-9a-f]{64}$/);
  assert.equal(passwordMatches(hashed, 'demo123'), true);
  assert.equal(passwordMatches(hashed, 'wrong'), false);
});

test('does not re-hash an existing digest', () => {
  const hashed = hashPassword('demo123');
  assert.equal(hashPassword(hashed), hashed);
});

test('publicAccount strips password', () => {
  const safe = publicAccount({ id: 'ACC1', email: 'a@b.c', password: 'secret' });
  assert.equal(safe.password, undefined);
  assert.equal(safe.email, 'a@b.c');
});
