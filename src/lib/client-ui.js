export const CLIENT_PAGE_SIZE = 15;

export function clientStatusLabel(value = '') {
  return ({ active:'Aktif', prospect:'Prospect', inactive:'Nonaktif', archived:'Arsip' })[String(value || '')] || String(value || '-');
}

export function normalizeClientWebsite(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return ['http:','https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

export function clientSyncState(cloud = {}) {
  if (cloud?.error) return { label:'Sync bermasalah', tone:'error' };
  if (cloud?.syncing || cloud?.queued) return { label:'Menyinkronkan…', tone:'progress' };
  if (cloud?.cutoverMode === 'cloud' && cloud?.ready) return { label:'Tersinkron cloud', tone:'ok' };
  return { label:'Mode lokal', tone:'local' };
}

export function clientMatchesFilters(client = {}, filters = {}) {
  const q = String(filters.search || '').trim().toLowerCase();
  const status = String(filters.status || '');
  const haystack = [
    client.name,
    client.legalName,
    client.picName,
    client.city,
    client.province,
  ].map(value => String(value || '')).join(' ').toLowerCase();
  return (!q || haystack.includes(q)) && (!status || String(client.status || '') === status);
}

export function paginateClients(items = [], page = 1, pageSize = CLIENT_PAGE_SIZE) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (currentPage - 1) * pageSize;
  return {
    total,
    pageCount,
    currentPage,
    from: total ? start + 1 : 0,
    to: Math.min(start + pageSize, total),
    items: items.slice(start, start + pageSize),
  };
}

export function normalizeAdditionalPics({ names = [], roles = [], phones = [], emails = [] } = {}) {
  return names.map((name, index) => ({
    name:String(name || '').trim(),
    role:String(roles[index] || '').trim(),
    phone:String(phones[index] || '').trim(),
    email:String(emails[index] || '').trim(),
  })).filter(pic => pic.name || pic.role || pic.phone || pic.email);
}

export function clientSearchDocument(client = {}) {
  return [
    client.name,
    client.legalName,
    client.picName,
    client.city,
    client.province,
  ].map(value => String(value || '')).join(' ').toLowerCase();
}
