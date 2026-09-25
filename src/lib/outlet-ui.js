export const OUTLET_PAGE_SIZE = 20;

const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();

export function outletOperationalModel(outlet = {}, {
  projects = [], clients = [], visits = [], projectMap = null, clientMap = null, visitStats = null,
} = {}) {
  const projectIds = Array.isArray(outlet.projectIds) ? outlet.projectIds.filter(Boolean).map(String) : [];
  const projectIndex = projectMap instanceof Map ? projectMap : new Map(projects.map(project => [String(project.id), project]));
  const clientIndex = clientMap instanceof Map ? clientMap : new Map(clients.map(client => [String(client.id), client]));
  const linkedProjects = projectIds.map(id => projectIndex.get(id)).filter(Boolean);
  const client = clientIndex.get(String(outlet.clientId || linkedProjects[0]?.clientId || '')) || null;
  const cachedVisitStats = visitStats instanceof Map ? visitStats.get(String(outlet.id)) : null;
  const outletVisits = cachedVisitStats ? [] : visits.filter(visit => String(visit.outletId) === String(outlet.id));
  const datedVisits = cachedVisitStats ? [] : outletVisits
    .map(visit => text(visit.date || visit.visitDate || visit.scheduledAt).slice(0,10))
    .filter(Boolean)
    .sort();
  const lastVisitDate = cachedVisitStats?.lastVisitDate || datedVisits.at(-1) || '';
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
    visitCount:cachedVisitStats?.count ?? outletVisits.length,
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
    projects:projects.filter(project => projectIds.has(String(project.id))),
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


export function outletStatusSummary(outlets = []) {
  return {
    total:outlets.length,
    active:outlets.filter(outlet => outlet.status === 'active').length,
    inactive:outlets.filter(outlet => outlet.status === 'inactive').length,
    archived:outlets.filter(outlet => outlet.status === 'archived').length,
  };
}

export function outletSyncPresentation(sync = {}) {
  if (sync.error) return { state:'error', label:'Sync bermasalah', className:'status-inactive' };
  if (sync.syncing || sync.queued) return { state:'syncing', label:'Sinkronisasi…', className:'status-pending' };
  return { state:'synced', label:'Cloud synced', className:'status-active' };
}

export function normalizeOutletCatalog(catalog = {}, outlet = null) {
  const unique = values => [...new Set((values || []).map(text).filter(Boolean))];
  const withCurrent = (values, current) => {
    const rows = unique(values);
    const value = text(current);
    return value && !rows.includes(value) ? [value, ...rows] : rows;
  };
  return {
    segments:withCurrent(catalog.segments, outlet?.channel),
    ownerships:withCurrent(catalog.ownerships, outlet?.ownership),
    types:withCurrent(catalog.types, outlet?.type),
    notesMode:catalog.notesMode === 'dropdown' ? 'dropdown' : 'freetext',
    notesOptions:withCurrent(catalog.notesOptions, outlet?.notes),
  };
}

export function outletFormModel(outlet = {}, catalog = {}) {
  const normalizedCatalog = normalizeOutletCatalog(catalog, outlet);
  return {
    id:text(outlet.id),
    name:text(outlet.name),
    projectId:text(outlet.projectIds?.[0] || outlet.projectId),
    address:text(outlet.address),
    lat:outlet.lat ?? '',
    lng:outlet.lng ?? '',
    area:text(outlet.area),
    phone:text(outlet.phone),
    owner:text(outlet.owner),
    type:text(outlet.type),
    channel:text(outlet.channel),
    ownership:text(outlet.ownership),
    notes:text(outlet.notes),
    visitFrequency:text(outlet.visitFrequency || 'Mingguan'),
    status:['active','inactive','archived'].includes(text(outlet.status)) ? text(outlet.status) : 'active',
    catalog:normalizedCatalog,
    isEdit:Boolean(outlet.id),
  };
}

export function outletLifecycleAction(outlet = {}, referenceCount = 0) {
  const refs = Math.max(0, Number(referenceCount) || 0);
  if (refs > 0) {
    return {
      action:'deactivate',
      label:'Nonaktifkan',
      confirm:`Outlet memiliki ${refs} data operasional terkait. Outlet akan dinonaktifkan agar histori tetap utuh. Lanjutkan?`,
    };
  }
  return {
    action:'delete',
    label:text(outlet.status) === 'active' ? 'Hapus' : 'Hapus',
    confirm:'Hapus outlet ini? Tindakan ini hanya berlaku bila outlet belum memiliki data operasional terkait.',
  };
}
