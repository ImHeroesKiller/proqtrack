import test from 'node:test';
import assert from 'node:assert/strict';
import {handleIdentityRead} from '../worker/identity-read.js';

const json=(data,status=200,headers={})=>({data,status,headers});
const audit=async()=>{};
const env={DB:{}};

function context(path,{method='GET',role='super_admin'}={}){
  const url=new URL(`https://local.test${path}`);
  return {request:new Request(url,{method}),env,url,claims:{sub:'test',role},requestId:'req-1',json,audit};
}

test('ignores routes outside phase 1 read API',async()=>{
  const response=await handleIdentityRead(context('/api/health'));
  assert.equal(response,null);
});

test('rejects writes on identity endpoints',async()=>{
  const response=await handleIdentityRead(context('/api/identity/employees',{method:'POST'}));
  assert.equal(response.status,405);
  assert.equal(response.data.error,'READ_ONLY_ENDPOINT');
  assert.equal(response.headers.allow,'GET');
});

test('rejects non-privileged access',async()=>{
  const response=await handleIdentityRead(context('/api/identity/employees',{role:'employee'}));
  assert.equal(response.status,403);
  assert.equal(response.data.error,'FORBIDDEN');
});

test('returns not found for unknown privileged read route',async()=>{
  const response=await handleIdentityRead(context('/api/identity/unknown'));
  assert.equal(response.status,404);
  assert.equal(response.data.error,'NOT_FOUND');
});
