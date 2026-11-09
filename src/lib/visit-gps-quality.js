// Shared GPS evidence rules for field capture and D1 visit execution.
// Historic offline uploads are allowed, but a newly captured device fix must be fresh.
export const VISIT_GPS_MAX_ACCURACY_M = 50;
export const VISIT_GPS_MAX_FIX_AGE_MS = 60_000;
export const VISIT_GPS_FUTURE_SKEW_MS = 120_000;

export function assessVisitGpsQuality(
  evidence = {},
  { nowMs = Date.now(), allowHistoric = false } = {},
) {
  const accuracyRaw = evidence?.accuracyM;
  if (accuracyRaw == null || accuracyRaw === '') {
    return { ok:false, code:'GPS_ACCURACY_REQUIRED' };
  }
  const accuracyM = Number(accuracyRaw);
  if (!Number.isFinite(accuracyM) || accuracyM <= 0) {
    return { ok:false, code:'GPS_ACCURACY_REQUIRED' };
  }
  if (accuracyM > VISIT_GPS_MAX_ACCURACY_M) {
    return { ok:false, code:'GPS_ACCURACY_LOW', accuracyM, maxAccuracyM:VISIT_GPS_MAX_ACCURACY_M };
  }
  const capturedAt = evidence?.capturedAt;
  const capturedMs = capturedAt == null || capturedAt === '' ? NaN : Date.parse(String(capturedAt));
  if (!Number.isFinite(capturedMs) || capturedMs > nowMs + VISIT_GPS_FUTURE_SKEW_MS) {
    return { ok:false, code:'GPS_TIMESTAMP_INVALID' };
  }
  if (!allowHistoric && nowMs - capturedMs > VISIT_GPS_MAX_FIX_AGE_MS) {
    return { ok:false, code:'GPS_STALE' };
  }
  return { ok:true, accuracyM, capturedAt:new Date(capturedMs).toISOString() };
}
