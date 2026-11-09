// Server acknowledgement must match the recorded device evidence before the UI says "berhasil".
const canonicalStatus = value => String(value || '').toLowerCase() === 'in_progress'
  ? 'checked-in' : String(value || '').toLowerCase();

function sameCoordinate(a, b) {
  if (a == null || a === '' || b == null || b === '') return false;
  const x = Number(a), y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 0.000001;
}

function sameTime(a, b) {
  if (!a || !b) return false;
  const x = Date.parse(String(a)), y = Date.parse(String(b));
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}

export function visitCloudEvidenceMatches(localVisit, cloudVisit) {
  if (!localVisit?.id || String(localVisit.id) !== String(cloudVisit?.id || '')) return false;
  const expected = canonicalStatus(localVisit.status);
  const actual = canonicalStatus(cloudVisit.status);
  if (expected === 'checked-in' && !['checked-in', 'completed'].includes(actual)) return false;
  if (expected === 'completed' && actual !== 'completed') return false;
  if (!['checked-in', 'completed'].includes(expected)) return false;

  if (!sameCoordinate(localVisit.checkInLat, cloudVisit.checkInLat)
    || !sameCoordinate(localVisit.checkInLng, cloudVisit.checkInLng)
    || !sameTime(localVisit.checkInCapturedAt || localVisit.startedAt,
      cloudVisit.checkInCapturedAt || cloudVisit.startedAt)) return false;

  if (expected === 'completed') {
    if (!sameCoordinate(localVisit.checkOutLat, cloudVisit.checkOutLat)
      || !sameCoordinate(localVisit.checkOutLng, cloudVisit.checkOutLng)
      || !sameTime(localVisit.checkOutCapturedAt || localVisit.completedAt,
        cloudVisit.checkOutCapturedAt || cloudVisit.completedAt)) return false;
  }
  return true;
}
