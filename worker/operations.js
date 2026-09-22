const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

export const ENTITY_COLLECTIONS = Object.freeze({
  clients: 'clients',
  projects: 'projects',
  employees: 'employees',
  projectAssignments: 'projectAssignments',
  outlets: 'outlets',
  visits: 'visits',
  attendance: 'attendance',
  products: 'products',
  productSales: 'productSales',
  surveyTemplates: 'surveyTemplates',
  surveyResponses: 'surveyResponses',
  projectProducts: 'projectProducts',
  competitors: 'competitors',
  competitorProducts: 'competitorProducts',
  attendancePoints: 'attendancePoints',
});

const ENTITY_TABLES = Object.freeze({
  clients: 'core_clients',
  projects: 'core_projects',
  employees: 'core_employees',
  projectAssignments: 'core_employee_project_assignments',
  outlets: 'core_outlets',
  visits: 'core_visits',
  attendance: 'core_attendance',
  products: 'core_products',
  productSales: 'core_product_sales',
  surveyTemplates: 'core_survey_templates',
  surveyResponses: 'core_survey_responses',
  projectProducts: 'core_project_products',
  competitors: 'core_competitors',
  competitorProducts: 'core_competitor_products',
  attendancePoints: 'core_attendance_points',
});

const ADMIN_ENTITIES = new Set(['clients', 'projects', 'employees', 'projectAssignments', 'outlets', 'products', 'surveyTemplates', 'projectProducts', 'competitors', 'competitorProducts', 'attendancePoints']);
const FIELD_ENTITIES = new Set(['visits', 'attendance', 'productSales', 'surveyResponses']);
const BROAD_ROLES = new Set(['superadmin', 'head', 'admin']);
const MAX_CHANGES = 250;
const MAX_IMPORT_ROWS = 10000;

const str = (value, fallback = '') => String(value ?? fallback).trim();
const nullable = value => value == null || value === '' ? null : value;
const num = value => value == null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);
const safeStatus = (value, allowed, fallback) => allowed.includes(str(value)) ? str(value) : fallback;
const unique = values => [...new Set((values || []).map(v => str(v)).filter(Boolean))];
const metadata = row => JSON.stringify({ ...row, password: undefined });
const parseMetadata = value => {
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
};
const allRows = async stmt => {
  const result = await stmt.all();
  return Array.isArray(result?.results) ? result.results : [];
};
const roleOf = claims => str(claims?.role).toLowerCase();
const projectAllowed = (claims, projectId) => BROAD_ROLES.has(roleOf(claims)) || (!!projectId && (claims.projectIds || []).includes(projectId));
const clientAllowed = (claims, clientId) => BROAD_ROLES.has(roleOf(claims)) || (!!clientId && (claims.clientIds || []).includes(clientId));

function legacyIds(organizationId) {
  const suffix = str(organizationId).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'ORG';
  return { clientId: `CL-LEGACY-${suffix}`, projectId: `PRJ-LEGACY-${suffix}` };
}

