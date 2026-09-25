import test from 'node:test';
import assert from 'node:assert/strict';
import { isExpectedRuntimeTransition } from '../src/lib/console-hygiene.js';

test('production console hygiene suppresses expected auth/session transitions', () => {
  assert.equal(isExpectedRuntimeTransition({ status:401, code:'AUTH_REQUIRED' }, { suppressOffline:false }), true);
  assert.equal(isExpectedRuntimeTransition({ status:403 }, { suppressOffline:false }), true);
  assert.equal(isExpectedRuntimeTransition({ code:'SESSION_CONTEXT_CHANGED' }, { suppressOffline:false }), true);
  assert.equal(isExpectedRuntimeTransition({ name:'AbortError', message:'The operation was aborted' }, { suppressOffline:false }), true);
});

test('production console hygiene preserves actionable runtime failures', () => {
  assert.equal(isExpectedRuntimeTransition({ status:500, code:'INTERNAL_ERROR' }, { suppressOffline:false }), false);
  assert.equal(isExpectedRuntimeTransition(new Error('chunk failed'), { suppressOffline:false }), false);
});
