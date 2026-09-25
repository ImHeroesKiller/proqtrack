// ProQTrack P2 route chunk: Visits list renderer
export function renderVisits(ctx) {
  const {
    getVisits, visitDay, getEmployees, getOutlets, visitRowEntry, paginateVisits,
    VISITS_PAGE_SIZE, esc,
  } = ctx;
  let visitRowsCache = [];
  let visitPage = Number(ctx.visitPage || 1);
  const visits = getVisits().sort((a,b) => String(visitDay(b)).localeCompare(String(visitDay(a))) || (b.checkInTime||'').localeCompare(a.checkInTime||''));
  const employees = getEmployees();
  const outlets = getOutlets();
  const empMap = new Map(employees.map(e => [String(e.id), e]));
  const outletMap = new Map(outlets.map(o => [String(o.id), o]));
  visitRowsCache = visits
    .map(v => visitRowEntry(v, empMap.get(String(v.employeeId)), outletMap.get(String(v.outletId))))
    .filter(Boolean);
  const initialPage = paginateVisits(visitRowsCache, visitPage, VISITS_PAGE_SIZE);
  visitPage = initialPage.currentPage;

  setTimeout(() => window.FT?.initVisitFilters?.(), 0);
  const html = `
    <div class="card">
      <div class="filter-row">
        <label class="sr-only" for="visitSearch">Cari kunjungan</label><input class="input search-input" id="visitSearch" placeholder="🔍 Cari kunjungan..." data-pqt-oninput="FT.filterVisits(1)">
        <select class="select" id="visitStatusFilter" style="width:180px;" data-pqt-onchange="FT.filterVisits(1)">
          <option value="">Semua Status</option>
          <option value="completed">Selesai</option>
          <option value="checked-in">Sedang Berlangsung</option>
          <option value="planned">Direncanakan</option>
        </select>
        <select class="select" id="visitEmpFilter" style="width:200px;" data-pqt-onchange="FT.filterVisits(1)">
          <option value="">Semua Karyawan</option>
          ${employees.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}
        </select>
        <select class="select" id="visitProjectFilter" style="width:190px;" data-pqt-onchange="FT.filterVisits(1)"><option value="">Semua Project</option></select>
        <select class="select" id="visitOutletFilter" style="width:190px;" data-pqt-onchange="FT.filterVisits(1)"><option value="">Semua Outlet</option></select>
        <input class="input" id="visitDateFrom" type="date" aria-label="Tanggal mulai" style="width:160px;" data-pqt-onchange="FT.filterVisits(1)">
        <input class="input" id="visitDateTo" type="date" aria-label="Tanggal akhir" style="width:160px;" data-pqt-onchange="FT.filterVisits(1)">
        <button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.resetVisitFilters()">Reset</button>
        <div class="spacer"></div>
        <button class="btn btn-primary" data-pqt-onclick="FT.openVisitModal()">+ Tambah Kunjungan</button>
      </div>
      <div id="visitFilterSummary" class="am-muted" style="margin:0 0 10px;" role="status" aria-live="polite"></div>
      <div class="visits-table-wrapper visit-responsive-table">
        <table class="table" id="visitsTable">
          <thead><tr><th>Tanggal</th><th>Karyawan</th><th>Outlet</th><th>Check In</th><th>Check Out</th><th>Durasi</th><th>Status</th><th>Rating</th><th></th></tr></thead>
          <tbody>${initialPage.items.length ? initialPage.items.map(row => row.html).join('') : '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📋</div><h3>Belum ada data kunjungan</h3><p>Klik "Tambah Kunjungan" untuk membuat data baru</p></div></td></tr>'}</tbody>
        </table>
      </div>
      <div id="visitPager" class="visit-pager"></div>
    </div>
  `;
  return { html, visitRowsCache, visitPage };
}
