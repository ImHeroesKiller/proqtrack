// Utility functions for ProQTrack

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

function dateTimeZone() {
  try {
    return JSON.parse(localStorage.getItem('proqtrack_db_v6') || '{}')?.appSettings?.timezone || 'Asia/Jakarta';
  } catch {
    return 'Asia/Jakarta';
  }
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: dateTimeZone() });
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: dateTimeZone() });
}

export function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = deg => (Number(deg) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateDistance(lat1, lng1, lat2, lng2) {
  return Math.round((distanceMeters(lat1, lng1, lat2, lng2) / 1000) * 10) / 10;
}

export function formatEvidenceStamp(date = new Date(), timeZone = dateTimeZone()) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone });
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone });
  const tz = timeZone === 'Asia/Jakarta' ? 'WIB' : timeZone;
  return `${datePart} · ${timePart} ${tz}`;
}

export function stampPhotoEvidence(dataUrl, lines = []) {
  if (typeof document === 'undefined' || !dataUrl) return Promise.resolve(dataUrl);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const pad = Math.max(12, Math.round(img.width * 0.02));
      const lineH = Math.max(16, Math.round(img.width * 0.028));
      const boxH = pad * 2 + lines.length * lineH;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.62)';
      ctx.fillRect(0, img.height - boxH, img.width, boxH);
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(13, Math.round(img.width * 0.024))}px Inter, system-ui, sans-serif`;
      lines.forEach((line, i) => {
        ctx.fillText(String(line || ''), pad, img.height - boxH + pad + (i + 0.75) * lineH);
      });
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => reject(new Error('Failed to stamp photo'));
    img.src = dataUrl;
  });
}

export function timeAgo(timeStr) {
  if (!timeStr) return 'belum update';
  return timeStr;
}

const STATUS_STYLES = {
  active:        'bg-emerald-100 text-emerald-700 border-emerald-200',
  inactive:      'bg-gray-100 text-gray-500 border-gray-200',
  'checked-in':  'bg-blue-100 text-blue-700 border-blue-200',
  completed:     'bg-emerald-100 text-emerald-700 border-emerald-200',
  planned:      'bg-amber-100 text-amber-700 border-amber-200',
  'in-progress': 'bg-blue-100 text-blue-700 border-blue-200',
  hadir:         'bg-emerald-100 text-emerald-700 border-emerald-200',
  terlambat:     'bg-amber-100 text-amber-700 border-amber-200',
  'tidak hadir': 'bg-red-100 text-red-700 border-red-200',
  online:        'bg-emerald-100 text-emerald-700 border-emerald-200',
  offline:       'bg-gray-100 text-gray-500 border-gray-200',
  high:          'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium:        'bg-amber-100 text-amber-700 border-amber-200',
  low:           'bg-red-100 text-red-700 border-red-200',
  pending:       'bg-amber-100 text-amber-700 border-amber-200',
  suspended:     'bg-amber-100 text-amber-700 border-amber-200',
  approved:      'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected:      'bg-red-100 text-red-700 border-red-200',
};

export function visibilityBadge(level) {
  const labels = { high: 'High', medium: 'Medium', low: 'Low' };
  const cls = STATUS_STYLES[level] || STATUS_STYLES.medium;
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}">${labels[level] || level}</span>`;
}

export function normalizeAttendanceStatus(status) {
  const raw = String(status || '').toLowerCase();
  if (['hadir', 'present', 'valid', 'on_time', 'ontime'].includes(raw)) return 'hadir';
  if (['terlambat', 'late', 'flagged'].includes(raw)) return 'terlambat';
  if (['tidak hadir', 'absent', 'rejected', 'no_show'].includes(raw)) return 'tidak hadir';
  return status || '';
}

export function statusBadge(status) {
  const normalized = normalizeAttendanceStatus(status) || status;
  const cls = STATUS_STYLES[normalized] || STATUS_STYLES[status] || 'bg-gray-100 text-gray-600 border-gray-200';
  const label = normalized || status || '—';
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}">${label}</span>`;
}

