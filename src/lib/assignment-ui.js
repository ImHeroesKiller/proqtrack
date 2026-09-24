export const ASSIGNMENT_PAGE_SIZE = 15;

export function assignmentRoleLabel(value = '') {
  return ({ supervisor:'Supervisor', sales:'Field Sales', viewer:'Viewer' })[String(value || '')] || String(value || '-');
}

export function assignmentStatusLabel(value = '') {
  return ({ active:'Aktif', ended:'Selesai', removed:'Selesai', inactive:'Nonaktif' })[String(value || '')] || String(value || '-');
}

export function normalizeAssignmentStatus(value = '') {
  return String(value || '') === 'removed' ? 'ended' : String(value || '');
}

export function assignmentSyncState(cloud = {}) {
  if (cloud?.error) return { label:'Sync bermasalah', tone:'error' };
  if (cloud?.syncing || cloud?.queued) return { label:'Menyinkronkan…', tone:'progress' };
  if (cloud?.cutoverMode === 'cloud' && cloud?.ready) return { label:'Tersinkron cloud', tone:'ok' };
  return { label:'Mode lokal', tone:'local' };
}

export function employeeCapacityUsage(assignments = [], employeeId = '', startDate = '', endDate = '', excludeId = '') {
  return assignments
    .filter(assignment =>
      assignment.employeeId === employeeId &&
      assignment.status === 'active' &&
      assignment.id !== excludeId &&
      assignment.startDate <= endDate &&
      assignment.endDate >= startDate
    )
    .reduce((sum, assignment) => sum + Number(assignment.allocationPercent || 100), 0);
}

export function assignmentSearchDocument(assignment = {}, context = {}) {
  return [
    context.projectName,
    context.projectCode,
    context.clientName,
    context.employeeName,
    context.supervisorName,
    assignmentRoleLabel(assignment.roleOnProject),
  ].map(value => String(value || '')).join(' ').toLowerCase();
}

export function assignmentMatchesFilters(assignment = {}, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const projectId = String(filters.projectId || '');
  const status = String(filters.status || '');
  const assignmentRole = String(filters.role || '');
  const searchDocument = String(assignment.search || assignment.searchDocument || '').toLowerCase();
  return (!search || searchDocument.includes(search))
    && (!projectId || String(assignment.projectId || '') === projectId)
    && (!status || normalizeAssignmentStatus(assignment.status) === status)
    && (!assignmentRole || String(assignment.roleOnProject || assignment.role || '') === assignmentRole);
}

export function paginateAssignments(items = [], page = 1, pageSize = ASSIGNMENT_PAGE_SIZE) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const start = (currentPage - 1) * pageSize;
  return {
    total,
    pageCount,
    currentPage,
    from:total ? start + 1 : 0,
    to:Math.min(start + pageSize, total),
    items:items.slice(start, start + pageSize),
  };
}

export function eligibleSupervisors(assignments = [], employees = [], projectId = '', startDate = '', endDate = '') {
  const employeeMap = Object.fromEntries(employees.map(employee => [employee.id, employee]));
  return assignments
    .filter(assignment =>
      assignment.projectId === projectId &&
      assignment.status === 'active' &&
      assignment.roleOnProject === 'supervisor' &&
      (!startDate || assignment.startDate <= startDate) &&
      (!endDate || assignment.endDate >= endDate)
    )
    .map(assignment => employeeMap[assignment.employeeId])
    .filter(employee => employee && employee.status === 'active');
}

export function eligibleAssignmentEmployees(employees = [], accounts = [], allowedEmployeeIds = null) {
  const allowed = allowedEmployeeIds ? new Set([...allowedEmployeeIds].map(String)) : null;
  const activeAccountEmployeeIds = new Set(
    accounts.filter(account => account.status !== 'inactive').map(account => String(account.employeeId || '')).filter(Boolean),
  );
  return employees.filter(employee =>
    employee.status === 'active' &&
    (!allowed || allowed.has(String(employee.id))) &&
    activeAccountEmployeeIds.has(String(employee.id))
  );
}
