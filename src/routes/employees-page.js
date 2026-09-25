// ProQTrack P2 route chunk: Employees list renderer
export function renderEmployees(ctx) {
  const {
    getEmployees, getDB, getAccounts, employeeOperationalCounts, employeeProjectOptions, todayISO,
    getProductSales, employeeListModel, esc, safePhotoUrl, getInitials, roleBadge, formatCurrency,
    salesTargetOf, statusBadge, isProjectAdmin, paginateEmployees, EMPLOYEE_PAGE_SIZE, employeeSyncLabel,
  } = ctx;
  let employeeRowsCache = [];
  let employeePage = Number(ctx.employeePage || 1);
  const employees = getEmployees();
  const db = getDB();
  const accounts = getAccounts() || [];
  const assignments = db.projectAssignments || [];
  const operationalCounts = employeeOperationalCounts(employees, assignments, accounts);
  const projectMap = Object.fromEntries((db.projects || []).map(project => [project.id, project]));
  const projectOptions = employeeProjectOptions(employees, assignments, db.projects || []);
  const currentMonth = todayISO().slice(0, 7);
  const salesByEmployee = new Map();
  for (const sale of getProductSales()) {
    if (!String(sale.soldAt || sale.date || '').startsWith(currentMonth)) continue;
    const key = String(sale.employeeId || '');
    salesByEmployee.set(key, (salesByEmployee.get(key) || 0) + (Number(sale.totalAmount ?? sale.amount) || 0));
  }
  employeeRowsCache = employees.map(e => {
    const colors = ['#ea580c','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
    const cIdx = e.name.charCodeAt(0) % colors.length;
    const rowModel = employeeListModel(e, { assignments, accounts, projectMap });
    const { projectIds, projects, search, operational:flags, assignmentLabel, loginLabel } = rowModel;
    const model = {
      search,
      role:e.role || '',
      status:e.status || '',
      projectIds,
      assigned:flags.assigned,
      loginLinked:flags.loginLinked,
    };
    return {
      model,
      html:`<tr data-search="${esc(search)}" data-role="${esc(e.role || '')}" data-status="${esc(e.status || '')}" data-projects="${esc(projectIds.join('|'))}" data-assigned="${flags.assigned ? '1' : '0'}" data-login="${flags.loginLinked ? '1' : '0'}">
        <td data-label="Nama"><div style="display:flex;align-items:center;gap:10px;"><div class="avatar" style="background:${colors[cIdx]};${safePhotoUrl(e.photo) ? `background-image:url('${safePhotoUrl(e.photo)}');background-size:cover;background-position:center;font-size:0;` : ''}">${getInitials(e.name)}</div><div><div style="font-weight:600;color:var(--gray-800);">${esc(e.name)}</div><div class="pm-subtext">${esc(e.employeeCode || e.code || e.id)} · ${esc(e.email)}</div></div></div></td>
        <td data-label="Role">${roleBadge(e.role)}</td>
        <td data-label="Project">${projects.map(p => `<span class="pm-project-chip">${esc(p.code || p.id)}</span>`).join('') || '—'}</td>
        <td data-label="Operational"><div class="pm-subtext">${esc(assignmentLabel)}</div><div class="pm-subtext">${esc(loginLabel)}</div></td>
        <td data-label="Area">${esc(e.area || '—')}</td>
        <td data-label="Telepon">${esc(e.phone || '—')}</td>
        <td data-label="Sales / Target"><span style="font-weight:600;">${formatCurrency(salesByEmployee.get(String(e.id)) || 0)}</span> / ${formatCurrency(salesTargetOf(e))}</td>
        <td data-label="Kunjungan">${e.totalVisits}</td>
        <td data-label="Status">${statusBadge(e.status)}</td>
        <td data-label="Aksi"><div class="pm-actions"><button class="btn btn-secondary btn-sm" data-pqt-onclick="location.hash='#/employee/${e.id}'">Detail</button>${isProjectAdmin() && e.status === 'active' ? `<button class="btn btn-danger btn-sm" data-pqt-onclick="FT.deleteEmployee('${e.id}')">Nonaktifkan</button>` : ''}</div></td>
      </tr>`,
    };
  });
  const initialPage = paginateEmployees(employeeRowsCache, employeePage, EMPLOYEE_PAGE_SIZE);
  employeePage = initialPage.currentPage;
  const rendered = `
    <div class="card">
      <div class="pm-kpi-grid" style="margin-bottom:14px;">
        <div class="pm-kpi"><span>Total Karyawan</span><strong>${operationalCounts.total}</strong></div>
        <div class="pm-kpi"><span>Aktif</span><strong>${operationalCounts.active}</strong></div>
        <div class="pm-kpi"><span>Belum Ditugaskan</span><strong>${operationalCounts.unassigned}</strong></div>
        <div class="pm-kpi"><span>Login Belum Terhubung</span><strong>${operationalCounts.loginMissing}</strong></div>
      </div>
      <div class="filter-row">
        <input class="input search-input" id="empSearch" placeholder="🔍 Cari nama, email, kode, area, project..." aria-label="Cari karyawan" data-pqt-oninput="FT.filterEmployees(1)">
        <select class="select" id="empRoleFilter" style="width:180px;" aria-label="Filter role" data-pqt-onchange="FT.filterEmployees(1)"><option value="">Semua Role</option><option value="Field Sales">Field Sales</option><option value="Supervisor">Supervisor</option></select>
        <select class="select" id="empStatusFilter" style="width:160px;" aria-label="Filter status" data-pqt-onchange="FT.filterEmployees(1)"><option value="">Semua Status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="terminated">Berakhir</option></select>
        <select class="select" id="empProjectFilter" style="width:220px;" aria-label="Filter project" data-pqt-onchange="FT.filterEmployees(1)"><option value="">Semua Project</option>${projectOptions.map(project => `<option value="${esc(project.id)}">${esc(project.code || project.id)} — ${esc(project.name)}</option>`).join('')}</select>
        <select class="select" id="empAssignmentFilter" style="width:180px;" aria-label="Filter assignment" data-pqt-onchange="FT.filterEmployees(1)"><option value="">Semua Assignment</option><option value="assigned">Sudah Ditugaskan</option><option value="unassigned">Belum Ditugaskan</option></select>
        <select class="select" id="empLoginFilter" style="width:180px;" aria-label="Filter login" data-pqt-onchange="FT.filterEmployees(1)"><option value="">Semua Login</option><option value="linked">Login Terhubung</option><option value="unlinked">Login Belum Terhubung</option></select>
        <button class="btn btn-secondary btn-sm" type="button" data-pqt-onclick="FT.resetEmployeeFilters()">Reset</button>
        <div class="spacer"></div>
        <span id="employeeSyncState">${employeeSyncLabel()}</span>
        <button class="btn btn-secondary" id="employeeRefreshBtn" type="button" data-pqt-onclick="FT.refreshEmployees()">Refresh</button>
        ${isProjectAdmin() ? `<button class="btn btn-secondary" data-pqt-onclick="FT.openBulkEmployees()">Bulk Upload</button><button class="btn btn-primary" data-pqt-onclick="FT.openEmployeeModal()">+ Tambah Karyawan</button>` : ``}
      </div>
      <div id="employeeResultSummary" class="pm-result-summary" role="status" aria-live="polite"></div>
      <div class="visits-table-wrapper">
        <table class="table employee-table" id="empTable">
          <thead><tr><th>Nama</th><th>Role</th><th>Project</th><th>Operational</th><th>Area</th><th>Telepon</th><th>Sales / Target</th><th>Total</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>${initialPage.items.map(row => row.html).join('')}</tbody>
        </table>
      </div>
      <div id="employeeEmpty" class="pm-empty" hidden>Tidak ada karyawan yang sesuai dengan filter. Gunakan Reset untuk menampilkan seluruh data.</div>
      <div id="employeePager" class="pm-pager" hidden><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.employeePage(-1)">Sebelumnya</button><span id="employeePageLabel"></span><button class="btn btn-secondary btn-sm" data-pqt-onclick="FT.employeePage(1)">Berikutnya</button></div>
    </div>
  `;
  queueMicrotask(() => window.FT?.filterEmployees?.(employeePage));
  return { html:rendered, employeeRowsCache, employeePage };
}
