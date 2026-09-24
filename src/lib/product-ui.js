const text = value => String(value ?? '').trim();

export const PRODUCT_PAGE_SIZE = 20;

export function productOperationalModel(product = {}, { projects = [], clients = [] } = {}) {
  const projectMap = new Map((projects || []).map(project => [String(project.id), project]));
  const clientMap = new Map((clients || []).map(client => [String(client.id), client]));
  const projectIds = [...new Set((product.projectIds || []).map(String).filter(Boolean))];
  const linkedProjects = projectIds.map(id => projectMap.get(id)).filter(Boolean);
  const clientId = text(product.clientId || linkedProjects[0]?.clientId);
  const client = clientMap.get(clientId);
  const projectLabel = linkedProjects.map(project => project.code || project.name || project.id).join(', ');
  const clientLabel = client?.name || client?.code || clientId || '';
  const search = [
    product.sku, product.name, product.brand, product.category, product.unit,
    projectLabel, clientLabel,
  ].map(text).filter(Boolean).join(' ').toLowerCase();
  return {
    product,
    projectIds,
    clientId,
    projects:linkedProjects,
    projectLabel,
    clientLabel,
    shared:projectIds.length > 1,
    search,
  };
}

export function productFilterOptions(products = [], { projects = [], clients = [] } = {}) {
  const models = products.map(product => productOperationalModel(product,{projects,clients}));
  const usedProjectIds = new Set(models.flatMap(model => model.projectIds));
  const usedClientIds = new Set(models.map(model => model.clientId).filter(Boolean));
  const unique = values => [...new Set(values.map(text).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'id'));
  return {
    brands:unique(products.map(product => product.brand)),
    categories:unique(products.map(product => product.category)),
    projects:(projects || []).filter(project => usedProjectIds.has(String(project.id))),
    clients:(clients || []).filter(client => usedClientIds.has(String(client.id))),
  };
}

export function productFilterSnapshot(source = {}) {
  const get = typeof source === 'function' ? source : key => source[key];
  return {
    search:text(get('search')).toLowerCase(),
    projectId:text(get('projectId')),
    clientId:text(get('clientId')),
    category:text(get('category')),
    brand:text(get('brand')),
    status:text(get('status')),
  };
}

export function productMatchesFilters(model, filters = {}) {
  const product = model.product || {};
  if (filters.search && !String(model.search || '').includes(filters.search)) return false;
  if (filters.projectId && !(model.projectIds || []).includes(filters.projectId)) return false;
  if (filters.clientId && String(model.clientId || '') !== filters.clientId) return false;
  if (filters.category && String(product.category || '') !== filters.category) return false;
  if (filters.brand && String(product.brand || '') !== filters.brand) return false;
  if (filters.status && String(product.status || '') !== filters.status) return false;
  return true;
}

export function paginateProducts(rows = [], page = 1, pageSize = PRODUCT_PAGE_SIZE) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, Number(page) || 1), pageCount);
  const fromIndex = (currentPage - 1) * pageSize;
  return {
    items:rows.slice(fromIndex,fromIndex+pageSize),
    total,
    pageCount,
    currentPage,
    from:total ? fromIndex + 1 : 0,
    to:Math.min(fromIndex + pageSize,total),
  };
}

export function productSyncPresentation(sync = {}) {
  if (sync.error) return { label:'Sync bermasalah', className:'status-inactive' };
  if (sync.syncing || sync.queued) return { label:'Sinkronisasi…', className:'status-pending' };
  return { label:'Cloud synced', className:'status-active' };
}
