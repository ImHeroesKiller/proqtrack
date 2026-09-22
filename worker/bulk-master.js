import { handleOperationalRoute } from './operations.js';

const MAX_PREVIEW_ROWS = 100;
const MAX_COMMIT_ROWS = 50;
const ALLOWED_ROLES = new Set(['superadmin','head','admin','manager']);
const BROAD_ROLES = new Set(['superadmin','head','admin']);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
});

const str = (value, max = 240) => String(value ?? '').trim().slice(0,max);
const lower = value => str(value).toLowerCase();
const num = value => value == null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);
const boolStatus = (value, allowed, fallback = 'active') => {
  const v = lower(value);
  return allowed.includes(v) ? v : fallback;
};
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;

const allRows = async stmt => {
  const result = await stmt.all();
  return Array.isArray(result?.results) ? result.results : [];
};

function mapBy(rows, fields) {
  const map = new Map();
  for (const row of rows) {
    for (const field of fields) {
      const value = lower(row?.[field]);
      if (value && !map.has(value)) map.set(value,row);
    }
  }
  return map;
}

async function context(env, claims) {
  const org = claims.organizationId;
  const [clients,projects,outlets,products,competitors,competitorProducts,attendancePoints] = await Promise.all([
    allRows(env.DB.prepare('SELECT * FROM core_clients WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_projects WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_outlets WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_products WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_competitors WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_competitor_products WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT * FROM core_attendance_points WHERE organization_id=?').bind(org)),
  ]);
  return {
    org,
    clients,projects,outlets,products,competitors,competitorProducts,attendancePoints,
    clientByRef: mapBy(clients,['id','code','name']),
    projectByRef: mapBy(projects,['id','code','name']),
    outletByRef: mapBy(outlets,['id','code','name']),
    competitorByRef: mapBy(competitors,['id','code','name']),
    clientByCode: mapBy(clients,['code']),
    projectByCode: mapBy(projects,['code']),
    competitorByCode: mapBy(competitors,['code']),
    attendancePointByCode: mapBy(attendancePoints,['code']),
  };
}

function normalizeProjectStatus(value) {
  const v = lower(value);
  if (['draft','active','paused','closed','archived','on_hold','completed','cancelled'].includes(v)) return v;
  if (['planning','plan'].includes(v)) return 'draft';
  if (v === 'hold') return 'on_hold';
  if (v === 'canceled') return 'cancelled';
  return 'active';
}

