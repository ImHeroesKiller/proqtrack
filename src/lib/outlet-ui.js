export const OUTLET_PAGE_SIZE = 20;

const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();

export function outletOperationalModel(outlet = {}, { projects = [], clients = [], visits = [] } = {}) {
  const projectIds = Array.isArray(outlet.projectIds) ? outlet.projectIds.filter(Boolean).map(String) : [];
  const projectMap = new Map(projects.map(project => [String(project.id), project]));
  const clientMap = new Map(clients.map(client => [String(client.id), client]));
  const linkedProjects = projectIds.map(id => projectMap.get(id)).filter(Boolean);
  const client = clientMap.get(String(outlet.clientId || linkedProjects[0]?.clientId || '')) || null;
  const outletVisits = visits.filter(visit => String(visit.outletId) === String(outlet.id));
  const datedVisits = outletVisits
    .map(visit => text(visit.date || visit.visitDate || visit.scheduledAt).slice(0,10))
    .filter(Boolean)
    .sort();
  const lastVisitDate = datedVisits.at(-1) || '';
  const projectLabel = linkedProjects.map(project => project.code || project.name || project.id).join(', ');
  const search = [
    outlet.id, outlet.outletNumber, outlet.code, outlet.name, outlet.address, outlet.area,
    outlet.owner, outlet.phone, outlet.type, outlet.channel, outlet.ownership,
    client?.name, client?.code, projectLabel,
  ].map(lower).filter(Boolean).join(' ');
  return {
    outlet,
    projectIds,
    linkedProjects,
    client,
    clientId:String(client?.id || outlet.clientId || ''),
    projectLabel,
    clientLabel:text(client?.name || client?.code),
    visitCount:outletVisits.length,
    lastVisitDate,
    shared:projectIds.length > 1,
    search,
  };
}

export function outletFilterOptions(outlets = [], { projects = [], clients = [] } = {}) {
  const typeSet = new Set();
  const areaSet = new Set();
  const projectIds = new Set();
  const clientIds = new Set();
  for (const outlet of outlets) {
    if (text(outlet.type)) typeSet.add(text(outlet.type));
    if (text(outlet.area)) areaSet.add(text(outlet.area));
    for (const id of Array.isArray(outlet.projectIds) ? outlet.projectIds : []) if (id) projectIds.add(String(id));
    if (outlet.clientId) clientIds.add(String(outlet.clientId));
  }
  const sortText = rows => [...rows].sort((a,b) => a.localeCompare(b,'id'));
  return {
    types:sortText(typeSet),
    areas:sortText(areaSet),
    projects:projects.filter ? [] : projects.filter(project => projectIds.has(String(project.id))),
    clients:clients.filter(client => clientIds.has(String(client.id))),
  };
}

export function outletMatchesFilters(model, filters = {}) {
  if (filters.search && !lower(model.search).includes(lower(filters.search))) return false;
  if (filters.type && text(model.outlet.type) !== text(filters.type)) return false;
  if (filters.area && text(model.outlet.area) !== text(filters.area)) return false;
  if (filters.status && text(model.outlet.status) !== text(filters.status)) return false;
  if (filters.projectId && !model.projectIds.includes(String(filters.projectId))) return false;
  if (filters.clientId && model.clientId !== String(filters.clientId)) return false;
  return true;
}

export function outletFilterSnapshot(source = {}) {
  const get = key => typeof source === 'function' ? text(source(key)) : text(source?.[key]);
  return {
    search:get('search'),
    type:get('type'),
    area:get('area'),
    status:get('status'),
    projectId:get('projectId'),
    clientId:get('clientId'),
  };
}

export function paginateOutlets(items = [], page = 1, pageSize = OUTLET_PAGE_SIZE) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(pageCount, Math.max(1, Number(page) || 1));
  const fromIndex = (currentPage - 1) * pageSize;
  const pageItems = items.slice(fromIndex, fromIndex + pageSize);
  return {
    items:pageItems,
    total,
    pageCount,
    currentPage,
    from: total ? fromIndex + 1 : 0,
    to: total ? fromIndex + pageItems.length : 0,
  };
}
