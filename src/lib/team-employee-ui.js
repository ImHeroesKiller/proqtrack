export const EMPLOYEE_PAGE_SIZE = 15;

export function employeeSyncState(cloud = {}) {
  if (cloud?.error) return { label:'Sync bermasalah', tone:'error' };
  if (cloud?.syncing || cloud?.queued) return { label:'Menyinkronkan…', tone:'progress' };
  if (cloud?.cutoverMode === 'cloud' && cloud?.ready) return { label:'Tersinkron cloud', tone:'ok' };
  return { label:'Mode lokal', tone:'local' };
}

export function activeAssignmentsForEmployee(assignments = [], employeeId = '') {
  return assignments.filter(a => String(a.employeeId) === String(employeeId) && a.status === 'active');
}

export function activeProjectIdsForEmployee(assignments = [], employeeId = '') {
  return [...new Set(activeAssignmentsForEmployee(assignments, employeeId).map(a => String(a.projectId)).filter(Boolean))];
}

export function employeeSearchDocument(employee = {}, projects = []) {
  const identity = [employee.employeeCode, employee.code, employee.id].map(value => String(value || '')).filter(Boolean);
  return [
    ...identity,
    employee.name, employee.email, employee.area, employee.phone, employee.role,
    ...projects.flatMap(project => [project?.code, project?.name]),
  ].map(value => String(value || '')).join(' ').toLowerCase();
}

export function employeeMatchesFilters(employee = {}, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const role = String(filters.role || '');
  const status = String(filters.status || '');
  const projectId = String(filters.projectId || '');
  const assignment = String(filters.assignment || '');
  const login = String(filters.login || '');
  const projects = Array.isArray(employee.projectIds) ? employee.projectIds.map(String) : [];
  return (!search || String(employee.search || employee.searchDocument || '').toLowerCase().includes(search))
    && (!role || String(employee.role || '') === role)
    && (!status || String(employee.status || '') === status)
    && (!projectId || projects.includes(projectId))
    && (!assignment || (assignment === 'assigned' ? !!employee.assigned : !employee.assigned))
    && (!login || (login === 'linked' ? !!employee.loginLinked : !employee.loginLinked));
}

export function employeeOperationalFlags(employee = {}, assignments = [], accounts = []) {
  const activeAssignments = activeAssignmentsForEmployee(assignments, employee.id);
  const account = accounts.find(row =>
    String(row.employeeId || '') === String(employee.id || '') ||
    (!!employee.authUserId && String(row.id || '') === String(employee.authUserId))
  ) || null;
  return {
    assigned: activeAssignments.length > 0,
    assignmentCount: activeAssignments.length,
    loginLinked: !!account,
    loginActive: !!account && String(account.status || 'active') === 'active',
  };
}

export function employeeOperationalCounts(employees = [], assignments = [], accounts = []) {
  const rows = employees.map(employee => ({ employee, flags:employeeOperationalFlags(employee, assignments, accounts) }));
  return {
    total:rows.length,
    active:rows.filter(row => String(row.employee.status || '') === 'active').length,
    unassigned:rows.filter(row => String(row.employee.status || '') === 'active' && !row.flags.assigned).length,
    loginMissing:rows.filter(row => String(row.employee.status || '') === 'active' && !row.flags.loginLinked).length,
  };
}

export function employeeProjectOptions(employees = [], assignments = [], projects = []) {
  const projectMap = new Map(projects.map(project => [String(project.id), project]));
  const seen = new Set();
  const output = [];
  for (const employee of employees) {
    for (const projectId of activeProjectIdsForEmployee(assignments, employee.id)) {
      if (seen.has(projectId)) continue;
      const project = projectMap.get(String(projectId));
      if (!project) continue;
      seen.add(projectId);
      output.push(project);
    }
  }
  return output;
}

export function employeeListModel(employee = {}, { assignments = [], accounts = [], projectMap = {} } = {}) {
  const projectIds = activeProjectIdsForEmployee(assignments, employee.id);
  const projects = projectIds.map(id => projectMap[id]).filter(Boolean);
  const operational = employeeOperationalFlags(employee, assignments, accounts);
  return {
    employee,
    projectIds,
    projects,
    search:employeeSearchDocument(employee, projects),
    operational,
    assignmentLabel:operational.assigned ? `${operational.assignmentCount} assignment` : 'Belum ditugaskan',
    loginLabel:operational.loginLinked ? (operational.loginActive ? 'Login aktif' : 'Login nonaktif') : 'Login belum terhubung',
  };
}

export function employeeFilterSnapshot(source = {}) {
  const get = key => typeof source === 'function'
    ? String(source(key) || '')
    : String(source?.[key] || '');
  return {
    search:get('search'),
    role:get('role'),
    status:get('status'),
    projectId:get('projectId'),
    assignment:get('assignment'),
    login:get('login'),
  };
}

export function employeeDeactivationImpact(employeeId = '', assignments = []) {
  const count = activeAssignmentsForEmployee(assignments, employeeId).length;
  return {
    activeAssignmentCount:count,
    message:count ? ` Karyawan memiliki ${count} assignment aktif yang akan ditutup.` : '',
  };
}

export function paginateEmployees(items = [], page = 1, pageSize = EMPLOYEE_PAGE_SIZE) {
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

export function subordinateEmployeeIds(assignments = [], supervisor = {}, projectIds = null) {
  const scope = projectIds ? new Set([...projectIds].map(String)) : null;
  return [...new Set(assignments.filter(assignment =>
    assignment.status === 'active' &&
    (!scope || scope.has(String(assignment.projectId))) &&
    (
      String(assignment.supervisorId || '') === String(supervisor.id || '') ||
      (supervisor.authUserId && String(assignment.supervisorUserId || '') === String(supervisor.authUserId))
    )
  ).map(assignment => String(assignment.employeeId)).filter(Boolean))];
}

export function teamMemberSummary(employee = {}, assignments = [], visits = [], projectMap = {}) {
  const active = assignments.filter(a => String(a.employeeId) === String(employee.id) && a.status === 'active');
  const employeeVisits = visits.filter(v => String(v.employeeId) === String(employee.id));
  return {
    projectIds:[...new Set(active.map(a => String(a.projectId)).filter(Boolean))],
    projectCodes:active.map(a => projectMap[a.projectId]?.code || a.projectId).filter(Boolean),
    capacity:active.reduce((sum,a) => sum + Number(a.allocationPercent || 100),0),
    visits:employeeVisits.length,
    completedVisits:employeeVisits.filter(v => v.status === 'completed').length,
  };
}

export function teamMatchesFilters(member = {}, filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const projectId = String(filters.projectId || '');
  return (!search || String(member.search || '').toLowerCase().includes(search))
    && (!projectId || (member.projectIds || []).map(String).includes(projectId));
}

export function supervisorMetrics(db = {}, supervisor = {}, projectIds = []) {
  const scope = new Set([...projectIds].map(String));
  const team = subordinateEmployeeIds(db.projectAssignments || [], supervisor, scope);
  const relevant = (rows = [], owner = 'employeeId') => rows.filter(row =>
    team.includes(String(row[owner] || row.recordedBy || '')) &&
    (!row.projectId || scope.has(String(row.projectId)))
  ).length;
  return {
    team:team.length,
    visits:relevant(db.visits || []),
    intel:relevant(db.competitorIntel || [], 'recordedBy'),
    photos:relevant(db.fieldPhotos || [], 'recordedBy'),
    prices:relevant(db.priceObservations || [], 'employeeId'),
  };
}