function normalizeMaster(entity, input, index, ctx, claims) {
  const rowNumber = Number(input._row_number || input.rowNumber || index + 2);
  const errors = [];
  const warnings = [];
  let canonical = null;
  let action = 'create';

  const requireValue = (value, code) => {
    if (!str(value)) errors.push(code);
    return str(value);
  };
  const projectAllowed = project => BROAD_ROLES.has(lower(claims.role))
    || (!!project && (claims.projectIds || []).includes(String(project.id)));

  if (entity === 'clients') {
    if (!BROAD_ROLES.has(lower(claims.role))) errors.push('CLIENT_BULK_REQUIRES_ORG_ADMIN');
    const code = requireValue(input.code, 'CODE_REQUIRED');
    const name = requireValue(input.name, 'NAME_REQUIRED');
    const existing = code ? ctx.clientByCode.get(lower(code)) : null;
    action = existing ? 'update' : 'create';
    canonical = {
      id: existing?.id || uid('CL'),
      code,
      name,
      status: boolStatus(input.status,['active','inactive','archived','prospect'],'active'),
      legalName: str(input.legal_name || input.legalName),
      industry: str(input.industry),
      npwp: str(input.npwp),
      address: str(input.address,800),
      city: str(input.city),
      province: str(input.province),
      website: str(input.website),
      picName: str(input.pic_name || input.picName),
      picRole: str(input.pic_role || input.picRole),
      picPhone: str(input.pic_phone || input.picPhone),
      picEmail: lower(input.pic_email || input.picEmail),
      cooperationStart: str(input.cooperation_start || input.cooperationStart,20),
      cooperationEnd: str(input.cooperation_end || input.cooperationEnd,20),
      notes: str(input.notes,1200),
    };
  } else if (entity === 'projects') {
    const code = requireValue(input.code, 'CODE_REQUIRED');
    const name = requireValue(input.name, 'NAME_REQUIRED');
    const clientRef = requireValue(input.client_code || input.client || input.client_id, 'CLIENT_REQUIRED');
    const client = clientRef ? ctx.clientByRef.get(lower(clientRef)) : null;
    if (clientRef && !client) errors.push('CLIENT_NOT_FOUND');
    const existing = code ? ctx.projectByCode.get(lower(code)) : null;
    if (existing && !projectAllowed(existing)) errors.push('PROJECT_OUT_OF_SCOPE');
    if (!existing && !BROAD_ROLES.has(lower(claims.role))) errors.push('PROJECT_CREATE_REQUIRES_ORG_ADMIN');
    action = existing ? 'update' : 'create';
    canonical = {
      id: existing?.id || uid('PRJ'),
      clientId: client?.id || '',
      code,
      name,
      status: normalizeProjectStatus(input.status),
      startDate: str(input.start_date || input.startDate,20),
      endDate: str(input.end_date || input.endDate,20),
      targetVisits: num(input.target_visits || input.targetVisits),
      targetOutlets: num(input.target_outlets || input.targetOutlets),
      notes: str(input.notes,1200),
    };
  } else if (entity === 'outlets') {
    const code = requireValue(input.code || input.outlet_code, 'CODE_REQUIRED');
    const name = requireValue(input.name, 'NAME_REQUIRED');
    const projectRef = requireValue(input.project_code || input.project, 'PROJECT_REQUIRED');
    const project = projectRef ? ctx.projectByRef.get(lower(projectRef)) : null;
    if (projectRef && !project) errors.push('PROJECT_NOT_FOUND');
    if (project && !projectAllowed(project)) errors.push('PROJECT_OUT_OF_SCOPE');
    const existing = ctx.outlets.find(row => lower(row.code) === lower(code) && (!project || row.client_id === project.client_id)) || null;
    const lat = num(input.latitude ?? input.lat);
    const lng = num(input.longitude ?? input.lng);
    if (lat == null || lat < -90 || lat > 90) errors.push('LATITUDE_INVALID');
    if (lng == null || lng < -180 || lng > 180) errors.push('LONGITUDE_INVALID');
    action = existing ? 'update' : 'create';
    canonical = {
      id: existing?.id || uid('OUT'),
      clientId: project?.client_id || '',
      projectIds: project ? [project.id] : [],
      outletNumber: code,
      code,
      name,
      address: str(input.address,800),
      latitude: lat,
      longitude: lng,
      geofenceRadiusM: num(input.geofence_radius_m || input.geofenceRadiusM) || 50,
      type: str(input.type),
      channel: str(input.channel),
      ownership: str(input.ownership),
      area: str(input.area),
      phone: str(input.phone),
      owner: str(input.owner),
      visitFrequency: str(input.visit_frequency || input.visitFrequency),
      notes: str(input.notes,1200),
      status: boolStatus(input.status,['active','inactive','archived'],'active'),
    };
  } else if (entity === 'products') {
    const sku = requireValue(input.sku, 'SKU_REQUIRED');
    const name = requireValue(input.name, 'NAME_REQUIRED');
    const projectRef = requireValue(input.project_code || input.project, 'PROJECT_REQUIRED');
    const project = projectRef ? ctx.projectByRef.get(lower(projectRef)) : null;
    if (projectRef && !project) errors.push('PROJECT_NOT_FOUND');
    if (project && !projectAllowed(project)) errors.push('PROJECT_OUT_OF_SCOPE');
    const existing = ctx.products.find(row => lower(row.sku) === lower(sku) && (!project || row.client_id === project.client_id)) || null;
    action = existing ? 'update' : 'create';
    canonical = {
      id: existing?.id || uid('PROD'),
      clientId: project?.client_id || '',
      projectIds: project ? [project.id] : [],
      sku,
      name,
      brand: str(input.brand),
      category: str(input.category),
      unit: str(input.unit || 'pcs'),
      price: num(input.price) ?? 0,
      cost: num(input.cost),
      margin: num(input.margin),
      status: boolStatus(input.status,['active','inactive','archived'],'active'),
    };
  } else if (entity === 'competitors') {
    const code = requireValue(input.code, 'CODE_REQUIRED');
    const name = requireValue(input.name, 'NAME_REQUIRED');
    const existing = code ? ctx.competitorByCode.get(lower(code)) : null;
    action = existing ? 'update' : 'create';
    canonical = {
      id: existing?.id || uid('CMP'),
      code,
      name,
      category: str(input.category),
      color: str(input.color || '#64748b',16),
      notes: str(input.notes,1200),
      status: boolStatus(input.status,['active','inactive','archived'],'active'),
    };
  } else if (entity === 'competitorProducts') {
    const competitorRef = requireValue(input.competitor_code || input.competitor, 'COMPETITOR_REQUIRED');
    const competitor = competitorRef ? ctx.competitorByRef.get(lower(competitorRef)) : null;
    if (competitorRef && !competitor) errors.push('COMPETITOR_NOT_FOUND');
    const sku = requireValue(input.sku, 'SKU_REQUIRED');
    const name = requireValue(input.name, 'NAME_REQUIRED');
    const existing = competitor
      ? ctx.competitorProducts.find(row => row.competitor_id === competitor.id && lower(row.sku) === lower(sku))
      : null;
    action = existing ? 'update' : 'create';
    canonical = {
      id: existing?.id || uid('CPD'),
      competitorId: competitor?.id || '',
      sku,
      name,
      unit: str(input.unit || 'pcs'),
      typicalPrice: num(input.typical_price || input.typicalPrice) ?? 0,
      status: boolStatus(input.status,['active','inactive','archived'],'active'),
    };
  } else if (entity === 'attendancePoints') {
    const code = requireValue(input.code, 'CODE_REQUIRED');
    const name = requireValue(input.name, 'NAME_REQUIRED');
    const outletRef = str(input.outlet_code || input.outlet);
    const outlet = outletRef ? ctx.outletByRef.get(lower(outletRef)) : null;
    if (outletRef && !outlet) errors.push('OUTLET_NOT_FOUND');
    const lat = num(input.latitude ?? input.lat);
    const lng = num(input.longitude ?? input.lng);
    if (lat != null && (lat < -90 || lat > 90)) errors.push('LATITUDE_INVALID');
    if (lng != null && (lng < -180 || lng > 180)) errors.push('LONGITUDE_INVALID');
    const existing = code ? ctx.attendancePointByCode.get(lower(code)) : null;
    action = existing ? 'update' : 'create';
    canonical = {
      id: existing?.id || uid('APT'),
      code,
      name,
      type: ['office','meeting','store','point'].includes(lower(input.type)) ? lower(input.type) : 'point',
      address: str(input.address,800),
      outletId: outlet?.id || null,
      latitude: lat,
      longitude: lng,
      radiusM: num(input.radius_m || input.radiusM),
      status: boolStatus(input.status,['active','inactive','archived'],'active'),
    };
  } else {
    errors.push('ENTITY_UNSUPPORTED');
  }

  return {
    rowNumber,
    entity,
    action,
    valid: errors.length === 0,
    errors,
    warnings,
    canonical,
    display: canonical ? {
      code: canonical.code || canonical.sku || '',
      name: canonical.name || '',
      reference: canonical.clientId || canonical.projectIds?.[0] || canonical.competitorId || canonical.outletId || '',
    } : {},
  };
}

