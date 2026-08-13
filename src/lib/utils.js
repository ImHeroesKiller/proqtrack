// Utility functions for ProQTrack

export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
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
  location: 'Lokasi',
  product: 'Produk',
  shelf: 'Rak / Display',
  competitor: 'Kompetitor',
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

export function safePhotoUrl(url = '') {
  const value = String(url || '').trim();
  if (!value || /['"<>]/.test(value)) return '';
  if (/^(https?:\/\/|data:image\/|data:image\/svg\+xml|\.\/assets\/|assets\/)/i.test(value)) return value;
  return '';
}
