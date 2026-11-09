import test from 'node:test';
import assert from 'node:assert/strict';
import { visitCloudEvidenceMatches } from '../src/lib/visit-cloud-confirmation.js';

const local = {
  id:'VIS-1', status:'checked-in', checkInLat:-6.199815,
  checkInLng:106.630544, checkInCapturedAt:'2026-11-09T05:10:00.000Z',
};
const cloud = {
  ...local, status:'in_progress',
  startedAt:local.checkInCapturedAt,
};
test('device check-in is confirmed only after exact cloud evidence matches', () => {
  assert.equal(visitCloudEvidenceMatches(local,cloud),true);
  assert.equal(visitCloudEvidenceMatches(local,{...cloud,id:'VIS-2'}),false);
  assert.equal(visitCloudEvidenceMatches(local,{...cloud,status:'planned'}),false);
  assert.equal(visitCloudEvidenceMatches(local,{...cloud,checkInLat:-6.2}),false);
  assert.equal(visitCloudEvidenceMatches(local,{...cloud,startedAt:'2026-11-09T05:11:00.000Z',checkInCapturedAt:null}),false);
  assert.equal(visitCloudEvidenceMatches(local,null),false);
});
test('check-out is not confirmed by cloud check-in alone', () => {
  const checkedOut={
    ...local,status:'completed',checkOutLat:-6.19980,
    checkOutLng:106.63056,checkOutCapturedAt:'2026-11-09T05:40:00.000Z',
  };
  assert.equal(visitCloudEvidenceMatches(checkedOut,cloud),false);
  assert.equal(visitCloudEvidenceMatches(checkedOut,{
    ...cloud,status:'completed',
    checkOutLat:checkedOut.checkOutLat,
    checkOutLng:checkedOut.checkOutLng,
    completedAt:checkedOut.checkOutCapturedAt,
  }),true);
  assert.equal(visitCloudEvidenceMatches(checkedOut,{
    ...cloud,status:'completed',checkOutLat:0,checkOutLng:0,
    completedAt:checkedOut.checkOutCapturedAt,
  }),false);
});
