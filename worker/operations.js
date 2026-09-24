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
  leaves: 'leaves',
  stocks: 'stocks',
  priceObservations: 'priceObservations',
  competitorIntel: 'competitorIntel',
  outletProposals: 'outletProposals',
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
  leaves: 'core_leaves',
  stocks: 'core_stocks',
  priceObservations: 'core_price_observations',
  competitorIntel: 'core_competitor_intel',
  outletProposals: 'core_outlet_proposals',
});

const ADMIN_ENTITIES = new Set(['clients', 'projects', 'employees', 'projectAssignments', 'outlets', 'products', 'surveyTemplates', 'projectProducts', 'competitors', 'competitorProducts', 'attendancePoints']);
const FIELD_ENTITIES = new Set(['visits', 'attendance', 'productSales', 'surveyResponses', 'leaves', 'stocks', 'priceObservations', 'competitorIntel', 'outletProposals']);
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
    const employeeStatus = str(employee.status || employee.employmentStatus || employee.employment_status || 'active').toLowerCase();
    if (employeeStatus !== 'active') continue;
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
  data.priceObservations = data.priceObservations.filter(row => str(row.id) && outletsById.has(str(row.outletId)) && productsById.has(str(row.productId)) && employeesById.has(str(row.employeeId || row.recordedBy))).map(row => ({ ...row, organizationId, employeeId: str(row.employeeId || row.recordedBy), recordedBy: str(row.employeeId || row.recordedBy), projectId: inferProject(row) }));
  const competitorProductIds = new Set((data.competitorProducts || []).map(row => str(row.id)).filter(Boolean));
  data.competitorIntel = data.competitorIntel.filter(row => str(row.id) && outletsById.has(str(row.outletId)) && employeesById.has(str(row.employeeId || row.recordedBy))).map(row => ({ ...row, organizationId, employeeId: str(row.employeeId || row.recordedBy), recordedBy: str(row.employeeId || row.recordedBy), productId: productsById.has(str(row.productId)) ? str(row.productId) : null, competitorProductId: competitorProductIds.has(str(row.competitorProductId)) ? str(row.competitorProductId) : null, projectId: inferProject(row) }));
  data.outletProposals = data.outletProposals.filter(row => str(row.id) && employeesById.has(str(row.employeeId || row.submittedBy))).map(row => ({ ...row, organizationId, employeeId: str(row.employeeId || row.submittedBy), submittedBy: str(row.employeeId || row.submittedBy), projectId: inferProject(row) }));
  data.leaves = data.leaves.filter(row => str(row.id) && employeesById.has(str(row.employeeId))).map(row => ({ ...row, organizationId }));
  data.stocks = data.stocks.filter(row => str(row.id) && outletsById.has(str(row.outletId)) && productsById.has(str(row.productId))).map(row => ({ ...row, organizationId, projectId: inferProject(row) }));
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

const finalVisitStatuses = new Set(['completed','cancelled','rejected']);
const canonicalVisitStatus = value => str(value || 'planned') === 'checked-in' ? 'in_progress' : str(value || 'planned');
const finiteCoordinate = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const hasVisitExecutionEvidence = row => [
  'checkInTime','checkOutTime','startedAt','completedAt','checkInAt','checkOutAt',
  'lat','lng','checkInLat','checkInLng','startLatitude','startLongitude',
  'checkOutLat','checkOutLng','endLatitude','endLongitude','checkInCapturedAt','checkOutCapturedAt',
].some(key => row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '');

function visitDistanceMeters(lat1, lng1, lat2, lng2) {
  const values = [lat1,lng1,lat2,lng2].map(Number);
  if (!values.every(Number.isFinite)) return null;
  const toRad = value => value * Math.PI / 180;
  const [aLat,aLng,bLat,bLng] = values;
  const dLat = toRad(bLat-aLat);
  const dLng = toRad(bLng-aLng);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng/2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}

async function applyVisitGeofenceAuthority(env, organizationId, row, existing) {
  if (!existing) return null;
  const currentStatus = canonicalVisitStatus(existing.status);
  const nextStatus = canonicalVisitStatus(row.status || existing.status);
  const isCheckIn = currentStatus === 'planned' && nextStatus === 'in_progress';
  const isCheckOut = currentStatus === 'in_progress' && nextStatus === 'completed';
  if (!isCheckIn && !isCheckOut) return null;

  const outletId = str(row.outletId || row.outlet_id || existing.outlet_id || existing.outletId);
  const outlet = await env.DB.prepare(
    'SELECT id,latitude,longitude,geofence_radius_m,status FROM core_outlets WHERE organization_id=? AND id=? LIMIT 1'
  ).bind(organizationId,outletId).first();
  if (!outlet || outlet.status !== 'active' || !finiteCoordinate(outlet.latitude) || !finiteCoordinate(outlet.longitude)) {
    if (isCheckIn) return { error:'VISIT_GEOFENCE_UNAVAILABLE', status:409 };
    return null;
  }
  const radiusRaw = Number(outlet.geofence_radius_m);
  const radiusM = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 50;
  const lat = firstValue(row, isCheckIn
    ? ['checkInLat','startLatitude','lat','start_latitude']
    : ['checkOutLat','endLatitude','end_latitude']);
  const lng = firstValue(row, isCheckIn
    ? ['checkInLng','startLongitude','lng','start_longitude']
    : ['checkOutLng','endLongitude','end_longitude']);
  if (!finiteCoordinate(lat) || !finiteCoordinate(lng)) {
    return isCheckIn ? { error:'VISIT_GPS_REQUIRED', status:422 } : null;
  }
  const distanceM = visitDistanceMeters(lat,lng,outlet.latitude,outlet.longitude);
  if (isCheckIn) {
    row.geofenceDistanceM = distanceM;
    row.geofenceRadiusM = radiusM;
    row.geofenceStatus = distanceM <= radiusM ? 'valid' : 'outside';
    if (distanceM > radiusM) return { error:'VISIT_OUTSIDE_GEOFENCE', status:422, distanceM, radiusM };
  } else {
    row.checkOutGeofenceDistanceM = distanceM;
    row.checkOutGeofenceRadiusM = radiusM;
    row.checkOutGeofenceStatus = distanceM <= radiusM ? 'valid' : 'outside';
  }
  return null;
}

const finalLeaveStatuses = new Set(['approved','rejected']);

const firstValue = (row, keys) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return row[key];
  }
  return null;
};

const unchangedIfProvided = (incoming, existing, incomingKeys, existingKeys = incomingKeys) => {
  const next = firstValue(incoming, incomingKeys);
  if (next === null) return true;
  const current = firstValue(existing, existingKeys);
  return String(next) === String(current ?? '');
};

