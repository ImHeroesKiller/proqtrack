import test from 'node:test';
import assert from 'node:assert/strict';
import { signClaims, verifyToken } from '../worker/index.js';

const secret='test-secret-at-least-32-characters-long';

test('accepts a valid signed token',async()=>{
  const claims={sub:'ACC-1',role:'manager',projectIds:['PRJ-1'],exp:2_000_000_000};
  const token=await signClaims(claims,secret);
  assert.deepEqual(await verifyToken(token,secret,1_900_000_000),claims);
});

test('rejects a modified token',async()=>{
  const token=await signClaims({sub:'ACC-1',role:'employee',exp:2_000_000_000},secret);
  const [payload,signature]=token.split('.');
  await assert.rejects(()=>verifyToken(`${payload}x.${signature}`,secret,1_900_000_000),/INVALID_TOKEN/);
});

test('rejects an expired token',async()=>{
  const token=await signClaims({sub:'ACC-1',role:'employee',exp:100},secret);
  await assert.rejects(()=>verifyToken(token,secret,101),/TOKEN_EXPIRED/);
});

test('rejects claims without identity and role',async()=>{
  const token=await signClaims({exp:2_000_000_000},secret);
  await assert.rejects(()=>verifyToken(token,secret,1_900_000_000),/INVALID_TOKEN/);
});
