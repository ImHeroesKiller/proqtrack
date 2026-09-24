export const VISITS_PAGE_SIZE = 20;

export function normalizeVisitStatus(value = '') {
  const status = String(value || '').trim().toLowerCase();
  return status === 'in_progress' ? 'checked-in' : status;
}

export function visitMatchesFilters(visit, filters = {}, searchText = '') {
  const haystack = String(searchText || '').toLowerCase();
  const date = String(visit?.date || visit?.visitDate || '').slice(0, 10);
  const status = normalizeVisitStatus(visit?.status);
  return (!filters.search || haystack.includes(String(filters.search).toLowerCase()))
    && (!filters.status || status === filters.status)
    && (!filters.employeeId || String(visit?.employeeId || '') === filters.employeeId)
    && (!filters.projectId || String(visit?.projectId || '') === filters.projectId)
    && (!filters.outletId || String(visit?.outletId || '') === filters.outletId)
    && (!filters.dateFrom || date >= filters.dateFrom)
    && (!filters.dateTo || date <= filters.dateTo);
}

export function paginateVisits(items = [], page = 1, pageSize = VISITS_PAGE_SIZE) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (currentPage - 1) * pageSize;
  return {
    currentPage,
    pageCount,
    total,
    from: total ? start + 1 : 0,
    to: Math.min(start + pageSize, total),
    items: items.slice(start, start + pageSize),
  };
}

export function visitCorrectionErrorMessage(code = '') {
  return ({
    WORKFLOW_ALREADY_PENDING:'Pengajuan koreksi untuk kunjungan ini masih menunggu persetujuan.',
    VISIT_NOT_FINAL:'Koreksi hanya dapat diajukan untuk kunjungan yang sudah final.',
    VISIT_NOT_FOUND:'Kunjungan tidak ditemukan.',
    PROJECT_ACCESS_DENIED:'Anda tidak memiliki akses ke project kunjungan ini.',
    FORBIDDEN:'Anda tidak memiliki izin untuk mengajukan koreksi ini.',
  })[String(code || '').trim()] || 'Pengajuan koreksi gagal dikirim.';
}
