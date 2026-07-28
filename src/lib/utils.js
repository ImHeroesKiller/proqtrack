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
};

export function statusBadge(status) {
  const cls = STATUS_STYLES[status] || 'bg-gray-100 text-gray-600 border-gray-200';
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}">${status}</span>`;
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