export function canonicalizeLegacySnapshot(snapshot = {}, organizationId = '') {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const { clientId: fallbackClientId, projectId: fallbackProjectId } = legacyIds(organizationId);
  const data = {};
  for (const key of Object.keys(ENTITY_COLLECTIONS)) data[key] = Array.isArray(source[key]) ? source[key].map(row => ({ ...row })) : [];
  data.accounts = Array.isArray(source.accounts) ? source.accounts.map(row => ({ ...row })) : [];

  const clientsById = new Map(data.clients.map(row => [str(row.id), row]).filter(([id]) => id));
  const needsFallbackClient = !clientsById.size || data.projects.some(row => !row.clientId || !clientsById.has(str(row.clientId)))
    || data.outlets.some(row => !row.clientId || !clientsById.has(str(row.clientId)))
    || data.products.some(row => !row.clientId || !clientsById.has(str(row.clientId)));
  if (needsFallbackClient && !clientsById.has(fallbackClientId)) {
    const row = { id: fallbackClientId, organizationId, code: 'LEGACY', name: 'Legacy / Migrated Data', status: 'active', migrated: true };
    data.clients.push(row); clientsById.set(row.id, row);
  }

  data.projects = data.projects.filter(row => str(row.id)).map(row => ({
    ...row,
    organizationId,
    clientId: clientsById.has(str(row.clientId)) ? str(row.clientId) : fallbackClientId,
  }));
  const projectsById = new Map(data.projects.map(row => [str(row.id), row]));
  const validProjects = row => unique(row?.projectIds?.length ? row.projectIds : (row?.projectId ? [row.projectId] : [])).filter(id => projectsById.has(id));
  const needsFallbackProject = !projectsById.size
    || data.outlets.some(row => !validProjects(row).length)
    || data.products.some(row => !validProjects(row).length)
    || data.visits.some(row => !row.projectId || !projectsById.has(str(row.projectId)))
    || data.attendance.some(row => !row.projectId || !projectsById.has(str(row.projectId)))
    || data.productSales.some(row => !row.projectId || !projectsById.has(str(row.projectId)));
  if (needsFallbackProject && !projectsById.has(fallbackProjectId)) {
    const row = { id: fallbackProjectId, organizationId, clientId: fallbackClientId, code: 'LEGACY', name: 'Legacy Migration Project', status: 'active', migrated: true };
    data.projects.push(row); projectsById.set(row.id, row);
  }

  data.employees = data.employees.filter(row => str(row.id)).map(row => ({ ...row, organizationId }));
  const employeesById = new Map(data.employees.map(row => [str(row.id), row]));
  data.projectAssignments = data.projectAssignments.filter(row => str(row.id) && employeesById.has(str(row.employeeId))).map(row => ({
    ...row,
    organizationId,
    projectId: projectsById.has(str(row.projectId)) ? str(row.projectId) : fallbackProjectId,
  }));
  const assignmentsByEmployee = new Map();
  for (const row of data.projectAssignments) {
    if (!['active', 'assigned'].includes(str(row.status || 'active'))) continue;
    if (!assignmentsByEmployee.has(str(row.employeeId))) assignmentsByEmployee.set(str(row.employeeId), []);
    assignmentsByEmployee.get(str(row.employeeId)).push(str(row.projectId));
  }
  for (const employee of data.employees) {
    if (!assignmentsByEmployee.has(str(employee.id))) {
      const id = `ASN-MIG-${str(employee.id)}`;
      const row = { id, organizationId, employeeId: employee.id, projectId: fallbackProjectId, roleOnProject: 'sales', status: 'active', migrated: true };
      data.projectAssignments.push(row);
      assignmentsByEmployee.set(str(employee.id), [fallbackProjectId]);
    }
  }

  data.outlets = data.outlets.filter(row => str(row.id)).map(row => {
    const projectIds = validProjects(row);
    const scopedProjects = projectIds.length ? projectIds : [fallbackProjectId];
    const project = projectsById.get(scopedProjects[0]);
    return { ...row, organizationId, clientId: clientsById.has(str(row.clientId)) ? str(row.clientId) : (project?.clientId || fallbackClientId), projectIds: scopedProjects };
  });
  const outletsById = new Map(data.outlets.map(row => [str(row.id), row]));

  data.products = data.products.filter(row => str(row.id)).map(row => {
    const projectIds = validProjects(row);
    const scopedProjects = projectIds.length ? projectIds : [fallbackProjectId];
    const project = projectsById.get(scopedProjects[0]);
    return { ...row, organizationId, clientId: clientsById.has(str(row.clientId)) ? str(row.clientId) : (project?.clientId || fallbackClientId), projectIds: scopedProjects };
  });
  const productsById = new Map(data.products.map(row => [str(row.id), row]));

  const inferProject = row => {
    if (projectsById.has(str(row.projectId))) return str(row.projectId);
    const outlet = outletsById.get(str(row.outletId));
    if (outlet?.projectIds?.[0]) return outlet.projectIds[0];
    const assigned = assignmentsByEmployee.get(str(row.employeeId || row.recordedBy));
    return assigned?.[0] || fallbackProjectId;
  };
  data.visits = data.visits.filter(row => str(row.id) && outletsById.has(str(row.outletId)) && employeesById.has(str(row.employeeId))).map(row => ({ ...row, organizationId, projectId: inferProject(row) }));
  data.attendance = data.attendance.filter(row => str(row.id) && employeesById.has(str(row.employeeId))).map(row => ({ ...row, organizationId, projectId: inferProject(row) }));
  data.productSales = data.productSales.filter(row => str(row.id) && outletsById.has(str(row.outletId)) && employeesById.has(str(row.employeeId)) && productsById.has(str(row.productId))).map(row => ({ ...row, organizationId, projectId: inferProject(row) }));
  data.surveyTemplates = data.surveyTemplates.filter(row => str(row.id)).map(row => ({ ...row, organizationId, clientId: clientsById.has(str(row.clientId)) ? str(row.clientId) : fallbackClientId, projectId: projectsById.has(str(row.projectId)) ? str(row.projectId) : fallbackProjectId }));
  const templatesById = new Set(data.surveyTemplates.map(row => str(row.id)));
  data.surveyResponses = data.surveyResponses.filter(row => str(row.id) && templatesById.has(str(row.templateId)) && employeesById.has(str(row.employeeId))).map(row => ({ ...row, organizationId, projectId: inferProject(row) }));

  data.projectProducts = [];
  for (const product of data.products) {
    for (const projectId of unique(product.projectIds)) {
      data.projectProducts.push({ id: `PP-${projectId}-${product.id}`, organizationId, projectId, productId: product.id, status: 'active' });
    }
  }
  return data;
}

export function validateImportSnapshot(snapshot = {}) {
  const issues = [];
  let count = 0;
  for (const key of [...Object.keys(ENTITY_COLLECTIONS), 'accounts']) {
    const rows = Array.isArray(snapshot[key]) ? snapshot[key] : [];
    count += rows.length;
    const ids = new Set();
    for (const row of rows) {
      const id = str(row?.id);
      if (!id && key !== 'accounts') issues.push(`${key}: row without id`);
      if (id && ids.has(id)) issues.push(`${key}: duplicate id ${id}`);
      if (id) ids.add(id);
    }
  }
  if (count > MAX_IMPORT_ROWS) issues.push(`import exceeds ${MAX_IMPORT_ROWS} rows`);
  return { ok: issues.length === 0, issues, count };
}

export function authorizeOperationalChange(claims, entity, change, context = {}) {
  const role = roleOf(claims);
  const row = change?.row || context.existing || {};
  if (!ENTITY_TABLES[entity]) return false;
  if (BROAD_ROLES.has(role)) return true;
  const projectId = str(row.projectId || row.project_id || context.existing?.project_id || context.existing?.projectId);
  const employeeId = str(row.employeeId || row.employee_id || context.existing?.employee_id || context.existing?.employeeId);
  if (role === 'manager') {
    if (entity === 'clients') return false;
    if (entity === 'employees') {
      if (context.existing && !context.accessibleEmployeeIds?.has(str(context.existing.id))) return false;
      if (!context.existing) return context.batchAssignments?.some(a => str(a.employeeId) === str(row.id) && projectAllowed(claims, str(a.projectId)));
      return true;
    }
    if (entity === 'projects') return projectAllowed(claims, str(row.id));
    if (entity === 'outlets' || entity === 'products') {
      const projectIds = unique(row.projectIds?.length ? row.projectIds : [projectId]);
      return projectIds.length > 0 && projectIds.every(id => projectAllowed(claims, id));
    }
    if (['competitors','competitorProducts','attendancePoints'].includes(entity)) return true;
    if (entity === 'projectAssignments' || entity === 'projectProducts' || entity === 'surveyTemplates') return projectAllowed(claims, projectId);
    if (FIELD_ENTITIES.has(entity)) return projectAllowed(claims, projectId) && (!employeeId || context.accessibleEmployeeIds?.has(employeeId));
    return false;
  }
  if (role === 'supervisor' || role === 'employee') {
    if (role === 'supervisor' && entity === 'attendancePoints') return true;
    if (!FIELD_ENTITIES.has(entity)) return false;
    return projectAllowed(claims, projectId) && !!employeeId && context.accessibleEmployeeIds?.has(employeeId);
  }
  return false;
}

