const DEVICE_KEY = 'proqtrack_device_id_v1';
const DEVICE_SECRET_KEY = 'proqtrack_device_secret_v1';
export const SUPERADMIN_HOST_KEY = 'proqtrack_superadmin_host_v1';

function randomId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function readKey(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function writeKey(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export function getDeviceSecret() {
  let secret = readKey(DEVICE_SECRET_KEY);
  if (!secret) {
    secret = `SEC-${randomId()}${randomId()}`;
    writeKey(DEVICE_SECRET_KEY, secret);
  }
  return secret;
}

export function getDeviceIdentity() {
  let id = readKey(DEVICE_KEY);
  if (!id) {
    id = `DEV-${randomId()}`;
    writeKey(DEVICE_KEY, id);
  }
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  const screenObj = typeof screen === 'undefined' ? {} : screen;
  const imei = String(id).replace(/[^a-zA-Z0-9]/g, '').slice(-15).toUpperCase().padStart(15, '0');
  const label = [
    nav.platform || nav.userAgentData?.platform || 'Web',
    nav.userAgentData?.mobile ? 'Mobile' : 'Browser',
    screenObj.width && screenObj.height ? `${screenObj.width}x${screenObj.height}` : '',
  ].filter(Boolean).join(' · ');
  return {
    id,
    secret: getDeviceSecret(),
    imei,
    label,
    userAgent: String(nav.userAgent || '').slice(0, 240),
  };
}

export function isSalesRole(role) {
  return String(role || '').toLowerCase() === 'employee';
}

export function markSuperadminHost(device = getDeviceIdentity()) {
  const payload = {
    id: device.id,
    imei: device.imei,
    label: device.label,
    registeredAt: new Date().toISOString(),
  };
  try { localStorage.setItem(SUPERADMIN_HOST_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
  return payload;
}

export function getSuperadminHost() {
  try {
    const raw = localStorage.getItem(SUPERADMIN_HOST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isSuperadminHostDevice(deviceId = getDeviceIdentity().id) {
  const host = getSuperadminHost();
  return !!(host?.id && deviceId && host.id === deviceId);
}