function duplicateKey(entity, input = {}) {
  if (entity === 'products') return lower(input.sku);
  if (entity === 'competitorProducts') return `${lower(input.competitor_code || input.competitor)}::${lower(input.sku)}`;
  return lower(input.code || input.outlet_code || input.name);
}

function validateBatchDuplicates(entity, rows, normalized) {
  const seen = new Map();
  for (let i = 0; i < rows.length; i += 1) {
    const key = duplicateKey(entity,rows[i]);
    if (!key) continue;
    if (seen.has(key)) {
      const first = seen.get(key);
      normalized[i].errors.push(`DUPLICATE_ROW_${normalized[first].rowNumber}`);
      normalized[i].valid = false;
      normalized[first].errors.push(`DUPLICATE_ROW_${normalized[i].rowNumber}`);
      normalized[first].valid = false;
    } else seen.set(key,i);
  }
}

async function previewRows(entity, rows, env, claims) {
  const ctx = await context(env,claims);
  const normalized = rows.map((row,index) => normalizeMaster(entity,row,index,ctx,claims));
  validateBatchDuplicates(entity,rows,normalized);
  return normalized;
}

async function preview(request, env, claims) {
  const body = await request.json().catch(() => ({}));
  const entity = str(body.entity);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length || rows.length > MAX_PREVIEW_ROWS) return json({ error:'INVALID_ROW_COUNT', max:MAX_PREVIEW_ROWS },400);
  const normalized = await previewRows(entity,rows,env,claims);
  return json({
    ok:true,
    entity,
    rows:normalized,
    summary:{
      total:normalized.length,
      valid:normalized.filter(row=>row.valid).length,
      errors:normalized.filter(row=>!row.valid).length,
      inserts:normalized.filter(row=>row.valid && row.action==='create').length,
      updates:normalized.filter(row=>row.valid && row.action==='update').length,
    },
  });
}

