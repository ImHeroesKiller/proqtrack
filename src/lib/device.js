const DEVICE_KEY = 'proqtrack_device_id_v1';

function randomId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function getDeviceIdentity() {
  let id = '';
  try { id = localStorage.getItem(DEVICE_KEY) || ''; } catch { /* ignore */ }
  if (!id) {
    id = `DEV-${randomId()}`;
    try { localStorage.setItem(DEVICE_KEY, id); } catch { /* ignore */ }
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
    imei,
    label,
    userAgent: String(nav.userAgent || '').slice(0, 240),
  };
}

export function isSalesRole(role) {
  return String(role || '').toLowerCase() === 'employee';
}