export function operationalTransitionAllowed(claims, entity, change, context = {}) {
  const role = roleOf(claims);
  const op = str(change?.op || 'upsert');
  const row = change?.row || {};
  const existing = context.existing || null;

  if (entity === 'visits') {
    if (!existing) {
      return op === 'upsert'
        && canonicalVisitStatus(row.status || 'planned') === 'planned'
        && !hasVisitExecutionEvidence(row);
    }
    if (op === 'delete') return false;
    if (finalVisitStatuses.has(canonicalVisitStatus(existing.status))) return false;
    if (!unchangedIfProvided(row, existing, ['projectId','project_id'], ['project_id','projectId'])) return false;
    if (!unchangedIfProvided(row, existing, ['outletId','outlet_id'], ['outlet_id','outletId'])) return false;
    if (!unchangedIfProvided(row, existing, ['employeeId','employee_id'], ['employee_id','employeeId'])) return false;

    const currentStatus = canonicalVisitStatus(existing.status || 'planned');
    const nextStatus = canonicalVisitStatus(row.status || currentStatus);
    if (currentStatus === 'in_progress') {
      if (!unchangedIfProvided(row, existing, ['startedAt','checkInAt','checkInTime','started_at'], ['started_at','startedAt','checkInAt','checkInTime'])) return false;
      if (!unchangedIfProvided(row, existing, ['startLatitude','checkInLat','lat','start_latitude'], ['start_latitude','startLatitude','checkInLat','lat'])) return false;
      if (!unchangedIfProvided(row, existing, ['startLongitude','checkInLng','lng','start_longitude'], ['start_longitude','startLongitude','checkInLng','lng'])) return false;
    }
    const allowed = currentStatus === 'planned'
      ? new Set(['planned','in_progress','cancelled'])
      : currentStatus === 'in_progress'
        ? new Set(['in_progress','completed'])
        : new Set([currentStatus]);
    if (!allowed.has(nextStatus)) return false;

    if (currentStatus === 'planned' && nextStatus === 'in_progress') {
      return str(row.locationSource) === 'device_gps'
        && finiteCoordinate(firstValue(row,['checkInLat','startLatitude','lat','start_latitude']))
        && finiteCoordinate(firstValue(row,['checkInLng','startLongitude','lng','start_longitude']))
        && !!firstValue(row,['startedAt','checkInCapturedAt','checkInAt','started_at']);
    }
    if (currentStatus === 'in_progress' && nextStatus === 'completed') {
      return finiteCoordinate(firstValue(row,['checkOutLat','endLatitude','end_latitude']))
        && finiteCoordinate(firstValue(row,['checkOutLng','endLongitude','end_longitude']))
        && !!firstValue(row,['completedAt','checkOutCapturedAt','checkOutAt','completed_at']);
    }
    return true;
  }

  if (entity === 'projectAssignments') {
    if (op === 'delete') return false;
    if (!existing) return op === 'upsert' && ['active','assigned'].includes(str(row.status || 'active'));
    if (!unchangedIfProvided(row, existing, ['projectId','project_id'], ['project_id','projectId'])) return false;
    if (!unchangedIfProvided(row, existing, ['employeeId','employee_id'], ['employee_id','employeeId'])) return false;
    const currentStatus = ({ removed:'ended', assigned:'active' }[str(existing.status)] || str(existing.status));
    const nextStatus = ({ removed:'ended', assigned:'active' }[str(row.status || currentStatus)] || str(row.status || currentStatus));
    if (currentStatus === 'ended') return false;
    return currentStatus === 'active' && ['active','ended'].includes(nextStatus);
  }

  if (BROAD_ROLES.has(role)) return true;
  if (!existing) return op === 'upsert';
  if (op === 'delete' && ['attendance','leaves'].includes(entity)) return false;

  if (entity === 'attendance') {
    if (!unchangedIfProvided(row, existing, ['projectId','project_id'], ['project_id','projectId'])) return false;
    if (!unchangedIfProvided(row, existing, ['employeeId','employee_id'], ['employee_id','employeeId'])) return false;
    if (!unchangedIfProvided(row, existing, ['workDate','date','work_date'], ['work_date','workDate','date'])) return false;
    if (!unchangedIfProvided(row, existing, ['status'], ['status'])) return false;
    for (const pair of [
      [['checkInAt','checkInTime','check_in_at'],['check_in_at','checkInAt','checkInTime']],
      [['checkInLatitude','lat','check_in_latitude'],['check_in_latitude','checkInLatitude','lat']],
      [['checkInLongitude','lng','check_in_longitude'],['check_in_longitude','checkInLongitude','lng']],
      [['checkOutAt','checkOutTime','check_out_at'],['check_out_at','checkOutAt','checkOutTime']],
      [['checkOutLatitude','check_out_latitude'],['check_out_latitude','checkOutLatitude']],
      [['checkOutLongitude','check_out_longitude'],['check_out_longitude','checkOutLongitude']],
    ]) {
      const current = firstValue(existing, pair[1]);
      if (current !== null && !unchangedIfProvided(row, existing, pair[0], pair[1])) return false;
    }
    return true;
  }

  if (entity === 'leaves') {
    if (finalLeaveStatuses.has(str(existing.status))) return false;
    if (!unchangedIfProvided(row, existing, ['employeeId','employee_id'], ['employee_id','employeeId'])) return false;
    if (!unchangedIfProvided(row, existing, ['submittedAt','submitted_at'], ['submitted_at','submittedAt'])) return false;
    const nextStatus = str(row.status || existing.status || 'pending');
    if (role === 'employee') {
      if (!unchangedIfProvided(row, existing, ['approverId','approver_id'], ['approver_id','approverId'])) return false;
      if (!unchangedIfProvided(row, existing, ['approvedAt','approved_at'], ['approved_at','approvedAt'])) return false;
      return nextStatus === 'pending';
    }
    return ['pending','approved','rejected'].includes(nextStatus);
  }

  if (entity === 'outletProposals') {
    if (['approved','rejected'].includes(str(existing.status))) return false;
    if (!unchangedIfProvided(row, existing, ['projectId','project_id'], ['project_id','projectId'])) return false;
    if (!unchangedIfProvided(row, existing, ['submittedBy','employeeId','submitted_by'], ['submitted_by','employeeId','submittedBy'])) return false;
    if (!unchangedIfProvided(row, existing, ['submittedAt','submitted_at'], ['submitted_at','submittedAt'])) return false;
    if (role === 'employee') {
      return unchangedIfProvided(row, existing, ['status'], ['status'])
        && unchangedIfProvided(row, existing, ['supervisorStatus','supervisor_status'], ['supervisor_status','supervisorStatus'])
        && unchangedIfProvided(row, existing, ['managerStatus','manager_status'], ['manager_status','managerStatus']);
    }
    if (role === 'supervisor') {
      return unchangedIfProvided(row, existing, ['managerStatus','manager_status'], ['manager_status','managerStatus']);
    }
    if (role === 'manager') {
      return unchangedIfProvided(row, existing, ['supervisorStatus','supervisor_status'], ['supervisor_status','supervisorStatus']);
    }
    return false;
  }

  return true;
}

export async function applyOutletProposalAuthority(env, claims, organizationId, row, existing = null, actorEmployeeId = '') {
  const role = roleOf(claims);
  if (!existing) {
    if (role !== 'employee') return { error:'OUTLET_PROPOSAL_CREATE_FORBIDDEN', status:403 };
    if (!actorEmployeeId) return { error:'OUTLET_PROPOSAL_ACTOR_EMPLOYEE_REQUIRED', status:403 };
    const projectId = str(row.projectId || row.project_id);
    if (!projectId || !projectAllowed(claims, projectId)) return { error:'OUTLET_PROPOSAL_PROJECT_FORBIDDEN', status:403 };
    const project = await env.DB.prepare(
      'SELECT id,metadata_json FROM core_projects WHERE organization_id=? AND id=? LIMIT 1'
    ).bind(organizationId,projectId).first();
    if (!project) return { error:'OUTLET_PROPOSAL_PROJECT_NOT_FOUND', status:422 };
    const projectMeta = parseMetadata(project.metadata_json);
    const approvalMode = str(projectMeta.outletApprovalMode) === 'manual' ? 'manual' : 'auto';
    row.submittedBy = actorEmployeeId;
    row.employeeId = actorEmployeeId;
    row.approvalMode = approvalMode;
    row.status = approvalMode === 'auto' ? 'approved' : 'pending';
    row.supervisorStatus = approvalMode === 'auto' ? 'approved' : 'pending';
    row.managerStatus = approvalMode === 'auto' ? 'approved' : 'pending';
    if (approvalMode === 'auto') {
      row.approvedAt = new Date().toISOString();
      row.approvedBy = 'system:auto';
    }
    return null;
  }

  if (str(existing.status) !== 'pending') return { error:'OUTLET_PROPOSAL_FINAL', status:409 };
  const currentSupervisor = str(existing.supervisor_status || existing.supervisorStatus || 'pending');
  const currentManager = str(existing.manager_status || existing.managerStatus || 'pending');
  const requestedSupervisor = str(row.supervisorStatus || row.supervisor_status || currentSupervisor);
  const requestedManager = str(row.managerStatus || row.manager_status || currentManager);

  if (role === 'supervisor') {
    if (!['approved','rejected'].includes(requestedSupervisor)) return { error:'OUTLET_PROPOSAL_DECISION_REQUIRED', status:422 };
    row.supervisorStatus = requestedSupervisor;
    row.managerStatus = currentManager;
  } else if (role === 'manager' || BROAD_ROLES.has(role)) {
    if (!['approved','rejected'].includes(requestedManager)) return { error:'OUTLET_PROPOSAL_DECISION_REQUIRED', status:422 };
    row.supervisorStatus = currentSupervisor;
    row.managerStatus = requestedManager;
  } else {
    return { error:'OUTLET_PROPOSAL_REVIEW_FORBIDDEN', status:403 };
  }

  row.submittedBy = str(existing.submitted_by || existing.submittedBy);
  row.employeeId = row.submittedBy;
  row.projectId = str(existing.project_id || existing.projectId);
  row.outletId = str(existing.outlet_id || existing.outletId);
  row.submittedAt = str(existing.submitted_at || existing.submittedAt);
  row.status = row.supervisorStatus === 'rejected' || row.managerStatus === 'rejected'
    ? 'rejected'
    : row.supervisorStatus === 'approved' && row.managerStatus === 'approved'
      ? 'approved'
      : 'pending';
  return null;
}

async function approvedProposalOutlet(env, organizationId, row, existing) {
  if (str(row.status) !== 'approved') return { statements:[] };
  const meta = existing ? parseMetadata(existing.metadata_json) : { ...row };
  const projectId = str(existing?.project_id || row.projectId || row.project_id);
  const project = await env.DB.prepare(
    'SELECT id,client_id FROM core_projects WHERE organization_id=? AND id=? LIMIT 1'
  ).bind(organizationId,projectId).first();
  if (!project) return { error:'OUTLET_PROPOSAL_PROJECT_NOT_FOUND', status:422 };

  const outletRow = {
    ...meta,
    id:str(existing?.outlet_id || row.outletId || row.outlet_id || meta.outletId),
    outletNumber:str(meta.outletNumber || meta.code || existing?.outlet_id || row.outletId),
    code:str(meta.outletNumber || meta.code || existing?.outlet_id || row.outletId),
    name:str(existing?.name || row.name || meta.name),
    address:str(existing?.address || row.address || meta.address),
    clientId:str(project.client_id),
    projectIds:[projectId],
    status:'active',
    lat:num(meta.lat ?? meta.latitude),
    lng:num(meta.lng ?? meta.longitude),
  };
  const validation = await validateOutletMutation(env, organizationId, outletRow, null, { op:'upsert', existingProjectIds:[] });
  if (validation) return validation;
  return { statements:upsertStatements(env, 'outlets', outletRow, organizationId) };
}