export function displayValue(value, fallback = '—') {
  if (value === undefined || value === null || value === '') return fallback;
  return value;
}

const ROLE_STYLES = {
  'Field Sales': 'bg-blue-50 text-blue-700',
  Supervisor:    'bg-purple-50 text-purple-700',
  Admin:         'bg-gray-100 text-gray-700',
};

export function roleBadge(role) {
  const cls = ROLE_STYLES[role] || 'bg-gray-100 text-gray-700';
  return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}">${role}</span>`;
}

const OUTLET_TYPES = {
  'Toko Kelontong':  '🏪',
  Minimarket:        '🏬',
  Restoran:          '🍽️',
  'Warung Kopi':     '☕',
  Apotek:            '💊',
  'Toko Bangunan':   '🔨',
  'Toko Elektronik': '📱',
  Bakery:            '🥖',
  'Toko Fashion':    '👗',
};

export function outletIcon(type) {
  return OUTLET_TYPES[type] || '🏪';
}

export function formatDuration(checkIn, checkOut) {
  if (!checkIn || !checkOut) return '-';
  const [h1, m1] = checkIn.split(':').map(Number);
  const [h2, m2] = checkOut.split(':').map(Number);
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) return '-';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

export function uid(prefix = 'ID') {
  return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export function formatCurrency(n) {
  if (n == null) return '-';
  return 'Rp ' + n.toLocaleString('id-ID');
}

/**
 * Compress image file to JPEG dataUrl (max edge ~800px, quality ~0.7)
 * @param {File|Blob} file
 * @param {{ maxPx?: number, quality?: number }} [opts]
 * @returns {Promise<string>} data:image/jpeg;base64,...
 */
export function compressImage(file, opts = {}) {
  const maxPx = opts.maxPx ?? 800;
  const quality = opts.quality ?? 0.7;
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('File bukan gambar'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width >= height) {
            height = Math.round(height * (maxPx / width));
            width = maxPx;
          } else {
            width = Math.round(width * (maxPx / height));
            height = maxPx;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const PHOTO_TYPE_LABELS = {
  location: 'Location',
  product: 'Product',
  shelf: 'Shelf / display',
  rack_before: 'Rack before',
  rack_after: 'Rack after',
  competitor: 'Competitor',
};

export function photoTypeLabel(type) {
  const normalized = type === 'display' ? 'shelf' : type === 'stock' ? 'product' : type === 'promo' ? 'competitor' : type;
  return PHOTO_TYPE_LABELS[normalized] || type || '—';
}

export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

export function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[c]);
}

export function sanitizePlainText(value = '') {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim();
}

const PW_PREFIX = 'sha256$';

function sha256Hex(message) {
  const msg = new TextEncoder().encode(String(message));
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  const bytes = new Uint8Array(((msg.length + 9 + 63) >> 6) << 6);
  bytes.set(msg);
  bytes[msg.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 4, msg.length * 8);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map(n => n.toString(16).padStart(8, '0')).join('');
}

export function hashPassword(plain) {
  const value = String(plain ?? '');
  if (value.startsWith(PW_PREFIX)) return value;
  return PW_PREFIX + sha256Hex(`${value}|proqtrack.v1`);
}

export function passwordMatches(stored, plain) {
  const current = String(stored ?? '');
  const incoming = String(plain ?? '');
  if (current.startsWith(PW_PREFIX)) return current === hashPassword(incoming);
  return current === incoming;
}

export function publicAccount(account) {
  if (!account) return account;
  const { password, ...safe } = account;
  return safe;
}

export function safePhotoUrl(url = '') {
  const value = String(url || '').trim();
  if (!value || /['"<>]/.test(value)) return '';
  if (/^(https?:\/\/|data:image\/|data:image\/svg\+xml|\.\/assets\/|assets\/|\/api\/files\/)/i.test(value)) return value;
  return '';
}