function normalizeRow(entity, row, organizationId, extras = {}) {
  const base = { ...row, organizationId };
  switch (entity) {
    case 'clients': return { ...base, id: str(row.id), code: str(row.code || row.id), name: str(row.name || 'Client'), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    case 'projects': return { ...base, id: str(row.id), clientId: str(row.clientId), code: str(row.code || row.id), name: str(row.name || 'Project'), status: ({ planning: 'draft', completed: 'closed', cancelled: 'closed' }[str(row.status)] || safeStatus(row.status, ['draft','active','paused','closed','archived'], 'active')) };
    case 'employees': return { ...base, id: str(row.id), authUserId: extras.authUserId || row.authUserId || null, employeeCode: str(row.employeeCode || row.code || row.id), name: str(row.name || row.fullName || 'Employee'), status: safeStatus(row.status, ['active','inactive','terminated'], 'active') };
    case 'projectAssignments': return { ...base, id: str(row.id), projectId: str(row.projectId), employeeId: str(row.employeeId), status: ({ removed: 'ended', assigned: 'active' }[str(row.status)] || safeStatus(row.status, ['active','inactive','ended'], 'active')) };
    case 'outlets': return { ...base, id: str(row.id), clientId: str(row.clientId), code: str(row.outletNumber || row.code || row.id), name: str(row.name || 'Outlet'), projectIds: unique(row.projectIds?.length ? row.projectIds : (row.projectId ? [row.projectId] : [])), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    case 'visits': return { ...base, id: str(row.id), projectId: str(row.projectId), outletId: str(row.outletId), employeeId: str(row.employeeId), status: safeStatus(row.status, ['planned','in_progress','completed','cancelled','rejected'], 'planned') };
    case 'attendance': return { ...base, id: str(row.id), projectId: str(row.projectId), employeeId: str(row.employeeId), workDate: str(row.workDate || row.date), status: safeStatus(str(row.status).toLowerCase(), ['present','late','absent','leave','rejected'], 'present') };
    case 'products': return { ...base, id: str(row.id), clientId: str(row.clientId), sku: str(row.sku || row.id), name: str(row.name || 'Product'), projectIds: unique(row.projectIds?.length ? row.projectIds : (row.projectId ? [row.projectId] : [])), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    case 'productSales': return { ...base, id: str(row.id), projectId: str(row.projectId), outletId: str(row.outletId), employeeId: str(row.employeeId), productId: str(row.productId), quantity: num(row.quantity ?? row.qty) ?? 0, unitPrice: num(row.unitPrice ?? row.price), totalAmount: num(row.totalAmount ?? row.amount), soldAt: str(row.soldAt || row.date || row.createdAt || new Date().toISOString()) };
    case 'surveyTemplates': return { ...base, id: str(row.id), clientId: str(row.clientId), projectId: nullable(str(row.projectId)), name: str(row.name || row.title || 'Survey'), status: safeStatus(row.status, ['draft','active','closed','archived'], 'draft') };
    case 'surveyResponses': return { ...base, id: str(row.id), templateId: str(row.templateId), projectId: str(row.projectId), outletId: nullable(str(row.outletId)), employeeId: str(row.employeeId), visitId: nullable(str(row.visitId)), status: safeStatus(row.status, ['draft','submitted','rejected'], 'submitted') };
    case 'projectProducts': return { ...base, projectId: str(row.projectId), productId: str(row.productId), status: safeStatus(row.status, ['active','inactive'], 'active') };
    case 'competitors': return { ...base, id: str(row.id), code: str(row.code || row.id), name: str(row.name || 'Competitor'), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    case 'competitorProducts': return { ...base, id: str(row.id), competitorId: str(row.competitorId), sku: str(row.sku || row.id), name: str(row.name || 'Competitor Product'), unit: str(row.unit || 'pcs'), typicalPrice: num(row.typicalPrice), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    case 'attendancePoints': return { ...base, id: str(row.id), code: str(row.code || row.id), name: str(row.name || 'Attendance Point'), type: safeStatus(row.type, ['office','meeting','store','point'], 'point'), outletId: nullable(str(row.outletId)), latitude: num(row.latitude ?? row.lat), longitude: num(row.longitude ?? row.lng), radiusM: num(row.radiusM), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    default: return base;
  }
}

function upsertStatements(env, entity, rawRow, organizationId, extras = {}) {
  const row = normalizeRow(entity, rawRow, organizationId, extras);
  const m = metadata(row);
  const p = (sql, args) => env.DB.prepare(sql).bind(...args);
  switch (entity) {
    case 'clients': return [p(`INSERT INTO core_clients(id,organization_id,code,name,status,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,status=excluded.status,metadata_json=excluded.metadata_json,row_version=core_clients.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_clients.organization_id=excluded.organization_id`, [row.id,organizationId,row.code,row.name,row.status,m])];
    case 'projects': return [p(`INSERT INTO core_projects(id,organization_id,client_id,code,name,status,starts_on,ends_on,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,code=excluded.code,name=excluded.name,status=excluded.status,starts_on=excluded.starts_on,ends_on=excluded.ends_on,metadata_json=excluded.metadata_json,row_version=core_projects.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_projects.organization_id=excluded.organization_id`, [row.id,organizationId,row.clientId,row.code,row.name,row.status,nullable(row.startsOn || row.startDate),nullable(row.endsOn || row.endDate),m])];
    case 'employees': return [p(`INSERT INTO core_employees(id,organization_id,auth_user_id,employee_code,full_name,email,phone,employment_status,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET auth_user_id=COALESCE(excluded.auth_user_id,core_employees.auth_user_id),employee_code=excluded.employee_code,full_name=excluded.full_name,email=excluded.email,phone=excluded.phone,employment_status=excluded.employment_status,metadata_json=excluded.metadata_json,row_version=core_employees.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_employees.organization_id=excluded.organization_id`, [row.id,organizationId,row.authUserId,row.employeeCode,row.name,nullable(row.email),nullable(row.phone),row.status,m])];
    case 'projectAssignments': return [p(`INSERT INTO core_employee_project_assignments(id,organization_id,project_id,employee_id,supervisor_user_id,position_name,status,starts_on,ends_on,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,employee_id=excluded.employee_id,supervisor_user_id=excluded.supervisor_user_id,position_name=excluded.position_name,status=excluded.status,starts_on=excluded.starts_on,ends_on=excluded.ends_on,metadata_json=excluded.metadata_json,row_version=core_employee_project_assignments.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_employee_project_assignments.organization_id=excluded.organization_id`, [row.id,organizationId,row.projectId,row.employeeId,nullable(row.supervisorUserId),nullable(row.positionName || row.roleOnProject),row.status,nullable(row.startsOn || row.startDate),nullable(row.endsOn || row.endDate),m])];
    case 'outlets': {
      const statements = [p(`INSERT INTO core_outlets(id,organization_id,client_id,code,name,address,latitude,longitude,geofence_radius_m,status,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,code=excluded.code,name=excluded.name,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,geofence_radius_m=excluded.geofence_radius_m,status=excluded.status,metadata_json=excluded.metadata_json,row_version=core_outlets.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_outlets.organization_id=excluded.organization_id`, [row.id,organizationId,row.clientId,row.code,row.name,nullable(row.address),num(row.latitude ?? row.lat),num(row.longitude ?? row.lng),num(row.geofenceRadiusM),row.status,m])];
      statements.push(p('DELETE FROM core_project_outlets WHERE organization_id=? AND outlet_id=?', [organizationId,row.id]));
      for (const projectId of row.projectIds) statements.push(p(`INSERT INTO core_project_outlets(organization_id,project_id,outlet_id,status) VALUES(?,?,?,'active')`, [organizationId,projectId,row.id]));
      return statements;
    }
    case 'visits': return [p(`INSERT INTO core_visits(id,organization_id,project_id,outlet_id,employee_id,status,scheduled_at,started_at,completed_at,start_latitude,start_longitude,end_latitude,end_longitude,idempotency_key,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,outlet_id=excluded.outlet_id,employee_id=excluded.employee_id,status=excluded.status,scheduled_at=excluded.scheduled_at,started_at=excluded.started_at,completed_at=excluded.completed_at,start_latitude=excluded.start_latitude,start_longitude=excluded.start_longitude,end_latitude=excluded.end_latitude,end_longitude=excluded.end_longitude,idempotency_key=excluded.idempotency_key,metadata_json=excluded.metadata_json,row_version=core_visits.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_visits.organization_id=excluded.organization_id`, [row.id,organizationId,row.projectId,row.outletId,row.employeeId,row.status,nullable(row.scheduledAt || row.date),nullable(row.startedAt || row.checkInAt),nullable(row.completedAt || row.checkOutAt),num(row.startLatitude ?? row.lat),num(row.startLongitude ?? row.lng),num(row.endLatitude),num(row.endLongitude),nullable(row.idempotencyKey),m,1])];
    case 'attendance': return [p(`INSERT INTO core_attendance(id,organization_id,project_id,employee_id,work_date,status,check_in_at,check_out_at,check_in_latitude,check_in_longitude,check_out_latitude,check_out_longitude,idempotency_key,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,employee_id=excluded.employee_id,work_date=excluded.work_date,status=excluded.status,check_in_at=excluded.check_in_at,check_out_at=excluded.check_out_at,check_in_latitude=excluded.check_in_latitude,check_in_longitude=excluded.check_in_longitude,check_out_latitude=excluded.check_out_latitude,check_out_longitude=excluded.check_out_longitude,idempotency_key=excluded.idempotency_key,metadata_json=excluded.metadata_json,row_version=core_attendance.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_attendance.organization_id=excluded.organization_id`, [row.id,organizationId,row.projectId,row.employeeId,row.workDate,row.status,nullable(row.checkInAt),nullable(row.checkOutAt),num(row.checkInLatitude ?? row.lat),num(row.checkInLongitude ?? row.lng),num(row.checkOutLatitude),num(row.checkOutLongitude),nullable(row.idempotencyKey),m])];
    case 'products': {
      const statements = [p(`INSERT INTO core_products(id,organization_id,client_id,sku,name,unit,status,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,sku=excluded.sku,name=excluded.name,unit=excluded.unit,status=excluded.status,metadata_json=excluded.metadata_json,row_version=core_products.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_products.organization_id=excluded.organization_id`, [row.id,organizationId,row.clientId,row.sku,row.name,nullable(row.unit),row.status,m])];
      statements.push(p('DELETE FROM core_project_products WHERE organization_id=? AND product_id=?', [organizationId,row.id]));
      for (const projectId of row.projectIds) statements.push(p(`INSERT INTO core_project_products(organization_id,project_id,product_id,status,updated_at) VALUES(?,?,?,'active',CURRENT_TIMESTAMP)`, [organizationId,projectId,row.id]));
      return statements;
    }
    case 'productSales': return [p(`INSERT INTO core_product_sales(id,organization_id,project_id,outlet_id,employee_id,product_id,quantity,unit_price,total_amount,sold_at,idempotency_key,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,outlet_id=excluded.outlet_id,employee_id=excluded.employee_id,product_id=excluded.product_id,quantity=excluded.quantity,unit_price=excluded.unit_price,total_amount=excluded.total_amount,sold_at=excluded.sold_at,idempotency_key=excluded.idempotency_key,metadata_json=excluded.metadata_json,row_version=core_product_sales.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_product_sales.organization_id=excluded.organization_id`, [row.id,organizationId,row.projectId,row.outletId,row.employeeId,row.productId,row.quantity,row.unitPrice,row.totalAmount,row.soldAt,nullable(row.idempotencyKey),m])];
    case 'surveyTemplates': return [p(`INSERT INTO core_survey_templates(id,organization_id,client_id,project_id,name,status,version,starts_at,ends_at,created_by,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,project_id=excluded.project_id,name=excluded.name,status=excluded.status,version=excluded.version,starts_at=excluded.starts_at,ends_at=excluded.ends_at,metadata_json=excluded.metadata_json,row_version=core_survey_templates.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_survey_templates.organization_id=excluded.organization_id`, [row.id,organizationId,row.clientId,row.projectId,row.name,row.status,Math.max(1,Number(row.version)||1),nullable(row.startsAt),nullable(row.endsAt),nullable(row.createdBy),m,1])];
    case 'surveyResponses': return [p(`INSERT INTO core_survey_responses(id,organization_id,template_id,project_id,outlet_id,employee_id,visit_id,status,answers_json,submitted_at,idempotency_key,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET template_id=excluded.template_id,project_id=excluded.project_id,outlet_id=excluded.outlet_id,employee_id=excluded.employee_id,visit_id=excluded.visit_id,status=excluded.status,answers_json=excluded.answers_json,submitted_at=excluded.submitted_at,idempotency_key=excluded.idempotency_key,metadata_json=excluded.metadata_json,row_version=core_survey_responses.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_survey_responses.organization_id=excluded.organization_id`, [row.id,organizationId,row.templateId,row.projectId,row.outletId,row.employeeId,row.visitId,row.status,JSON.stringify(row.answers || row.answers_json || {}),nullable(row.submittedAt),nullable(row.idempotencyKey),m])];
    case 'projectProducts': return [p(`INSERT INTO core_project_products(organization_id,project_id,product_id,status,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(organization_id,project_id,product_id) DO UPDATE SET status=excluded.status,updated_at=CURRENT_TIMESTAMP`, [organizationId,row.projectId,row.productId,row.status])];
    case 'competitors': return [p(`INSERT INTO core_competitors(id,organization_id,code,name,status,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,status=excluded.status,metadata_json=excluded.metadata_json,row_version=core_competitors.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_competitors.organization_id=excluded.organization_id`, [row.id,organizationId,row.code,row.name,row.status,m])];
    case 'competitorProducts': return [p(`INSERT INTO core_competitor_products(id,organization_id,competitor_id,sku,name,unit,typical_price,status,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET competitor_id=excluded.competitor_id,sku=excluded.sku,name=excluded.name,unit=excluded.unit,typical_price=excluded.typical_price,status=excluded.status,metadata_json=excluded.metadata_json,row_version=core_competitor_products.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_competitor_products.organization_id=excluded.organization_id`, [row.id,organizationId,row.competitorId,row.sku,row.name,nullable(row.unit),num(row.typicalPrice),row.status,m])];
    case 'attendancePoints': return [p(`INSERT INTO core_attendance_points(id,organization_id,code,name,type,address,outlet_id,latitude,longitude,radius_m,status,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,type=excluded.type,address=excluded.address,outlet_id=excluded.outlet_id,latitude=excluded.latitude,longitude=excluded.longitude,radius_m=excluded.radius_m,status=excluded.status,metadata_json=excluded.metadata_json,row_version=core_attendance_points.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_attendance_points.organization_id=excluded.organization_id`, [row.id,organizationId,row.code,row.name,row.type,nullable(row.address),nullable(row.outletId),num(row.latitude),num(row.longitude),num(row.radiusM),row.status,m])];
    default: return [];
  }
}

function deleteStatements(env, entity, row, organizationId) {
  const p = (sql, args) => env.DB.prepare(sql).bind(...args);
  const id = str(row?.id);
  if (entity === 'projectProducts') return [p('DELETE FROM core_project_products WHERE organization_id=? AND project_id=? AND product_id=?', [organizationId,str(row.projectId),str(row.productId)])];
  if (!id) return [];
  const table = ENTITY_TABLES[entity];
  const statements = [];
  if (entity === 'outlets') statements.push(p('DELETE FROM core_project_outlets WHERE organization_id=? AND outlet_id=?', [organizationId,id]));
  if (entity === 'products') statements.push(p('DELETE FROM core_project_products WHERE organization_id=? AND product_id=?', [organizationId,id]));
  statements.push(p(`DELETE FROM ${table} WHERE organization_id=? AND id=?`, [organizationId,id]));
  return statements;
}

function membershipRefreshStatement(env, organizationId, employeeId, projectId) {
  return env.DB.prepare(`
    INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,updated_at)
    SELECT ?, ?, e.auth_user_id,
      CASE WHEN ou.role IN ('manager','supervisor') THEN ou.role ELSE 'employee' END,
      CASE WHEN EXISTS(
        SELECT 1 FROM core_employee_project_assignments a
        WHERE a.organization_id=? AND a.project_id=? AND a.employee_id=? AND a.status='active'
      ) THEN 'active' ELSE 'inactive' END,
      CURRENT_TIMESTAMP
    FROM core_employees e
    JOIN core_organization_users ou ON ou.organization_id=e.organization_id AND ou.user_id=e.auth_user_id
    WHERE e.organization_id=? AND e.id=? AND e.auth_user_id IS NOT NULL
    ON CONFLICT(organization_id,project_id,user_id) DO UPDATE SET role=excluded.role,status=excluded.status,updated_at=CURRENT_TIMESTAMP
  `).bind(organizationId,projectId,organizationId,projectId,employeeId,organizationId,employeeId);
}

async function syncState(env, organizationId) {
  let row = await env.DB.prepare('SELECT organization_id,revision,cutover_mode,last_mutation_id,imported_at,updated_at FROM core_sync_state WHERE organization_id=?').bind(organizationId).first();
  if (!row) {
    await env.DB.prepare("INSERT INTO core_sync_state(organization_id,revision,cutover_mode,updated_at) VALUES(?,0,'pending',CURRENT_TIMESTAMP)").bind(organizationId).run();
    row = { organization_id: organizationId, revision: 0, cutover_mode: 'pending' };
  }
  return row;
}

async function employeeAccess(env, claims) {
  const organizationId = claims.organizationId;
  if (!organizationId) return new Set();
  if (BROAD_ROLES.has(roleOf(claims))) {
    const rows = await allRows(env.DB.prepare('SELECT id FROM core_employees WHERE organization_id=?').bind(organizationId));
    return new Set(rows.map(row => str(row.id)));
  }
  const rows = await allRows(env.DB.prepare(`
    SELECT DISTINCT e.id,e.auth_user_id,e.metadata_json,a.project_id,a.supervisor_user_id
    FROM core_employees e
    LEFT JOIN core_employee_project_assignments a ON a.organization_id=e.organization_id AND a.employee_id=e.id AND a.status='active'
    WHERE e.organization_id=?
  `).bind(organizationId));
  const own = rows.find(row => str(row.auth_user_id) === str(claims.sub));
  const ownEmployeeId = str(own?.id);
  const allowedProjects = new Set(claims.projectIds || []);
  const ids = new Set();
  for (const row of rows) {
    if (str(row.auth_user_id) === str(claims.sub)) ids.add(str(row.id));
    if (roleOf(claims) === 'manager' && allowedProjects.has(str(row.project_id))) ids.add(str(row.id));
    if (roleOf(claims) === 'supervisor') {
      const meta = parseMetadata(row.metadata_json);
      if (str(row.supervisor_user_id) === str(claims.sub) || (ownEmployeeId && str(meta.supervisorId) === ownEmployeeId)) ids.add(str(row.id));
    }
  }
  return ids;
}

function decodeRows(entity, rows, relationMap = new Map()) {
  return rows.map(dbRow => {
    const meta = parseMetadata(dbRow.metadata_json);
    const common = { ...meta, id: dbRow.id || meta.id, organizationId: dbRow.organization_id || meta.organizationId, rowVersion: Number(dbRow.row_version || meta.rowVersion || 1) };
    switch (entity) {
      case 'clients': return { ...common, code: dbRow.code, name: dbRow.name, status: dbRow.status };
      case 'projects': return { ...common, clientId: dbRow.client_id, code: dbRow.code, name: dbRow.name, status: dbRow.status, startDate: dbRow.starts_on || meta.startDate, endDate: dbRow.ends_on || meta.endDate };
      case 'employees': return { ...common, authUserId: dbRow.auth_user_id || meta.authUserId, employeeCode: dbRow.employee_code, name: dbRow.full_name, email: dbRow.email, phone: dbRow.phone, status: dbRow.employment_status };
      case 'projectAssignments': return { ...common, projectId: dbRow.project_id, employeeId: dbRow.employee_id, supervisorUserId: dbRow.supervisor_user_id, positionName: dbRow.position_name, status: dbRow.status, startDate: dbRow.starts_on, endDate: dbRow.ends_on };
      case 'outlets': return { ...common, clientId: dbRow.client_id, outletNumber: dbRow.code, code: dbRow.code, name: dbRow.name, address: dbRow.address, lat: dbRow.latitude, lng: dbRow.longitude, status: dbRow.status, projectIds: relationMap.get(str(dbRow.id)) || meta.projectIds || [] };
      case 'visits': return { ...common, projectId: dbRow.project_id, outletId: dbRow.outlet_id, employeeId: dbRow.employee_id, status: dbRow.status, scheduledAt: dbRow.scheduled_at, startedAt: dbRow.started_at, completedAt: dbRow.completed_at };
      case 'attendance': return { ...common, projectId: dbRow.project_id, employeeId: dbRow.employee_id, date: dbRow.work_date, workDate: dbRow.work_date, status: dbRow.status, checkInAt: dbRow.check_in_at, checkOutAt: dbRow.check_out_at };
      case 'products': return { ...common, clientId: dbRow.client_id, sku: dbRow.sku, name: dbRow.name, unit: dbRow.unit, status: dbRow.status, projectIds: relationMap.get(str(dbRow.id)) || meta.projectIds || [] };
      case 'productSales': return { ...common, projectId: dbRow.project_id, outletId: dbRow.outlet_id, employeeId: dbRow.employee_id, productId: dbRow.product_id, quantity: dbRow.quantity, unitPrice: dbRow.unit_price, totalAmount: dbRow.total_amount, amount: dbRow.total_amount, soldAt: dbRow.sold_at };
      case 'surveyTemplates': return { ...common, clientId: dbRow.client_id, projectId: dbRow.project_id, name: dbRow.name, status: dbRow.status, version: dbRow.version };
      case 'surveyResponses': return { ...common, templateId: dbRow.template_id, projectId: dbRow.project_id, outletId: dbRow.outlet_id, employeeId: dbRow.employee_id, visitId: dbRow.visit_id, status: dbRow.status, answers: parseMetadata(dbRow.answers_json), submittedAt: dbRow.submitted_at };
      case 'competitors': return { ...common, code: dbRow.code, name: dbRow.name, status: dbRow.status };
      case 'competitorProducts': return { ...common, competitorId: dbRow.competitor_id, sku: dbRow.sku, name: dbRow.name, unit: dbRow.unit, typicalPrice: dbRow.typical_price, status: dbRow.status };
      case 'attendancePoints': return { ...common, code: dbRow.code, name: dbRow.name, type: dbRow.type, address: dbRow.address, outletId: dbRow.outlet_id, lat: dbRow.latitude, lng: dbRow.longitude, radiusM: dbRow.radius_m, status: dbRow.status };
      default: return common;
    }
  });
}

async function bootstrapData(env, claims) {
  const org = claims.organizationId;
  const [clients,projects,employees,assignments,outlets,projectOutlets,visits,attendance,products,projectProducts,sales,surveyTemplates,surveyResponses,competitors,competitorProducts,attendancePoints] = await Promise.all([
    allRows(env.DB.prepare('SELECT * FROM core_clients WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_projects WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_employees WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_employee_project_assignments WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_outlets WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare("SELECT * FROM core_project_outlets WHERE organization_id=? AND status='active'").bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_visits WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_attendance WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_products WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare("SELECT * FROM core_project_products WHERE organization_id=? AND status='active'").bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_product_sales WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_survey_templates WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_survey_responses WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_competitors WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_competitor_products WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_attendance_points WHERE organization_id=?').bind(org)),
  ]);
  const outletProjects = new Map();
  for (const row of projectOutlets) { if (!outletProjects.has(str(row.outlet_id))) outletProjects.set(str(row.outlet_id), []); outletProjects.get(str(row.outlet_id)).push(str(row.project_id)); }
  const productProjects = new Map();
  for (const row of projectProducts) { if (!productProjects.has(str(row.product_id))) productProjects.set(str(row.product_id), []); productProjects.get(str(row.product_id)).push(str(row.project_id)); }
  const data = {
    clients: decodeRows('clients', clients),
    projects: decodeRows('projects', projects),
    employees: decodeRows('employees', employees),
    projectAssignments: decodeRows('projectAssignments', assignments),
    outlets: decodeRows('outlets', outlets, outletProjects),
    visits: decodeRows('visits', visits),
    attendance: decodeRows('attendance', attendance),
    products: decodeRows('products', products, productProjects),
    productSales: decodeRows('productSales', sales),
    surveyTemplates: decodeRows('surveyTemplates', surveyTemplates),
    surveyResponses: decodeRows('surveyResponses', surveyResponses),
    competitors: decodeRows('competitors', competitors),
    competitorProducts: decodeRows('competitorProducts', competitorProducts),
    attendancePoints: decodeRows('attendancePoints', attendancePoints),
    projectProducts: projectProducts.map ? [] : projectProducts,
  };
  data.projectProducts = projectProducts instanceof Map ? [...projectProducts.entries()].flatMap(([productId, ids]) => ids.map(projectId => ({ id: `PP-${projectId}-${productId}`, organizationId: org, projectId, productId, status: 'active' }))) : [];

  if (!BROAD_ROLES.has(roleOf(claims))) {
    const allowedProjects = new Set(claims.projectIds || []);
    const allowedClients = new Set(claims.clientIds || []);
    const employeesAllowed = await employeeAccess(env, claims);
    data.clients = data.clients.filter(row => allowedClients.has(str(row.id)));
    data.projects = data.projects.filter(row => allowedProjects.has(str(row.id)));
    data.projectAssignments = data.projectAssignments.filter(row => allowedProjects.has(str(row.projectId)) && employeesAllowed.has(str(row.employeeId)));
    data.employees = data.employees.filter(row => employeesAllowed.has(str(row.id)));
    data.outlets = data.outlets.filter(row => row.projectIds.some(id => allowedProjects.has(str(id))));
    data.products = data.products.filter(row => row.projectIds.some(id => allowedProjects.has(str(id))));
    data.projectProducts = data.projectProducts.filter(row => allowedProjects.has(str(row.projectId)));
    for (const key of ['visits','attendance','productSales','surveyResponses']) data[key] = data[key].filter(row => allowedProjects.has(str(row.projectId)) && employeesAllowed.has(str(row.employeeId)));
    data.surveyTemplates = data.surveyTemplates.filter(row => (row.projectId && allowedProjects.has(str(row.projectId))) || (!row.projectId && allowedClients.has(str(row.clientId))));
  }
  return data;
}

async function importAuthStatements(env, snapshot, claims, organizationId) {
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  const existingUsers = await allRows(env.DB.prepare('SELECT id,email FROM auth_users'));
  const byEmail = new Map(existingUsers.map(row => [str(row.email).toLowerCase(), str(row.id)]));
  const statements = [];
  const userIdByEmployee = new Map();
  const p = (sql, args) => env.DB.prepare(sql).bind(...args);
  for (const account of accounts) {
    const email = str(account.email).toLowerCase();
    const passwordHash = str(account.password || account.password_hash);
    let role = str(account.role).toLowerCase();
    if (!email || role === 'superadmin') continue;
    if (!['head','manager','supervisor','employee','admin'].includes(role)) role = 'employee';
    let userId = byEmail.get(email);
    if (!userId) {
      if (!/^sha256\$|^pbkdf2\$sha256\$/.test(passwordHash)) continue;
      userId = str(account.id || `MIG-${crypto.randomUUID()}`);
      byEmail.set(email, userId);
      statements.push(p(`INSERT INTO auth_users(id,email,password_hash,role,status,project_ids,client_ids,created_at) VALUES(?,?,?,?,?,'[]','[]',CURRENT_TIMESTAMP) ON CONFLICT(email) DO NOTHING`, [userId,email,passwordHash,role,safeStatus(account.status,['active','inactive','suspended'],'active')]));
    }
    statements.push(p(`INSERT INTO core_organization_users(organization_id,user_id,role,status,updated_at) VALUES(?,?,?,'active',CURRENT_TIMESTAMP) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,status='active',updated_at=CURRENT_TIMESTAMP`, [organizationId,userId,role]));
    if (account.employeeId) userIdByEmployee.set(str(account.employeeId), userId);
    if (role === 'manager' && account.projectId) statements.push(p(`INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,updated_at) VALUES(?,?,?,'manager','active',CURRENT_TIMESTAMP) ON CONFLICT(organization_id,project_id,user_id) DO UPDATE SET role='manager',status='active',updated_at=CURRENT_TIMESTAMP`, [organizationId,str(account.projectId),userId]));
  }
  for (const assignment of snapshot.projectAssignments || []) {
    const userId = userIdByEmployee.get(str(assignment.employeeId));
    if (!userId) continue;
    const account = accounts.find(row => str(row.employeeId) === str(assignment.employeeId));
    const membershipRole = ['manager','supervisor'].includes(str(account?.role).toLowerCase()) ? str(account.role).toLowerCase() : 'employee';
    statements.push(p(`INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(organization_id,project_id,user_id) DO UPDATE SET role=excluded.role,status=excluded.status,updated_at=CURRENT_TIMESTAMP`, [organizationId,str(assignment.projectId),userId,membershipRole,str(assignment.status) === 'active' ? 'active' : 'inactive']));
  }
  return { statements, userIdByEmployee };
}

async function handleBootstrap(env, claims) {
  const state = await syncState(env, claims.organizationId);
  const data = await bootstrapData(env, claims);
  const rowCount = Object.values(data).filter(Array.isArray).reduce((sum, rows) => sum + rows.length, 0);
  return json({ ok: true, revision: Number(state.revision || 0), cutoverMode: state.cutover_mode || 'pending', empty: rowCount === 0, data });
}

async function handleImport(request, env, claims) {
  if (!BROAD_ROLES.has(roleOf(claims))) return json({ error: 'FORBIDDEN' }, 403);
  const organizationId = claims.organizationId;
  const state = await syncState(env, organizationId);
  if (state.cutover_mode === 'cloud') return json({ error: 'ALREADY_CUT_OVER', revision: Number(state.revision || 0) }, 409);
  const body = await request.json().catch(() => ({}));
  const canonical = canonicalizeLegacySnapshot(body.snapshot || {}, organizationId);
  const validation = validateImportSnapshot(canonical);
  if (!validation.ok) return json({ error: 'IMPORT_VALIDATION_FAILED', ...validation }, 422);
  if (body.dryRun === true) return json({ ok: true, dryRun: true, ...validation, summary: Object.fromEntries(Object.keys(ENTITY_COLLECTIONS).map(key => [key, canonical[key].length])) });

  const existing = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM core_clients WHERE organization_id=?) +
    (SELECT COUNT(*) FROM core_projects WHERE organization_id=?) +
    (SELECT COUNT(*) FROM core_employees WHERE organization_id=?) +
    (SELECT COUNT(*) FROM core_visits WHERE organization_id=?) AS count`).bind(organizationId,organizationId,organizationId,organizationId).first();
  if (Number(existing?.count || 0) > 0) return json({ error: 'IMPORT_TARGET_NOT_EMPTY' }, 409);

  const { statements: authStatements, userIdByEmployee } = await importAuthStatements(env, canonical, claims, organizationId);
  const statements = [...authStatements];
  const order = ['clients','projects','employees','projectAssignments','outlets','products','projectProducts','visits','attendance','productSales','surveyTemplates','surveyResponses'];
  for (const entity of order) {
    for (const row of canonical[entity] || []) {
      const extras = entity === 'employees' ? { authUserId: userIdByEmployee.get(str(row.id)) || null } : {};
      statements.push(...upsertStatements(env, entity, row, organizationId, extras));
      if (entity === 'projectAssignments') statements.push(membershipRefreshStatement(env, organizationId, str(row.employeeId), str(row.projectId)));
    }
  }
  const nextRevision = Number(state.revision || 0) + 1;
  statements.push(env.DB.prepare("UPDATE core_sync_state SET revision=?,cutover_mode='cloud',imported_at=CURRENT_TIMESTAMP,last_mutation_id='legacy-import',updated_at=CURRENT_TIMESTAMP WHERE organization_id=?").bind(nextRevision,organizationId));
  await env.DB.batch(statements);
  return json({ ok: true, imported: validation.count, revision: nextRevision, cutoverMode: 'cloud' }, 201);
}

async function existingRow(env, entity, organizationId, row) {
  if (entity === 'projectProducts') return env.DB.prepare('SELECT organization_id,project_id,product_id,status FROM core_project_products WHERE organization_id=? AND project_id=? AND product_id=?').bind(organizationId,str(row.projectId),str(row.productId)).first();
  const table = ENTITY_TABLES[entity];
  if (!table || !row?.id) return null;
  return env.DB.prepare(`SELECT * FROM ${table} WHERE organization_id=? AND id=? LIMIT 1`).bind(organizationId,str(row.id)).first();
}

async function handleSync(request, env, claims) {
  const organizationId = claims.organizationId;
  const body = await request.json().catch(() => ({}));
  const mutationId = str(body.mutationId || request.headers.get('idempotency-key'));
  const baseRevision = Number(body.baseRevision);
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (!mutationId || !Number.isInteger(baseRevision) || baseRevision < 0) return json({ error: 'INVALID_SYNC_REQUEST' }, 400);
  if (!changes.length || changes.length > MAX_CHANGES) return json({ error: 'INVALID_CHANGE_COUNT', max: MAX_CHANGES }, 400);

  const prior = await env.DB.prepare('SELECT applied_revision FROM core_sync_mutations WHERE organization_id=? AND mutation_id=?').bind(organizationId,mutationId).first();
  if (prior) return json({ ok: true, idempotent: true, revision: Number(prior.applied_revision) });
  const state = await syncState(env, organizationId);
  if (state.cutover_mode !== 'cloud') return json({ error: 'CUTOVER_REQUIRED' }, 409);
  const currentRevision = Number(state.revision || 0);
  if (currentRevision !== baseRevision) return json({ error: 'REVISION_CONFLICT', revision: currentRevision }, 409);

  const accessibleEmployeeIds = await employeeAccess(env, claims);
  const batchAssignments = changes.filter(change => change?.entity === 'projectAssignments' && change?.op !== 'delete').map(change => change.row || {});
  const statements = [];
  for (const change of changes) {
    const entity = str(change?.entity);
    const op = str(change?.op);
    if (!ENTITY_TABLES[entity] || !['upsert','delete'].includes(op)) return json({ error: 'INVALID_CHANGE', entity, op }, 400);
    const row = change.row || {};
    const existing = await existingRow(env, entity, organizationId, row);
    if (!authorizeOperationalChange(claims, entity, change, { existing, accessibleEmployeeIds, batchAssignments })) return json({ error: 'CHANGE_FORBIDDEN', entity, id: row.id || null }, 403);
    if (op === 'delete') statements.push(...deleteStatements(env, entity, row, organizationId));
    else {
      let extras = {};
      if (entity === 'employees' && row.email) {
        const user = await env.DB.prepare('SELECT id FROM auth_users WHERE lower(email)=lower(?) LIMIT 1').bind(str(row.email)).first();
        extras = { authUserId: user?.id || null };
      }
      statements.push(...upsertStatements(env, entity, row, organizationId, extras));
    }
    if (entity === 'projectAssignments') statements.push(membershipRefreshStatement(env, organizationId, str(row.employeeId || existing?.employee_id), str(row.projectId || existing?.project_id)));
  }
  const nextRevision = currentRevision + 1;
  statements.push(env.DB.prepare('INSERT INTO core_sync_mutations(organization_id,mutation_id,actor_user_id,base_revision,applied_revision,change_count) VALUES(?,?,?,?,?,?)').bind(organizationId,mutationId,claims.sub,currentRevision,nextRevision,changes.length));
  statements.push(env.DB.prepare('UPDATE core_sync_state SET revision=?,last_mutation_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND revision=?').bind(nextRevision,mutationId,organizationId,currentRevision));
  await env.DB.batch(statements);
  return json({ ok: true, revision: nextRevision, applied: changes.length });
}

export async function handleOperationalRoute(request, env, claims, url = new URL(request.url)) {
  if (!url.pathname.startsWith('/api/core/')) return null;
  if (env.CORE_DATA_API_ENABLED !== 'true') return json({ error: 'CORE_DATA_API_LOCKED' }, 503);
  if (!claims?.organizationId) return json({ error: 'ORGANIZATION_REQUIRED' }, 409);
  if (url.pathname === '/api/core/bootstrap' && request.method === 'GET') return handleBootstrap(env, claims);
  if (url.pathname === '/api/core/import' && request.method === 'POST') return handleImport(request, env, claims);
  if (url.pathname === '/api/core/sync' && request.method === 'POST') return handleSync(request, env, claims);
  return json({ error: 'NOT_FOUND' }, 404);
}