async function crossTenantIdConflict(env, organizationId, entries = []) {
  const grouped = new Map();
  for (const entry of entries) {
    const entity = str(entry?.entity);
    const id = str(entry?.row?.id);
    if (!id || entity === 'projectProducts' || !ENTITY_TABLES[entity]) continue;
    if (!grouped.has(entity)) grouped.set(entity, new Set());
    grouped.get(entity).add(id);
  }
  for (const [entity, idSet] of grouped) {
    const table = ENTITY_TABLES[entity];
    const ids = [...idSet];
    for (let offset = 0; offset < ids.length; offset += 80) {
      const chunk = ids.slice(offset, offset + 80);
      const placeholders = chunk.map(() => '?').join(',');
      const result = await env.DB.prepare(
        `SELECT id,organization_id FROM ${table} WHERE id IN (${placeholders}) AND organization_id<>? LIMIT 1`
      ).bind(...chunk, organizationId).first();
      if (result) return { entity, id: str(result.id) };
    }
  }
  return null;
}

export function authorizeOperationalChange(claims, entity, change, context = {}) {
  const role = roleOf(claims);
  const row = change?.row || context.existing || {};
  if (!ENTITY_TABLES[entity]) return false;
  if (!operationalTransitionAllowed(claims, entity, change, context)) return false;
  if (entity === 'visits' && context.existing) {
    const currentStatus = canonicalVisitStatus(context.existing.status);
    const nextStatus = canonicalVisitStatus(row.status || context.existing.status);
    const executionTransition = (currentStatus === 'planned' && nextStatus === 'in_progress')
      || (currentStatus === 'in_progress' && nextStatus === 'completed');
    const targetEmployeeId = str(row.employeeId || row.employee_id || context.existing.employee_id || context.existing.employeeId);
    if (executionTransition && (!context.actorEmployeeId || targetEmployeeId !== context.actorEmployeeId)) return false;
  }
  if (BROAD_ROLES.has(role)) return true;
  const projectId = str(row.projectId || row.project_id || context.existing?.project_id || context.existing?.projectId);
  const employeeId = str(row.employeeId || row.recordedBy || row.submittedBy || row.updatedBy || row.employee_id || row.recorded_by || row.submitted_by || context.existing?.employee_id || context.existing?.recorded_by || context.existing?.submitted_by || context.existing?.employeeId);
  if (entity === 'leaves' && ['manager','supervisor','employee'].includes(role)) {
    if (!employeeId || !context.accessibleEmployeeIds?.has(employeeId)) return false;
    if (role === 'employee' && context.existing) {
      return str(row.status || context.existing.status) === str(context.existing.status);
    }
    return true;
  }
  if (role === 'manager') {
    if (entity === 'clients') return false;
    if (entity === 'employees') {
      if (context.existing && !context.accessibleEmployeeIds?.has(str(context.existing.id))) return false;
      if (!context.existing) return context.batchAssignments?.some(a => str(a.employeeId) === str(row.id) && projectAllowed(claims, str(a.projectId)));
      return true;
    }
    if (entity === 'projects') {
      if (!context.existing || !projectAllowed(claims, str(row.id))) return false;
      const currentClientId = str(context.existing.client_id || context.existing.clientId);
      const nextClientId = str(row.clientId || row.client_id || currentClientId);
      return !!currentClientId && nextClientId === currentClientId && clientAllowed(claims, currentClientId);
    }
    if (entity === 'outlets' || entity === 'products') {
      const projectIds = unique(row.projectIds?.length ? row.projectIds : [projectId]);
      if (!projectIds.length || !projectIds.every(id => projectAllowed(claims, id))) return false;
      if (entity === 'outlets' && context.existing) {
        const existingProjectIds = unique(context.existingProjectIds || []);
        if (!existingProjectIds.length || !existingProjectIds.every(id => projectAllowed(claims, id))) return false;
      }
      return true;
    }
    if (['competitors','competitorProducts'].includes(entity)) return false;
    if (entity === 'attendancePoints') return true;
    if (entity === 'projectAssignments') {
      return projectAllowed(claims, projectId) && !!employeeId && context.accessibleEmployeeIds?.has(employeeId);
    }
    if (entity === 'projectProducts' || entity === 'surveyTemplates') return projectAllowed(claims, projectId);
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
    case 'clients': {
      const uiStatus = safeStatus(row.status, ['active','inactive','archived','prospect'], 'active');
      return { ...base, id: str(row.id), code: str(row.code || row.id), name: str(row.name), uiStatus, status: uiStatus === 'prospect' ? 'active' : uiStatus };
    }
    case 'projects': {
      const uiStatus = safeStatus(row.status, ['draft','active','paused','closed','archived','planning','on_hold','completed','cancelled'], 'active');
      const status = ({ planning:'draft', on_hold:'paused', completed:'closed', cancelled:'closed' }[uiStatus] || uiStatus);
      return { ...base, id: str(row.id), clientId: str(row.clientId), code: str(row.code || row.id), name: str(row.name), uiStatus, status };
    }
    case 'employees': return { ...base, id: str(row.id), authUserId: extras.authUserId || row.authUserId || null, employeeCode: str(row.employeeCode || row.code || row.id), name: str(row.name || row.fullName), status: safeStatus(row.status, ['active','inactive','terminated'], 'active') };
    case 'projectAssignments': return { ...base, id: str(row.id), projectId: str(row.projectId), employeeId: str(row.employeeId), status: ({ removed: 'ended', assigned: 'active' }[str(row.status)] || safeStatus(row.status, ['active','inactive','ended'], 'active')) };
    case 'outlets': return { ...base, id: str(row.id), clientId: str(row.clientId), code: str(row.outletNumber || row.code || row.id), name: str(row.name || 'Outlet'), projectIds: unique(row.projectIds?.length ? row.projectIds : (row.projectId ? [row.projectId] : [])), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    case 'visits': {
      const uiStatus = str(row.status || 'planned');
      const status = uiStatus === 'checked-in'
        ? 'in_progress'
        : safeStatus(uiStatus, ['planned','in_progress','completed','cancelled','rejected'], 'planned');
      return { ...base, id: str(row.id), projectId: str(row.projectId), outletId: str(row.outletId), employeeId: str(row.employeeId), uiStatus, status };
    }
    case 'attendance': return { ...base, id: str(row.id), projectId: str(row.projectId), employeeId: str(row.employeeId), workDate: str(row.workDate || row.date), status: safeStatus(str(row.status).toLowerCase(), ['present','late','absent','leave','rejected'], 'present') };
    case 'products': return { ...base, id: str(row.id), clientId: str(row.clientId), sku: str(row.sku || row.id), name: str(row.name || 'Product'), projectIds: unique(row.projectIds?.length ? row.projectIds : (row.projectId ? [row.projectId] : [])), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    case 'productSales': return { ...base, id: str(row.id), projectId: str(row.projectId), outletId: str(row.outletId), employeeId: str(row.employeeId), productId: str(row.productId), quantity: num(row.quantity ?? row.qty) ?? 0, unitPrice: num(row.unitPrice ?? row.price), totalAmount: num(row.totalAmount ?? row.amount), soldAt: str(row.soldAt || row.date || row.createdAt || new Date().toISOString()) };
    case 'surveyTemplates': return { ...base, id: str(row.id), clientId: str(row.clientId), projectId: nullable(str(row.projectId)), name: str(row.name || row.title || 'Survey'), status: safeStatus(row.status, ['draft','active','closed','archived'], 'draft') };
    case 'surveyResponses': return { ...base, id: str(row.id), templateId: str(row.templateId), projectId: str(row.projectId), outletId: nullable(str(row.outletId)), employeeId: str(row.employeeId), visitId: nullable(str(row.visitId)), status: safeStatus(row.status, ['draft','submitted','rejected'], 'submitted') };
    case 'projectProducts': return { ...base, projectId: str(row.projectId), productId: str(row.productId), status: safeStatus(row.status, ['active','inactive'], 'active') };
    case 'competitors': return { ...base, id: str(row.id), code: str(row.code || row.id), name: str(row.name || 'Competitor'), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    case 'competitorProducts': return { ...base, id: str(row.id), competitorId: str(row.competitorId), sku: str(row.sku || row.id), name: str(row.name || 'Competitor Product'), unit: str(row.unit || 'pcs'), typicalPrice: num(row.typicalPrice), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    case 'attendancePoints': return { ...base, id: str(row.id), code: str(row.code || row.id), name: str(row.name || 'Attendance Point'), type: safeStatus(row.type, ['office','meeting','store','point'], 'point'), outletId: nullable(str(row.outletId)), latitude: num(row.latitude ?? row.lat), longitude: num(row.longitude ?? row.lng), radiusM: num(row.radiusM), status: safeStatus(row.status, ['active','inactive','archived'], 'active') };
    case 'leaves': return { ...base, id: str(row.id), employeeId: str(row.employeeId), type: str(row.type || 'Cuti Tahunan'), startDate: str(row.startDate), endDate: str(row.endDate), days: Math.max(1, Number(row.days) || 1), reason: str(row.reason), status: safeStatus(row.status, ['pending','approved','rejected'], 'pending'), approverId: nullable(str(row.approverId)), submittedAt: str(row.submittedAt || new Date().toISOString().slice(0,10)), approvedAt: nullable(str(row.approvedAt)) };
    case 'stocks': return { ...base, id: str(row.id), projectId: str(row.projectId), outletId: str(row.outletId), productId: str(row.productId), quantity: Math.max(0, Number(row.quantity) || 0), minStock: Math.max(0, Number(row.minStock) || 0), updatedBy: nullable(str(row.updatedBy)), lastUpdated: str(row.lastUpdated || new Date().toISOString().slice(0,10)) };
    case 'priceObservations': return { ...base, id: str(row.id), projectId: str(row.projectId), outletId: str(row.outletId), productId: str(row.productId), employeeId: str(row.employeeId || row.recordedBy), visitId: nullable(str(row.visitId)), observedPrice: Math.max(0, Number(row.observedPrice) || 0), discountPercent: Math.min(100, Math.max(0, Number(row.discountPercent) || 0)), discountAmount: Math.max(0, Number(row.discountAmount) || 0), notes: str(row.notes), recordedAt: str(row.recordedAt || new Date().toISOString()) };
    case 'competitorIntel': return { ...base, id: str(row.id), projectId: str(row.projectId), outletId: str(row.outletId), productId: nullable(str(row.productId)), competitorProductId: nullable(str(row.competitorProductId)), employeeId: str(row.employeeId || row.recordedBy), visitId: nullable(str(row.visitId)), ourPrice: Math.max(0, Number(row.ourPrice) || 0), competitorPrice: Math.max(0, Number(row.competitorPrice) || 0), shelfShare: Math.min(100, Math.max(0, Number(row.shelfShare) || 0)), visibility: safeStatus(row.visibility, ['high','medium','low'], 'medium'), hasPromo: !!row.hasPromo, promoType: str(row.promoType), promoNotes: str(row.promoNotes || row.promoNote), notes: str(row.notes), recordedAt: str(row.recordedAt || new Date().toISOString()) };
    case 'outletProposals': {
      const supervisorStatus = safeStatus(row.supervisorStatus, ['pending','approved','rejected'], 'pending');
      const managerStatus = safeStatus(row.managerStatus, ['pending','approved','rejected'], 'pending');
      const status = supervisorStatus === 'rejected' || managerStatus === 'rejected'
        ? 'rejected'
        : supervisorStatus === 'approved' && managerStatus === 'approved'
          ? 'approved'
          : 'pending';
      return { ...base, id: str(row.id), projectId: str(row.projectId), outletId: str(row.outletId), employeeId: str(row.employeeId || row.submittedBy), submittedBy: str(row.employeeId || row.submittedBy), name: str(row.name || 'Outlet'), address: str(row.address), status, supervisorStatus, managerStatus, submittedAt: str(row.submittedAt || new Date().toISOString()) };
    }
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
    case 'visits': return [p(`INSERT INTO core_visits(id,organization_id,project_id,outlet_id,employee_id,status,scheduled_at,started_at,completed_at,start_latitude,start_longitude,end_latitude,end_longitude,idempotency_key,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,outlet_id=excluded.outlet_id,employee_id=excluded.employee_id,status=excluded.status,scheduled_at=excluded.scheduled_at,started_at=excluded.started_at,completed_at=excluded.completed_at,start_latitude=excluded.start_latitude,start_longitude=excluded.start_longitude,end_latitude=excluded.end_latitude,end_longitude=excluded.end_longitude,idempotency_key=excluded.idempotency_key,metadata_json=excluded.metadata_json,row_version=core_visits.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_visits.organization_id=excluded.organization_id`, [row.id,organizationId,row.projectId,row.outletId,row.employeeId,row.status,nullable(row.scheduledAt || row.date),nullable(row.startedAt || row.checkInCapturedAt || row.checkInAt),nullable(row.completedAt || row.checkOutCapturedAt || row.checkOutAt),num(row.startLatitude ?? row.checkInLat ?? row.lat),num(row.startLongitude ?? row.checkInLng ?? row.lng),num(row.endLatitude ?? row.checkOutLat),num(row.endLongitude ?? row.checkOutLng),nullable(row.idempotencyKey),m,1])];
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
    case 'leaves': return [p(`INSERT INTO core_leaves(id,organization_id,employee_id,type,start_date,end_date,days,reason,status,approver_id,submitted_at,approved_at,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET employee_id=excluded.employee_id,type=excluded.type,start_date=excluded.start_date,end_date=excluded.end_date,days=excluded.days,reason=excluded.reason,status=excluded.status,approver_id=excluded.approver_id,submitted_at=excluded.submitted_at,approved_at=excluded.approved_at,metadata_json=excluded.metadata_json,row_version=core_leaves.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_leaves.organization_id=excluded.organization_id`, [row.id,organizationId,row.employeeId,row.type,row.startDate,row.endDate,row.days,nullable(row.reason),row.status,row.approverId,row.submittedAt,row.approvedAt,m])];
    case 'stocks': return [p(`INSERT INTO core_stocks(id,organization_id,project_id,outlet_id,product_id,quantity,min_stock,updated_by,last_updated,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,outlet_id=excluded.outlet_id,product_id=excluded.product_id,quantity=excluded.quantity,min_stock=excluded.min_stock,updated_by=excluded.updated_by,last_updated=excluded.last_updated,metadata_json=excluded.metadata_json,row_version=core_stocks.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_stocks.organization_id=excluded.organization_id`, [row.id,organizationId,row.projectId,row.outletId,row.productId,row.quantity,row.minStock,row.updatedBy,row.lastUpdated,m])];
    case 'priceObservations': return [p(`INSERT INTO core_price_observations(id,organization_id,project_id,outlet_id,product_id,employee_id,visit_id,observed_price,discount_percent,discount_amount,notes,recorded_at,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,outlet_id=excluded.outlet_id,product_id=excluded.product_id,employee_id=excluded.employee_id,visit_id=excluded.visit_id,observed_price=excluded.observed_price,discount_percent=excluded.discount_percent,discount_amount=excluded.discount_amount,notes=excluded.notes,recorded_at=excluded.recorded_at,metadata_json=excluded.metadata_json,row_version=core_price_observations.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_price_observations.organization_id=excluded.organization_id`, [row.id,organizationId,row.projectId,row.outletId,row.productId,row.employeeId,row.visitId,row.observedPrice,row.discountPercent,row.discountAmount,nullable(row.notes),row.recordedAt,m])];
    case 'competitorIntel': return [p(`INSERT INTO core_competitor_intel(id,organization_id,project_id,outlet_id,product_id,competitor_product_id,employee_id,visit_id,our_price,competitor_price,shelf_share,visibility,has_promo,promo_type,promo_notes,notes,recorded_at,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,outlet_id=excluded.outlet_id,product_id=excluded.product_id,competitor_product_id=excluded.competitor_product_id,employee_id=excluded.employee_id,visit_id=excluded.visit_id,our_price=excluded.our_price,competitor_price=excluded.competitor_price,shelf_share=excluded.shelf_share,visibility=excluded.visibility,has_promo=excluded.has_promo,promo_type=excluded.promo_type,promo_notes=excluded.promo_notes,notes=excluded.notes,recorded_at=excluded.recorded_at,metadata_json=excluded.metadata_json,row_version=core_competitor_intel.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_competitor_intel.organization_id=excluded.organization_id`, [row.id,organizationId,row.projectId,row.outletId,row.productId,row.competitorProductId,row.employeeId,row.visitId,row.ourPrice,row.competitorPrice,row.shelfShare,row.visibility,row.hasPromo?1:0,nullable(row.promoType),nullable(row.promoNotes),nullable(row.notes),row.recordedAt,m])];
    case 'outletProposals': return [p(`INSERT INTO core_outlet_proposals(id,organization_id,project_id,outlet_id,submitted_by,name,address,status,supervisor_status,manager_status,submitted_at,metadata_json,row_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,outlet_id=excluded.outlet_id,submitted_by=excluded.submitted_by,name=excluded.name,address=excluded.address,status=excluded.status,supervisor_status=excluded.supervisor_status,manager_status=excluded.manager_status,submitted_at=excluded.submitted_at,metadata_json=excluded.metadata_json,row_version=core_outlet_proposals.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE core_outlet_proposals.organization_id=excluded.organization_id`, [row.id,organizationId,row.projectId,row.outletId,row.submittedBy,row.name,nullable(row.address),row.status,row.supervisorStatus,row.managerStatus,row.submittedAt,m])];
    default: return [];
  }
}

function deleteStatements(env, entity, row, organizationId) {
  const p = (sql, args) => env.DB.prepare(sql).bind(...args);
  const id = str(row?.id);
  if (entity === 'projectProducts') return [p('DELETE FROM core_project_products WHERE organization_id=? AND project_id=? AND product_id=?', [organizationId,str(row.projectId),str(row.productId)])];
  if (!id) return [];
  const table = ENTITY_TABLES[entity];
  if (['competitors','competitorProducts'].includes(entity)) {
    return [p(`UPDATE ${table} SET status='archived',row_version=row_version+1,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?`, [organizationId,id])];
  }
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
      case 'clients': return { ...common, code: dbRow.code, name: dbRow.name, status: meta.uiStatus || dbRow.status };
      case 'projects': return { ...common, clientId: dbRow.client_id, code: dbRow.code, name: dbRow.name, status: meta.uiStatus || dbRow.status, startDate: dbRow.starts_on || meta.startDate, endDate: dbRow.ends_on || meta.endDate };
      case 'employees': return { ...common, authUserId: dbRow.auth_user_id || meta.authUserId, employeeCode: dbRow.employee_code, name: dbRow.full_name, email: dbRow.email, phone: dbRow.phone, status: dbRow.employment_status };
      case 'projectAssignments': return { ...common, projectId: dbRow.project_id, employeeId: dbRow.employee_id, supervisorUserId: dbRow.supervisor_user_id, positionName: dbRow.position_name, status: dbRow.status, startDate: dbRow.starts_on, endDate: dbRow.ends_on };
      case 'outlets': return { ...common, clientId: dbRow.client_id, outletNumber: dbRow.code, code: dbRow.code, name: dbRow.name, address: dbRow.address, lat: dbRow.latitude, lng: dbRow.longitude, status: dbRow.status, projectIds: relationMap.get(str(dbRow.id)) || meta.projectIds || [] };
      case 'visits': return {
        ...common,
        projectId: dbRow.project_id,
        outletId: dbRow.outlet_id,
        employeeId: dbRow.employee_id,
        status: meta.uiStatus || (dbRow.status === 'in_progress' ? 'checked-in' : dbRow.status),
        scheduledAt: dbRow.scheduled_at,
        startedAt: dbRow.started_at,
        completedAt: dbRow.completed_at,
        checkInLat: meta.checkInLat ?? dbRow.start_latitude,
        checkInLng: meta.checkInLng ?? dbRow.start_longitude,
        checkOutLat: meta.checkOutLat ?? dbRow.end_latitude,
        checkOutLng: meta.checkOutLng ?? dbRow.end_longitude,
      };
      case 'attendance': return { ...common, projectId: dbRow.project_id, employeeId: dbRow.employee_id, date: dbRow.work_date, workDate: dbRow.work_date, status: dbRow.status, checkInAt: dbRow.check_in_at, checkOutAt: dbRow.check_out_at };
      case 'products': return { ...common, clientId: dbRow.client_id, sku: dbRow.sku, name: dbRow.name, unit: dbRow.unit, status: dbRow.status, projectIds: relationMap.get(str(dbRow.id)) || meta.projectIds || [] };
      case 'productSales': return { ...common, projectId: dbRow.project_id, outletId: dbRow.outlet_id, employeeId: dbRow.employee_id, productId: dbRow.product_id, quantity: dbRow.quantity, unitPrice: dbRow.unit_price, totalAmount: dbRow.total_amount, amount: dbRow.total_amount, soldAt: dbRow.sold_at };
      case 'surveyTemplates': return { ...common, clientId: dbRow.client_id, projectId: dbRow.project_id, name: dbRow.name, status: dbRow.status, version: dbRow.version };
      case 'surveyResponses': return { ...common, templateId: dbRow.template_id, projectId: dbRow.project_id, outletId: dbRow.outlet_id, employeeId: dbRow.employee_id, visitId: dbRow.visit_id, status: dbRow.status, answers: parseMetadata(dbRow.answers_json), submittedAt: dbRow.submitted_at };
      case 'competitors': return { ...common, code: dbRow.code, name: dbRow.name, status: dbRow.status };
      case 'competitorProducts': return { ...common, competitorId: dbRow.competitor_id, sku: dbRow.sku, name: dbRow.name, unit: dbRow.unit, typicalPrice: dbRow.typical_price, status: dbRow.status };
      case 'attendancePoints': return { ...common, code: dbRow.code, name: dbRow.name, type: dbRow.type, address: dbRow.address, outletId: dbRow.outlet_id, lat: dbRow.latitude, lng: dbRow.longitude, radiusM: dbRow.radius_m, status: dbRow.status };
      case 'leaves': return { ...common, employeeId: dbRow.employee_id, type: dbRow.type, startDate: dbRow.start_date, endDate: dbRow.end_date, days: dbRow.days, reason: dbRow.reason, status: dbRow.status, approverId: dbRow.approver_id, submittedAt: dbRow.submitted_at, approvedAt: dbRow.approved_at };
      case 'stocks': return { ...common, projectId: dbRow.project_id, outletId: dbRow.outlet_id, productId: dbRow.product_id, quantity: dbRow.quantity, minStock: dbRow.min_stock, updatedBy: dbRow.updated_by, lastUpdated: dbRow.last_updated };
      case 'priceObservations': return { ...common, projectId: dbRow.project_id, outletId: dbRow.outlet_id, productId: dbRow.product_id, employeeId: dbRow.employee_id, recordedBy: dbRow.employee_id, visitId: dbRow.visit_id, observedPrice: dbRow.observed_price, discountPercent: dbRow.discount_percent, discountAmount: dbRow.discount_amount, notes: dbRow.notes || '', recordedAt: dbRow.recorded_at };
      case 'competitorIntel': return { ...common, projectId: dbRow.project_id, outletId: dbRow.outlet_id, productId: dbRow.product_id, competitorProductId: dbRow.competitor_product_id, employeeId: dbRow.employee_id, recordedBy: dbRow.employee_id, visitId: dbRow.visit_id, ourPrice: dbRow.our_price, competitorPrice: dbRow.competitor_price, shelfShare: dbRow.shelf_share, visibility: dbRow.visibility, hasPromo: !!dbRow.has_promo, promoType: dbRow.promo_type || '', promoNotes: dbRow.promo_notes || '', notes: dbRow.notes || '', recordedAt: dbRow.recorded_at };
      case 'outletProposals': return { ...common, projectId: dbRow.project_id, outletId: dbRow.outlet_id, employeeId: dbRow.submitted_by, submittedBy: dbRow.submitted_by, name: dbRow.name, address: dbRow.address || '', status: dbRow.status, supervisorStatus: dbRow.supervisor_status, managerStatus: dbRow.manager_status, submittedAt: dbRow.submitted_at };
      default: return common;
    }
  });
}

async function bootstrapData(env, claims) {
  const org = claims.organizationId;
  const [clients,projects,employees,assignments,outlets,projectOutlets,visits,attendance,products,projectProducts,sales,surveyTemplates,surveyResponses,competitors,competitorProducts,attendancePoints,leaves,stocks,priceObservations,competitorIntel,outletProposals] = await Promise.all([
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
    allRows(env.DB.prepare('SELECT * FROM core_leaves WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_stocks WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_price_observations WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_competitor_intel WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_outlet_proposals WHERE organization_id=?').bind(org)),
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
    leaves: decodeRows('leaves', leaves),
    stocks: decodeRows('stocks', stocks),
    priceObservations: decodeRows('priceObservations', priceObservations),
    competitorIntel: decodeRows('competitorIntel', competitorIntel),
    outletProposals: decodeRows('outletProposals', outletProposals),
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
    for (const key of ['visits','attendance','productSales','surveyResponses','priceObservations','competitorIntel','outletProposals']) data[key] = data[key].filter(row => allowedProjects.has(str(row.projectId)) && employeesAllowed.has(str(row.employeeId || row.submittedBy)));
    data.leaves = data.leaves.filter(row => employeesAllowed.has(str(row.employeeId)));
    data.stocks = data.stocks.filter(row => allowedProjects.has(str(row.projectId)));
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
  const importEntries = Object.keys(ENTITY_TABLES).flatMap(entity => (canonical[entity] || []).map(row => ({ entity, row })));
  const importConflict = await crossTenantIdConflict(env, organizationId, importEntries);
  if (importConflict) return json({ error: 'ENTITY_ID_CONFLICT', entity: importConflict.entity, id: importConflict.id }, 409);
  if (body.dryRun === true) return json({ ok: true, dryRun: true, ...validation, summary: Object.fromEntries(Object.keys(ENTITY_COLLECTIONS).map(key => [key, canonical[key].length])) });

  const existing = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM core_clients WHERE organization_id=?) +
    (SELECT COUNT(*) FROM core_projects WHERE organization_id=?) +
    (SELECT COUNT(*) FROM core_employees WHERE organization_id=?) +
    (SELECT COUNT(*) FROM core_visits WHERE organization_id=?) AS count`).bind(organizationId,organizationId,organizationId,organizationId).first();
  if (Number(existing?.count || 0) > 0) return json({ error: 'IMPORT_TARGET_NOT_EMPTY' }, 409);

  const { statements: authStatements, userIdByEmployee } = await importAuthStatements(env, canonical, claims, organizationId);
  const statements = [...authStatements];
  const order = ['clients','projects','employees','projectAssignments','outlets','products','projectProducts','competitors','competitorProducts','attendancePoints','visits','attendance','productSales','priceObservations','competitorIntel','outletProposals','surveyTemplates','surveyResponses','leaves','stocks'];
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

async function validateClientMutation(env, organizationId, row, existing = null) {
  const id = str(row.id);
  const name = str(row.name);
  const code = str(row.code || existing?.code || id);
  const status = str(row.status || parseMetadata(existing?.metadata_json)?.uiStatus || existing?.status || 'active');
  if (!id) return { error:'CLIENT_ID_REQUIRED', status:400 };
  if (!name) return { error:'CLIENT_NAME_REQUIRED', status:422 };
  if (!code) return { error:'CLIENT_CODE_REQUIRED', status:422 };
  if (!['active','inactive','archived','prospect'].includes(status)) return { error:'CLIENT_INVALID_STATUS', status:422 };

  const start = str(row.cooperationStart);
  const end = str(row.cooperationEnd);
  if (start && end && end < start) return { error:'CLIENT_INVALID_PERIOD', status:422 };

  const email = str(row.picEmail).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error:'CLIENT_INVALID_EMAIL', status:422 };

  const duplicate = await env.DB.prepare(
    'SELECT id,code,name,metadata_json FROM core_clients WHERE organization_id=? AND id<>? AND (lower(code)=lower(?) OR lower(name)=lower(?)) LIMIT 1'
  ).bind(organizationId,id,code,name).first();
  if (duplicate) {
    if (str(duplicate.code).toLowerCase() === code.toLowerCase()) return { error:'CLIENT_CODE_CONFLICT', status:409 };
    return { error:'CLIENT_NAME_CONFLICT', status:409 };
  }

  const legalName = str(row.legalName);
  if (legalName) {
    const rows = await allRows(env.DB.prepare(
      'SELECT id,metadata_json FROM core_clients WHERE organization_id=? AND id<>?'
    ).bind(organizationId,id));
    const legalConflict = rows.some(item => str(parseMetadata(item.metadata_json)?.legalName).toLowerCase() === legalName.toLowerCase());
    if (legalConflict) return { error:'CLIENT_LEGAL_NAME_CONFLICT', status:409 };
  }
  return null;
}

function projectUiStatus(row = {}, existing = null) {
  const existingMeta = parseMetadata(existing?.metadata_json);
  return str(row.status || row.uiStatus || existingMeta?.uiStatus || existing?.status || 'draft');
}

function projectTransitionAllowed(current, next) {
  if (!current || current === next) return true;
  const allowed = {
    draft:new Set(['active','cancelled']),
    active:new Set(['on_hold','completed','cancelled']),
    on_hold:new Set(['active','completed','cancelled']),
    completed:new Set(),
    cancelled:new Set(),
  };
  return !!allowed[current]?.has(next);
}

async function validateProjectMutation(env, organizationId, row, existing = null, context = {}) {
  const id = str(row.id);
  const name = str(row.name);
  const code = str(row.code || existing?.code || id);
  const clientId = str(row.clientId || existing?.client_id);
  const nextStatus = projectUiStatus(row, existing);
  if (!id) return { error:'PROJECT_ID_REQUIRED', status:400 };
  if (!name) return { error:'PROJECT_NAME_REQUIRED', status:422 };
  if (!code) return { error:'PROJECT_CODE_REQUIRED', status:422 };
  if (!clientId) return { error:'PROJECT_CLIENT_REQUIRED', status:422 };
  if (!['draft','active','on_hold','completed','cancelled'].includes(nextStatus)) return { error:'PROJECT_INVALID_STATUS', status:422 };

  const client = await env.DB.prepare(
    'SELECT id FROM core_clients WHERE organization_id=? AND id=? LIMIT 1'
  ).bind(organizationId,clientId).first();
  if (!client) return { error:'PROJECT_CLIENT_NOT_FOUND', status:422 };

  const start = str(row.startDate || parseMetadata(existing?.metadata_json)?.startDate);
  const finish = str(row.endDate || parseMetadata(existing?.metadata_json)?.endDate);
  if (!start || !finish) return { error:'PROJECT_PERIOD_REQUIRED', status:422 };
  if (finish < start) return { error:'PROJECT_INVALID_PERIOD', status:422 };

  for (const [field, codeName] of [['contractValue','PROJECT_INVALID_CONTRACT_VALUE'],['targetVisits','PROJECT_INVALID_TARGET_VISITS'],['targetOutlets','PROJECT_INVALID_TARGET_OUTLETS']]) {
    const value = row[field];
    if (value != null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      return { error:codeName, status:422 };
    }
  }

  const duplicate = await env.DB.prepare(
    'SELECT id FROM core_projects WHERE organization_id=? AND id<>? AND lower(code)=lower(?) LIMIT 1'
  ).bind(organizationId,id,code).first();
  if (duplicate) return { error:'PROJECT_CODE_CONFLICT', status:409 };

  if (existing) {
    const currentStatus = projectUiStatus({}, existing);
    if (!projectTransitionAllowed(currentStatus, nextStatus)) {
      return { error:'PROJECT_INVALID_TRANSITION', status:409, currentStatus, nextStatus };
    }
    if (['completed','cancelled'].includes(nextStatus) && currentStatus !== nextStatus) {
      const activeAssignments = await allRows(env.DB.prepare(
        "SELECT id FROM core_employee_project_assignments WHERE organization_id=? AND project_id=? AND status='active'"
      ).bind(organizationId,id));
      if (activeAssignments.length) {
        const closingIds = new Set((context.batchAssignments || [])
          .filter(item => str(item.projectId || item.project_id) === id && str(item.status) !== 'active')
          .map(item => str(item.id))
          .filter(Boolean));
        const remaining = activeAssignments.filter(item => !closingIds.has(str(item.id)));
        if (remaining.length) return { error:'PROJECT_ACTIVE_ASSIGNMENTS_REMAIN', status:409, remainingAssignments:remaining.length };
      }
    }
  }
  return null;
}


async function validateEmployeeMutation(env, organizationId, row, existing = null, context = {}) {
  const id = str(row.id || existing?.id);
  const code = str(row.employeeCode || row.code || existing?.employee_code || id);
  const name = str(row.name || row.fullName || existing?.full_name);
  const email = str(row.email || existing?.email).toLowerCase();
  const status = str(row.status || existing?.employment_status || 'active');
  if (!id) return { error:'EMPLOYEE_ID_REQUIRED', status:400 };
  if (!code) return { error:'EMPLOYEE_CODE_REQUIRED', status:422 };
  if (!name) return { error:'EMPLOYEE_NAME_REQUIRED', status:422 };
  if (!['active','inactive','terminated'].includes(status)) return { error:'EMPLOYEE_INVALID_STATUS', status:422 };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error:'EMPLOYEE_INVALID_EMAIL', status:422 };

  const duplicateCode = await env.DB.prepare(
    'SELECT id FROM core_employees WHERE organization_id=? AND lower(employee_code)=lower(?) AND id<>? LIMIT 1'
  ).bind(organizationId,code,id).first();
  if (duplicateCode) return { error:'EMPLOYEE_CODE_CONFLICT', status:409 };
  if (email) {
    const duplicateEmail = await env.DB.prepare(
      'SELECT id FROM core_employees WHERE organization_id=? AND lower(email)=lower(?) AND id<>? LIMIT 1'
    ).bind(organizationId,email,id).first();
    if (duplicateEmail) return { error:'EMPLOYEE_EMAIL_CONFLICT', status:409 };
  }

  if (existing) {
    const existingAuthUserId = str(existing.auth_user_id);
    if (row.authUserId && existingAuthUserId && str(row.authUserId) !== existingAuthUserId) {
      return { error:'EMPLOYEE_AUTH_LINK_IMMUTABLE', status:409 };
    }
    const currentStatus = str(existing.employment_status);
    if (currentStatus === 'terminated' && status !== 'terminated') return { error:'EMPLOYEE_TERMINATED_FINAL', status:409 };
    if (currentStatus !== 'active' && status === 'active') return { error:'EMPLOYEE_REACTIVATION_REQUIRES_STAFFING_FLOW', status:409 };
    if (status !== 'active' && currentStatus === 'active') {
      const activeAssignments = await allRows(env.DB.prepare(
        "SELECT id,project_id FROM core_employee_project_assignments WHERE organization_id=? AND employee_id=? AND status='active'"
      ).bind(organizationId,id));
      if (activeAssignments.length) {
        const closingIds = new Set((context.batchAssignments || [])
          .filter(item => str(item.employeeId || item.employee_id) === id && str(item.status) === 'ended')
          .map(item => str(item.id))
          .filter(Boolean));
        const remaining = activeAssignments.filter(item => !closingIds.has(str(item.id)));
        if (remaining.length) return { error:'EMPLOYEE_ACTIVE_ASSIGNMENTS_REMAIN', status:409, remainingAssignments:remaining.length };
      }
    }
  }

  row.id = id;
  row.employeeCode = code;
  row.name = name;
  row.email = email;
  row.status = status;
  return null;
}

async function validateOutletMutation(env, organizationId, row, existing = null, context = {}) {
  const op = str(context.op || 'upsert');
  const id = str(row.id || existing?.id);
  if (!id) return { error:'OUTLET_ID_REQUIRED', status:400 };

  if (op === 'delete') {
    const references = [
      ['core_visits','outlet_id'],
      ['core_product_sales','outlet_id'],
      ['core_survey_responses','outlet_id'],
      ['core_attendance_points','outlet_id'],
      ['core_field_evidence','outlet_id'],
      ['core_stocks','outlet_id'],
      ['core_price_observations','outlet_id'],
      ['core_competitor_intel','outlet_id'],
    ];
    let referenceCount = 0;
    for (const [table,column] of references) {
      const hit = await env.DB.prepare(
        `SELECT COUNT(*) AS count FROM ${table} WHERE organization_id=? AND ${column}=?`
      ).bind(organizationId,id).first();
      referenceCount += Number(hit?.count || 0);
    }
    if (referenceCount > 0) {
      return { error:'OUTLET_REFERENCED_USE_INACTIVE', status:409, referenceCount };
    }
    return null;
  }

  const name = str(row.name || existing?.name);
  const clientId = str(row.clientId || row.client_id || existing?.client_id);
  const projectIds = unique(row.projectIds?.length ? row.projectIds : context.existingProjectIds || []);
  const status = str(row.status || existing?.status || 'active');
  const lat = num(row.latitude ?? row.lat ?? existing?.latitude);
  const lng = num(row.longitude ?? row.lng ?? existing?.longitude);
  const radius = num(row.geofenceRadiusM ?? row.geofence_radius_m ?? existing?.geofence_radius_m);
  const code = str(row.outletNumber || row.code || existing?.code || id);

  if (!name) return { error:'OUTLET_NAME_REQUIRED', status:422 };
  if (!clientId) return { error:'OUTLET_CLIENT_REQUIRED', status:422 };
  if (!projectIds.length) return { error:'OUTLET_PROJECT_REQUIRED', status:422 };
  if (!['active','inactive','archived'].includes(status)) return { error:'OUTLET_INVALID_STATUS', status:422 };
  if (lat == null || lat < -90 || lat > 90) return { error:'OUTLET_INVALID_LATITUDE', status:422 };
  if (lng == null || lng < -180 || lng > 180) return { error:'OUTLET_INVALID_LONGITUDE', status:422 };
  if (radius != null && radius <= 0) return { error:'OUTLET_INVALID_GEOFENCE_RADIUS', status:422 };

  for (const projectId of projectIds) {
    const project = await env.DB.prepare(
      'SELECT id,client_id FROM core_projects WHERE organization_id=? AND id=? LIMIT 1'
    ).bind(organizationId,projectId).first();
    if (!project) return { error:'OUTLET_PROJECT_NOT_FOUND', status:422 };
    if (str(project.client_id) !== clientId) return { error:'OUTLET_PROJECT_CLIENT_MISMATCH', status:409 };
  }

  const client = await env.DB.prepare(
    'SELECT id FROM core_clients WHERE organization_id=? AND id=? LIMIT 1'
  ).bind(organizationId,clientId).first();
  if (!client) return { error:'OUTLET_CLIENT_NOT_FOUND', status:422 };

  const duplicate = await env.DB.prepare(
    'SELECT id FROM core_outlets WHERE organization_id=? AND client_id=? AND lower(code)=lower(?) AND id<>? LIMIT 1'
  ).bind(organizationId,clientId,code,id).first();
  if (duplicate) return { error:'OUTLET_CODE_CONFLICT', status:409 };

  row.id = id;
  row.name = name;
  row.clientId = clientId;
  row.projectIds = projectIds;
  row.status = status;
  row.outletNumber = code;
  row.code = code;
  row.lat = lat;
  row.lng = lng;
  if (radius != null) row.geofenceRadiusM = radius;
  return null;
}

async function validateProjectAssignmentMutation(env, organizationId, row, existing = null, context = {}) {
  const id = str(row.id);
  const projectId = str(row.projectId || existing?.project_id);
  const employeeId = str(row.employeeId || existing?.employee_id);
  const roleOnProject = str(row.roleOnProject || row.positionName || existing?.position_name);
  const status = ({ removed:'ended', assigned:'active' }[str(row.status)] || str(row.status || existing?.status || 'active'));
  const startDate = str(row.startDate || row.startsOn || existing?.starts_on);
  const endDate = str(row.endDate || row.endsOn || existing?.ends_on);
  const allocationPercent = Number(row.allocationPercent ?? parseMetadata(existing?.metadata_json)?.allocationPercent ?? 100);

  if (!id) return { error:'ASSIGNMENT_ID_REQUIRED', status:400 };
  if (!projectId) return { error:'ASSIGNMENT_PROJECT_REQUIRED', status:422 };
  if (!employeeId) return { error:'ASSIGNMENT_EMPLOYEE_REQUIRED', status:422 };
  if (!['supervisor','sales','viewer'].includes(roleOnProject)) return { error:'ASSIGNMENT_INVALID_ROLE', status:422 };
  if (!['active','ended'].includes(status)) return { error:'ASSIGNMENT_INVALID_STATUS', status:422 };
  if (!startDate || !endDate) return { error:'ASSIGNMENT_PERIOD_REQUIRED', status:422 };
  if (!Number.isFinite(allocationPercent) || allocationPercent < 1 || allocationPercent > 100) return { error:'ASSIGNMENT_INVALID_ALLOCATION', status:422 };

  const project = await env.DB.prepare(
    'SELECT id,status,starts_on,ends_on,metadata_json FROM core_projects WHERE organization_id=? AND id=? LIMIT 1'
  ).bind(organizationId,projectId).first();
  if (!project) return { error:'ASSIGNMENT_PROJECT_NOT_FOUND', status:422 };
  const projectMeta = parseMetadata(project.metadata_json);
  const projectStatus = str(projectMeta.uiStatus || project.status);
  if (status === 'active' && !['active','draft'].includes(projectStatus)) return { error:'ASSIGNMENT_PROJECT_NOT_ASSIGNABLE', status:409 };
  const projectStart = str(project.starts_on || projectMeta.startDate);
  const projectEnd = str(project.ends_on || projectMeta.endDate);
  if (!projectStart || !projectEnd || startDate < projectStart || endDate > projectEnd || endDate < startDate) {
    return { error:'ASSIGNMENT_INVALID_PERIOD', status:422 };
  }

  const employee = await env.DB.prepare(
    "SELECT id,auth_user_id,employment_status FROM core_employees WHERE organization_id=? AND id=? LIMIT 1"
  ).bind(organizationId,employeeId).first();
  if (!employee) return { error:'ASSIGNMENT_EMPLOYEE_NOT_FOUND', status:422 };

  if (existing) {
    if (str(existing.project_id) !== projectId || str(existing.employee_id) !== employeeId) {
      return { error:'ASSIGNMENT_IDENTITY_IMMUTABLE', status:409 };
    }
    const currentStatus = str(existing.status);
    if (currentStatus === 'ended') return { error:'ASSIGNMENT_FINAL', status:409 };
    if (currentStatus === 'active' && !['active','ended'].includes(status)) return { error:'ASSIGNMENT_INVALID_TRANSITION', status:409 };

    if (currentStatus === 'active' && status === 'ended' && roleOnProject === 'supervisor') {
      const activeDependents = await allRows(env.DB.prepare(
        "SELECT id,metadata_json FROM core_employee_project_assignments WHERE organization_id=? AND project_id=? AND status='active' AND id<>?"
      ).bind(organizationId,projectId,id));
      const dependentIds = activeDependents
        .filter(item => {
          const meta = parseMetadata(item.metadata_json);
          return ['sales','viewer'].includes(str(meta.roleOnProject || item.position_name))
            && str(meta.supervisorId) === employeeId;
        })
        .map(item => str(item.id))
        .filter(Boolean);
      if (dependentIds.length) {
        const closingIds = new Set((context.batchAssignments || [])
          .filter(item => str(item.projectId || item.project_id) === projectId && str(item.status) === 'ended')
          .map(item => str(item.id))
          .filter(Boolean));
        const remaining = dependentIds.filter(dependentId => !closingIds.has(dependentId));
        if (remaining.length) return { error:'ASSIGNMENT_SUPERVISOR_HAS_ACTIVE_SUBORDINATES', status:409, remainingSubordinates:remaining.length };
      }
    }
  } else if (status !== 'active') {
    return { error:'ASSIGNMENT_MUST_START_ACTIVE', status:422 };
  }

  if (status === 'active') {
    if (str(employee.employment_status) !== 'active') return { error:'ASSIGNMENT_EMPLOYEE_INACTIVE', status:409 };
    if (!str(employee.auth_user_id)) return { error:'ASSIGNMENT_EMPLOYEE_LOGIN_REQUIRED', status:409 };
    const sameProject = await env.DB.prepare(
      "SELECT id FROM core_employee_project_assignments WHERE organization_id=? AND project_id=? AND employee_id=? AND status='active' AND id<>? LIMIT 1"
    ).bind(organizationId,projectId,employeeId,id).first();
    if (sameProject) return { error:'ASSIGNMENT_ACTIVE_DUPLICATE', status:409 };

    const overlapping = await allRows(env.DB.prepare(
      "SELECT id,metadata_json FROM core_employee_project_assignments WHERE organization_id=? AND employee_id=? AND status='active' AND id<>? AND starts_on<=? AND ends_on>=?"
    ).bind(organizationId,employeeId,id,endDate,startDate));
    const allocated = overlapping.reduce((sum,item) => sum + Number(parseMetadata(item.metadata_json)?.allocationPercent || 100),0);
    if (allocated + allocationPercent > 100) return { error:'ASSIGNMENT_CAPACITY_CONFLICT', status:409, allocated };

    if (roleOnProject === 'supervisor') {
      row.supervisorId = null;
      row.supervisorUserId = null;
    } else {
      const supervisorId = str(row.supervisorId);
      if (!supervisorId) return { error:'ASSIGNMENT_SUPERVISOR_REQUIRED', status:422 };
      if (supervisorId === employeeId) return { error:'ASSIGNMENT_SELF_SUPERVISION', status:422 };
      const supervisor = await env.DB.prepare(
        "SELECT id,auth_user_id,employment_status FROM core_employees WHERE organization_id=? AND id=? LIMIT 1"
      ).bind(organizationId,supervisorId).first();
      if (!supervisor || str(supervisor.employment_status) !== 'active' || !str(supervisor.auth_user_id)) {
        return { error:'ASSIGNMENT_SUPERVISOR_INVALID', status:422 };
      }
      const supervisorAssignments = await allRows(env.DB.prepare(
        "SELECT id,position_name,starts_on,ends_on,metadata_json FROM core_employee_project_assignments WHERE organization_id=? AND project_id=? AND employee_id=? AND status='active' AND starts_on<=? AND ends_on>=?"
      ).bind(organizationId,projectId,supervisorId,endDate,startDate));
      const validSupervisor = supervisorAssignments.some(item => {
        const meta = parseMetadata(item.metadata_json);
        return str(meta.roleOnProject || item.position_name) === 'supervisor'
          && str(item.starts_on || meta.startDate) <= startDate
          && str(item.ends_on || meta.endDate) >= endDate;
      });
      if (!validSupervisor) return { error:'ASSIGNMENT_SUPERVISOR_NOT_COVERING_PERIOD', status:409 };
      row.supervisorUserId = str(supervisor.auth_user_id);
    }
  }

  row.roleOnProject = roleOnProject;
  row.status = status;
  row.allocationPercent = allocationPercent;
  row.startDate = startDate;
  row.endDate = endDate;
  return null;
}

async function handleSync(request, env, claims, bulkReceipt = null) {
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

  const idConflict = await crossTenantIdConflict(env, organizationId, changes);
  if (idConflict) return json({ error: 'ENTITY_ID_CONFLICT', entity: idConflict.entity, id: idConflict.id }, 409);

  const accessibleEmployeeIds = await employeeAccess(env, claims);
  let actorEmployeeId = '';
  let actorEmployeeResolved = false;
  const batchAssignments = changes.filter(change => change?.entity === 'projectAssignments' && change?.op !== 'delete').map(change => change.row || {});
  const statements = [];
  for (const change of changes) {
    const entity = str(change?.entity);
    const op = str(change?.op);
    if (!ENTITY_TABLES[entity] || !['upsert','delete'].includes(op)) return json({ error: 'INVALID_CHANGE', entity, op }, 400);
    const row = { ...(change.row || {}) };
    const existing = await existingRow(env, entity, organizationId, row);
    let existingProjectIds = [];
    if (entity === 'outlets' && existing) {
      const links = await allRows(env.DB.prepare(
        "SELECT project_id FROM core_project_outlets WHERE organization_id=? AND outlet_id=? AND status='active'"
      ).bind(organizationId,str(existing.id || row.id)));
      existingProjectIds = unique(links.map(link => link.project_id));
    }
    if ((entity === 'visits' || entity === 'outletProposals') && !actorEmployeeResolved) {
      actorEmployeeResolved = true;
      const actorEmployee = await env.DB.prepare(
        "SELECT id FROM core_employees WHERE organization_id=? AND auth_user_id=? AND employment_status='active' LIMIT 1"
      ).bind(organizationId,claims.sub).first();
      actorEmployeeId = str(actorEmployee?.id);
    }
    if (entity === 'outletProposals' && op === 'upsert') {
      const proposalError = await applyOutletProposalAuthority(env, claims, organizationId, row, existing, actorEmployeeId);
      if (proposalError) return json({ error:proposalError.error, entity, id:row.id || null }, proposalError.status || 422);
    }
    if (!authorizeOperationalChange(claims, entity, { ...change, row }, { existing, existingProjectIds, accessibleEmployeeIds, batchAssignments, actorEmployeeId })) return json({ error: 'CHANGE_FORBIDDEN', entity, id: row.id || null }, 403);
    if (entity === 'clients' && op === 'upsert') {
      const clientError = await validateClientMutation(env, organizationId, row, existing);
      if (clientError) return json({ error:clientError.error, entity, id:row.id || null }, clientError.status || 422);
    }
    if (entity === 'projects' && op === 'upsert') {
      const projectError = await validateProjectMutation(env, organizationId, row, existing, { batchAssignments });
      if (projectError) return json({ error:projectError.error, entity, id:row.id || null, currentStatus:projectError.currentStatus, nextStatus:projectError.nextStatus }, projectError.status || 422);
    }
    if (entity === 'employees' && op === 'upsert') {
      const employeeError = await validateEmployeeMutation(env, organizationId, row, existing, { batchAssignments });
      if (employeeError) return json({ error:employeeError.error, entity, id:row.id || null, remainingAssignments:employeeError.remainingAssignments }, employeeError.status || 422);
    }
    if (entity === 'outlets') {
      const outletError = await validateOutletMutation(env, organizationId, row, existing, { op, existingProjectIds });
      if (outletError) return json({ error:outletError.error, entity, id:row.id || null, referenceCount:outletError.referenceCount }, outletError.status || 422);
    }
    if (entity === 'projectAssignments' && op === 'upsert') {
      const assignmentError = await validateProjectAssignmentMutation(env, organizationId, row, existing, { batchAssignments });
      if (assignmentError) return json({ error:assignmentError.error, entity, id:row.id || null, allocated:assignmentError.allocated, remainingSubordinates:assignmentError.remainingSubordinates }, assignmentError.status || 422);
    }
    if (entity === 'visits' && op === 'upsert') {
      const geofenceError = await applyVisitGeofenceAuthority(env, organizationId, row, existing);
      if (geofenceError) return json({
        error: geofenceError.error,
        entity,
        id: row.id || null,
        ...(geofenceError.distanceM != null ? { distanceM:geofenceError.distanceM } : {}),
        ...(geofenceError.radiusM != null ? { radiusM:geofenceError.radiusM } : {}),
      }, geofenceError.status || 422);
    }
    if (entity === 'leaves' && existing && ['approved','rejected'].includes(str(row.status)) && str(row.status) !== str(existing.status)) {
      row.approverId = claims.sub;
      row.approvedAt = new Date().toISOString();
    }
    if (op === 'delete') statements.push(...deleteStatements(env, entity, row, organizationId));
    else {
      let extras = {};
      if (entity === 'employees' && row.email) {
        const user = await env.DB.prepare('SELECT id FROM auth_users WHERE lower(email)=lower(?) LIMIT 1').bind(str(row.email)).first();
        extras = { authUserId: user?.id || null };
      }
      statements.push(...upsertStatements(env, entity, row, organizationId, extras));
      if (entity === 'outletProposals' && str(row.status) === 'approved') {
        const finalization = await approvedProposalOutlet(env, organizationId, row, existing);
        if (finalization.error) return json({ error:finalization.error, entity, id:row.id || null }, finalization.status || 422);
        statements.push(...finalization.statements);
      }
    }
    if (entity === 'projectAssignments') statements.push(membershipRefreshStatement(env, organizationId, str(row.employeeId || existing?.employee_id), str(row.projectId || existing?.project_id)));
  }
  const nextRevision = currentRevision + 1;
  statements.unshift(env.DB.prepare('INSERT INTO core_sync_revision_guards(organization_id,mutation_id,expected_revision) VALUES(?,?,?)').bind(organizationId,mutationId,currentRevision));
  if (bulkReceipt) statements.push(env.DB.prepare(`INSERT INTO core_master_bulk_receipts(organization_id,actor_user_id,import_id,chunk_id,total_chunks,entity,payload_hash,summary_json,applied_revision) VALUES(?,?,?,?,?,?,?,?,?)`).bind(organizationId,claims.sub,bulkReceipt.importId,bulkReceipt.chunkId,bulkReceipt.totalChunks,bulkReceipt.entity,bulkReceipt.payloadHash,JSON.stringify(bulkReceipt.summary),nextRevision));
  statements.push(env.DB.prepare('INSERT INTO core_sync_mutations(organization_id,mutation_id,actor_user_id,base_revision,applied_revision,change_count) VALUES(?,?,?,?,?,?)').bind(organizationId,mutationId,claims.sub,currentRevision,nextRevision,changes.length));
  statements.push(env.DB.prepare('DELETE FROM core_sync_revision_guards WHERE organization_id=? AND mutation_id=?').bind(organizationId,mutationId));
  statements.push(env.DB.prepare('UPDATE core_sync_state SET revision=?,last_mutation_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND revision=?').bind(nextRevision,mutationId,organizationId,currentRevision));
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const latest = await syncState(env, organizationId);
    if (Number(latest.revision) !== currentRevision) return json({ error:'REVISION_CONFLICT', revision:Number(latest.revision) },409);
    throw error;
  }
  return json({ ok: true, revision: nextRevision, applied: changes.length });
}

export async function handleOperationalRoute(request, env, claims, url = new URL(request.url), bulkReceipt = null) {
  if (!url.pathname.startsWith('/api/core/')) return null;
  if (env.CORE_DATA_API_ENABLED !== 'true') return json({ error: 'CORE_DATA_API_LOCKED' }, 503);
  if (!claims?.organizationId) return json({ error: 'ORGANIZATION_REQUIRED' }, 409);
  if (url.pathname === '/api/core/bootstrap' && request.method === 'GET') return handleBootstrap(env, claims);
  if (url.pathname === '/api/core/import' && request.method === 'POST') return handleImport(request, env, claims);
  if (url.pathname === '/api/core/sync' && request.method === 'POST') return handleSync(request, env, claims, bulkReceipt);
  return json({ error: 'NOT_FOUND' }, 404);
}
