export const PROJECT_PAGE_SIZE = 15;

export function projectStatusLabel(value = '') {
  return ({ draft:'Draft', active:'Aktif', on_hold:'Ditahan', completed:'Selesai', cancelled:'Dibatalkan' })[String(value || '')] || String(value || '-');
}

export function projectSyncState(cloud = {}) {
  if (cloud?.error) return { label:'Sync bermasalah', tone:'error' };
  if (cloud?.syncing || cloud?.queued) return { label:'Menyinkronkan…', tone:'progress' };
  if (cloud?.cutoverMode === 'cloud' && cloud?.ready) return { label:'Tersinkron cloud', tone:'ok' };
  return { label:'Mode lokal', tone:'local' };
}

export function managerProjectIds(account = {}) {
  const projectIds = Array.isArray(account?.projectIds) ? account.projectIds : [];
  const ids = projectIds.length ? projectIds : (account?.projectId ? [account.projectId] : []);
  return [...new Set(ids.map(String).filter(Boolean))];
}

export function projectManagerNames(db = {}, projectId = '') {
  return (db.accounts || [])
    .filter(account => account.role === 'manager' && account.status !== 'inactive')
    .filter(account => account.projectId === projectId || (Array.isArray(account.projectIds) && account.projectIds.includes(projectId)))
    .map(account => account.name || account.email || account.id)
    .filter(Boolean);
}

export function projectSupervisorNames(db = {}, projectId = '') {
  const employeeMap = Object.fromEntries((db.employees || []).map(employee => [employee.id, employee]));
  return (db.projectAssignments || [])
    .filter(assignment => assignment.projectId === projectId && assignment.status === 'active' && assignment.roleOnProject === 'supervisor')
    .map(assignment => employeeMap[assignment.employeeId]?.name || assignment.employeeId)
    .filter(Boolean);
}

export function projectDependencies(db = {}, projectId = '') {
  const assignments = (db.projectAssignments || []).filter(assignment => assignment.projectId === projectId && assignment.status === 'active').length;
  const openVisits = (db.visits || []).filter(visit => visit.projectId === projectId && ['planned','in_progress','checked-in'].includes(visit.status)).length;
  const draftSurveys = (db.surveyResponses || []).filter(response => response.projectId === projectId && response.status === 'draft').length;
  return { assignments, openVisits, draftSurveys, total:assignments + openVisits + draftSurveys };
}

export function projectSearchDocument(project = {}, context = {}) {
  return [
    project.name,
    project.code,
    context.clientName,
    ...(context.managerNames || []),
    ...(context.supervisorNames || []),
  ].map(value => String(value || '')).join(' ').toLowerCase();
}

export function projectMatchesFilters(project = {}, filters = {}) {
  const q = String(filters.search || '').trim().toLowerCase();
  const status = String(filters.status || '');
  const clientId = String(filters.clientId || '');
  const search = String(project.search || project.searchDocument || '').toLowerCase();
  return (!q || search.includes(q))
    && (!status || String(project.status || '') === status)
    && (!clientId || String(project.clientId || '') === clientId);
}

export function paginateProjects(items = [], page = 1, pageSize = PROJECT_PAGE_SIZE) {
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
    items:items.slice(start, start + pageSize),
  };
}

export function closingProjectAssignments(assignments = [], projectId = '', status = '', actorId = '', timestamp = '') {
  if (!['completed','cancelled'].includes(String(status || ''))) return [];
  const endedAt = timestamp || new Date().toISOString();
  return assignments
    .filter(assignment => assignment.projectId === projectId && assignment.status === 'active')
    .map(assignment => ({
      ...assignment,
      status:'ended',
      endedAt,
      endedBy:actorId || null,
      updatedAt:endedAt,
    }));
}