async function commit(request, env, claims) {
  const body = await request.json().catch(() => ({}));
  const entity = str(body.entity);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const importId = str(body.importId || uid('MASTER-BULK'),120);
  const chunkId = str(body.chunkId || '1',80);
  if (!rows.length || rows.length > MAX_COMMIT_ROWS) return json({ error:'INVALID_ROW_COUNT', max:MAX_COMMIT_ROWS },400);

  const normalized = await previewRows(entity,rows,env,claims);
  if (normalized.some(row=>!row.valid)) {
    return json({ error:'BULK_VALIDATION_FAILED', rows:normalized },422);
  }

  const state = await env.DB.prepare(
    'SELECT revision,cutover_mode FROM core_sync_state WHERE organization_id=? LIMIT 1',
  ).bind(claims.organizationId).first();
  if (state?.cutover_mode !== 'cloud') return json({ error:'CUTOVER_REQUIRED' },409);

  const syncBody = {
    mutationId:`MASTER-BULK-${importId}-${chunkId}`,
    baseRevision:Number(state?.revision || 0),
    changes:normalized.map(row=>({ entity, op:'upsert', row:row.canonical })),
  };
  const url = new URL(request.url);
  url.pathname = '/api/core/sync';
  const syncRequest = new Request(url.toString(), {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'idempotency-key':syncBody.mutationId,
    },
    body:JSON.stringify(syncBody),
  });
  const response = await handleOperationalRoute(syncRequest,env,claims,new URL(syncRequest.url));
  const result = await response.clone().json().catch(() => ({}));
  if (!response.ok) return json(result,response.status);

  return json({
    ok:true,
    entity,
    importId,
    chunkId,
    revision:result.revision,
    idempotent:result.idempotent === true,
    summary:{
      total:normalized.length,
      inserts:normalized.filter(row=>row.action==='create').length,
      updates:normalized.filter(row=>row.action==='update').length,
    },
  });
}

export async function handleBulkMasterRoute(request, env, claims, url = new URL(request.url)) {
  if (!url.pathname.startsWith('/api/bulk/master')) return null;
  if (!claims?.organizationId) return json({ error:'ORGANIZATION_REQUIRED' },409);
  if (!ALLOWED_ROLES.has(lower(claims.role))) return json({ error:'BULK_FORBIDDEN' },403);
  if (url.pathname === '/api/bulk/master/preview' && request.method === 'POST') return preview(request,env,claims);
  if (url.pathname === '/api/bulk/master/commit' && request.method === 'POST') return commit(request,env,claims);
  return json({ error:'NOT_FOUND' },404);
}

export const __test = {
  MAX_PREVIEW_ROWS,
  MAX_COMMIT_ROWS,
  normalizeProjectStatus,
  duplicateKey,
  normalizeMaster,
};
