const DEFAULT_SESSION_CODES = new Set([
  'AUTH_REQUIRED',
  'INVALID_TOKEN',
  'TOKEN_EXPIRED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'SESSION_REAUTH_REQUIRED',
  'SESSION_CONTEXT_CHANGED',
  'REQUEST_ABORTED',
  'ABORT_ERR',
]);

function normalizedStatus(error) {
  const value = Number(error?.status ?? error?.payload?.status ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function normalizedCode(error) {
  return String(error?.code || error?.name || '').trim().toUpperCase();
}

export function isExpectedRuntimeTransition(error, {
  statuses = [401, 403],
  codes = DEFAULT_SESSION_CODES,
  suppressOffline = true,
} = {}) {
  if (suppressOffline && typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const status = normalizedStatus(error);
  if (statuses.map(Number).includes(status)) return true;

  const code = normalizedCode(error);
  if (codes instanceof Set ? codes.has(code) : Array.from(codes || []).map(value => String(value).toUpperCase()).includes(code)) {
    return true;
  }

  if (code === 'ABORTERROR') return true;
  const message = String(error?.message || error || '').toUpperCase();
  return message.includes('SESSION_CONTEXT_CHANGED')
    || message.includes('THE OPERATION WAS ABORTED')
    || message.includes('SIGNAL IS ABORTED');
}

export function warnUnexpectedRuntime(label, error, options = {}) {
  if (isExpectedRuntimeTransition(error, options)) return false;
  if (typeof console === 'undefined' || typeof console.warn !== 'function') return false;
  console.warn(label, error?.code || error?.message || error);
  return true;
}
