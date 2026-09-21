const MAX_PREVIEW_ROWS = 200;
const MAX_COMMIT_ROWS = 50;
const BROAD_ROLES = new Set(['superadmin','head','admin']);
const MANAGER_ENTITIES = new Set(['outlets','products','competitors','competitorProducts','projectAssignments']);
const ENTITY_TYPES = new Set([
  'clients','projects','outlets','products','competitors','competitorProducts','projectAssignments',
]);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
});
const str = (v, max = 240) => String(v ?? '').trim().slice(0,max);
const lower = v => str(v).toLowerCase();
const num = v => v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v);
const list = v => [...new Set(
  (Array.isArray(v) ? v : String(v ?? '').split(/[;,|]/))
    .map(x => str(x)).filter(Boolean)
)];
const allRows = async stmt => {
  const result = await stmt.all();
  return Array.isArray(result?.results) ? result.results : [];
};
const uid = prefix => `${prefix}-${crypto.randomUUID()}`;
const roleOf = claims => lower(claims?.role);

function allowedEntity(claims, entity) {
  const role = roleOf(claims);
  if (BROAD_ROLES.has(role)) return true;
  return role === 'manager' && MANAGER_ENTITIES.has(entity);
}

function status(value, allowed, fallback='active') {
  const v = lower(value);
  if (!v) return fallback;
  const aliases = {
    aktif:'active', nonaktif:'inactive', non_active:'inactive',
    planning:'draft', completed:'closed', cancelled:'closed', on_hold:'paused',
    removed:'ended', assigned:'active',
  };
  const normalized = aliases[v] || v;
  return allowed.includes(normalized) ? normalized : '';
}

function metadata(existing = '{}', patch = {}) {
  let base = {};
  try { base = JSON.parse(existing || '{}') || {}; } catch { base = {}; }
  return JSON.stringify({ ...base, ...patch });
}

function naturalKey(entity, row) {
  switch (entity) {
    case 'clients': return lower(row.clientCode);
    case 'projects': return lower(row.projectCode);
    case 'outlets': return `${lower(row.clientCode)}:${lower(row.outletCode)}`;
    case 'products': return `${lower(row.clientCode)}:${lower(row.sku)}`;
    case 'competitors': return lower(row.competitorCode);
    case 'competitorProducts': return `${lower(row.competitorCode)}:${lower(row.sku)}`;
    case 'projectAssignments': return `${lower(row.projectCode)}:${lower(row.employeeCode)}`;
    default: return '';
  }
}

function normalize(entity, input = {}, index = 0) {
  const rowNumber = Number(input._row_number || input.rowNumber || index + 2);
  const base = { rowNumber };
  if (entity === 'clients') return {
    ...base,
    clientCode:str(input.client_code || input.clientCode || input.code,120),
    name:str(input.name || input.client_name || input.clientName,240),
    legalName:str(input.legal_name || input.legalName,240),
    industry:str(input.industry,160),
    status:status(input.status,['active','inactive','archived'],'active'),
    picName:str(input.pic_name || input.picName,180),
    picRole:str(input.pic_role || input.picRole,160),
    picPhone:str(input.pic_phone || input.picPhone,80),
    picEmail:lower(input.pic_email || input.picEmail).slice(0,180),
    address:str(input.address,500), city:str(input.city,160), province:str(input.province,160),
    website:str(input.website,320), cooperationStart:str(input.cooperation_start || input.cooperationStart,24),
    cooperationEnd:str(input.cooperation_end || input.cooperationEnd,24), notes:str(input.notes,1200),
  };
  if (entity === 'projects') return {
    ...base,
    projectCode:str(input.project_code || input.projectCode || input.code,120),
    name:str(input.name || input.project_name || input.projectName,240),
    clientCode:str(input.client_code || input.clientCode,120),
    status:status(input.status,['draft','active','paused','closed','archived'],'active'),
    startDate:str(input.start_date || input.startDate,24), endDate:str(input.end_date || input.endDate,24),
    description:str(input.description,1200), region:str(input.region || input.area,240),
    contractValue:num(input.contract_value ?? input.contractValue),
    targetVisits:num(input.target_visits ?? input.targetVisits),
    targetOutlets:num(input.target_outlets ?? input.targetOutlets),
    notes:str(input.notes,1200),
  };
  if (entity === 'outlets') return {
    ...base,
    outletCode:str(input.outlet_code || input.outletCode || input.code,120),
    name:str(input.name || input.outlet_name || input.outletName,240),
    clientCode:str(input.client_code || input.clientCode,120),
    projectCodes:list(input.project_codes || input.projectCodes || input.project_code || input.projectCode),
    address:str(input.address,600), area:str(input.area || input.city,160),
    type:str(input.type || input.outlet_type || input.outletType,120),
    channel:str(input.channel || input.segment,120), ownership:str(input.ownership,120),
    owner:str(input.owner || input.pic,180), phone:str(input.phone,80),
    lat:num(input.lat ?? input.latitude), lng:num(input.lng ?? input.longitude),
    geofenceRadiusM:num(input.geofence_radius_m ?? input.geofenceRadiusM),
    visitFrequency:str(input.visit_frequency || input.visitFrequency,120),
    status:status(input.status,['active','inactive','archived'],'active'), notes:str(input.notes,1200),
  };
  if (entity === 'products') return {
    ...base,
    sku:str(input.sku || input.product_code || input.productCode,120),
    name:str(input.name || input.product_name || input.productName,240),
    clientCode:str(input.client_code || input.clientCode,120),
    projectCodes:list(input.project_codes || input.projectCodes || input.project_code || input.projectCode),
    brand:str(input.brand,160), category:str(input.category,160), unit:str(input.unit || 'pcs',80),
    price:num(input.price), cost:num(input.cost), margin:num(input.margin),
    status:status(input.status,['active','inactive','archived'],'active'),
  };
  if (entity === 'competitors') return {
    ...base,
    competitorCode:str(input.competitor_code || input.competitorCode || input.code || input.name,120),
    name:str(input.name || input.competitor_name || input.competitorName,240),
    category:str(input.category,160), color:str(input.color || '#64748b',32),
    status:status(input.status,['active','inactive','archived'],'active'), notes:str(input.notes,1200),
  };
  if (entity === 'competitorProducts') return {
    ...base,
    competitorCode:str(input.competitor_code || input.competitorCode,120),
    sku:str(input.sku || input.product_code || input.productCode,120),
    name:str(input.name || input.product_name || input.productName,240),
    unit:str(input.unit || 'pcs',80), typicalPrice:num(input.typical_price ?? input.typicalPrice ?? input.price),
    status:status(input.status,['active','inactive','archived'],'active'),
  };
  if (entity === 'projectAssignments') return {
    ...base,
    projectCode:str(input.project_code || input.projectCode,120),
    employeeCode:str(input.employee_code || input.employeeCode,120),
    role:str(input.role || input.position || 'sales',120),
    supervisorEmail:lower(input.supervisor_email || input.supervisorEmail).slice(0,180),
    status:status(input.status,['active','inactive','ended'],'active'),
    startDate:str(input.start_date || input.startDate,24), endDate:str(input.end_date || input.endDate,24),
    allocationPercent:num(input.allocation_percent ?? input.allocationPercent), notes:str(input.notes,1200),
  };
  return base;
}

async function context(env, claims) {
  const org = claims.organizationId;
  const [clients,projects,employees,users,competitors,competitorProducts,outlets,products,assignments] = await Promise.all([
    allRows(env.DB.prepare('SELECT id,code,name,status,metadata_json FROM core_clients WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT id,client_id,code,name,status,metadata_json FROM core_projects WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT id,employee_code,full_name,email,auth_user_id,employment_status,metadata_json FROM core_employees WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare(`
      SELECT u.id,u.email,u.status AS user_status,ou.role,ou.status AS org_status
      FROM auth_users u
      LEFT JOIN core_organization_users ou ON ou.user_id=u.id AND ou.organization_id=?
    `).bind(org)),
    allRows(env.DB.prepare('SELECT id,code,name,status,metadata_json FROM core_competitors WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT id,competitor_id,sku,name,status,metadata_json FROM core_competitor_products WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT id,client_id,code,name,status,metadata_json FROM core_outlets WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT id,client_id,sku,name,status,metadata_json FROM core_products WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT id,project_id,employee_id,status,metadata_json FROM core_employee_project_assignments WHERE organization_id=?').bind(org)),
  ]);
  const refMap = rows => {
    const m = new Map();
    for (const row of rows) for (const key of [row.id,row.code,row.name]) if (key) m.set(lower(key),row);
    return m;
  };
  const clientByRef=refMap(clients), projectByRef=refMap(projects), competitorByRef=refMap(competitors);
  const clientByCode=new Map(clients.map(row=>[lower(row.code),row]));
  const projectByCode=new Map(projects.map(row=>[lower(row.code),row]));
  const competitorByCode=new Map(competitors.map(row=>[lower(row.code),row]));
  const employeeByRef=new Map();
  for(const row of employees) for(const key of [row.id,row.employee_code,row.email,row.full_name]) if(key) employeeByRef.set(lower(key),row);
  const userByEmail=new Map(users.map(row=>[lower(row.email),row]));
  const outletByKey=new Map(outlets.map(row=>[`${row.client_id}:${lower(row.code)}`,row]));
  const productByKey=new Map(products.map(row=>[`${row.client_id}:${lower(row.sku)}`,row]));
  const competitorProductByKey=new Map(competitorProducts.map(row=>[`${row.competitor_id}:${lower(row.sku)}`,row]));
  const assignmentByKey=new Map(assignments.map(row=>[`${row.project_id}:${row.employee_id}`,row]));
  return {
    org,clients,projects,employees,competitors,
    clientByRef,projectByRef,competitorByRef,clientByCode,projectByCode,competitorByCode,
    employeeByRef,userByEmail,outletByKey,productByKey,competitorProductByKey,assignmentByKey,
    allowedProjects:new Set((claims.projectIds || []).map(String)),
  };
}

function addDuplicateErrors(validated) {
  const seen=new Map();
  for(const row of validated){
    const key=naturalKey(row.entity,row);
    if(!key) continue;
    if(seen.has(key)){
      row.errors.push(`DUPLICATE_KEY_ROW_${seen.get(key)}`);
      const first=validated.find(x=>x.rowNumber===seen.get(key));
      if(first) first.errors.push(`DUPLICATE_KEY_ROW_${row.rowNumber}`);
    } else seen.set(key,row.rowNumber);
  }
}

function validateRow(entity, row, ctx, claims) {
  const errors=[],warnings=[];
  const role=roleOf(claims);
  let existing=null, resolved={};

  if(entity==='clients'){
    if(!row.clientCode) errors.push('CLIENT_CODE_REQUIRED');
    if(!row.name) errors.push('NAME_REQUIRED');
    if(!row.status) errors.push('STATUS_INVALID');
    if(row.picEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.picEmail)) errors.push('PIC_EMAIL_INVALID');
    existing=ctx.clientByCode.get(lower(row.clientCode)) || null;
  }

  if(entity==='projects'){
    if(!row.projectCode) errors.push('PROJECT_CODE_REQUIRED');
    if(!row.name) errors.push('NAME_REQUIRED');
    if(!row.clientCode) errors.push('CLIENT_REQUIRED');
    if(!row.status) errors.push('STATUS_INVALID');
    const client=ctx.clientByRef.get(lower(row.clientCode));
    if(!client) errors.push('CLIENT_NOT_FOUND'); else resolved.client=client;
    existing=ctx.projectByCode.get(lower(row.projectCode)) || null;
  }

  if(entity==='outlets' || entity==='products'){
    const isOutlet=entity==='outlets';
    const code=isOutlet?row.outletCode:row.sku;
    if(!code) errors.push(isOutlet?'OUTLET_CODE_REQUIRED':'SKU_REQUIRED');
    if(!row.name) errors.push('NAME_REQUIRED');
    if(!row.clientCode) errors.push('CLIENT_REQUIRED');
    if(!row.projectCodes.length) errors.push('PROJECT_REQUIRED');
    if(!row.status) errors.push('STATUS_INVALID');
    const client=ctx.clientByRef.get(lower(row.clientCode));
    if(!client) errors.push('CLIENT_NOT_FOUND'); else resolved.client=client;
    const projects=row.projectCodes.map(ref=>ctx.projectByRef.get(lower(ref))).filter(Boolean);
    if(projects.length!==row.projectCodes.length) errors.push('PROJECT_NOT_FOUND');
    if(client && projects.some(project=>String(project.client_id)!==String(client.id))) errors.push('PROJECT_CLIENT_MISMATCH');
    if(role==='manager' && projects.some(project=>!ctx.allowedProjects.has(String(project.id)))) errors.push('PROJECT_OUT_OF_SCOPE');
    resolved.projects=projects;
    existing=client ? (isOutlet
      ? ctx.outletByKey.get(`${client.id}:${lower(code)}`)
      : ctx.productByKey.get(`${client.id}:${lower(code)}`)) || null : null;
    if(isOutlet && row.lat!=null && (row.lat < -90 || row.lat > 90)) errors.push('LATITUDE_INVALID');
    if(isOutlet && row.lng!=null && (row.lng < -180 || row.lng > 180)) errors.push('LONGITUDE_INVALID');
    if(!isOutlet && [row.price,row.cost].some(v=>v!=null && v<0)) errors.push('PRICE_INVALID');
  }

  if(entity==='competitors'){
    if(!row.competitorCode) errors.push('COMPETITOR_CODE_REQUIRED');
    if(!row.name) errors.push('NAME_REQUIRED');
    if(!row.status) errors.push('STATUS_INVALID');
    existing=ctx.competitorByCode.get(lower(row.competitorCode)) || null;
  }

  if(entity==='competitorProducts'){
    if(!row.competitorCode) errors.push('COMPETITOR_REQUIRED');
    if(!row.sku) errors.push('SKU_REQUIRED');
    if(!row.name) errors.push('NAME_REQUIRED');
    if(!row.status) errors.push('STATUS_INVALID');
    if(row.typicalPrice!=null && row.typicalPrice<0) errors.push('PRICE_INVALID');
    const competitor=ctx.competitorByRef.get(lower(row.competitorCode));
    if(!competitor) errors.push('COMPETITOR_NOT_FOUND');
    else {
      resolved.competitor=competitor;
      existing=ctx.competitorProductByKey.get(`${competitor.id}:${lower(row.sku)}`) || null;
    }
  }

  if(entity==='projectAssignments'){
    if(!row.projectCode) errors.push('PROJECT_REQUIRED');
    if(!row.employeeCode) errors.push('EMPLOYEE_REQUIRED');
    if(!row.status) errors.push('STATUS_INVALID');
    const project=ctx.projectByRef.get(lower(row.projectCode));
    const employee=ctx.employeeByRef.get(lower(row.employeeCode));
    if(!project) errors.push('PROJECT_NOT_FOUND'); else resolved.project=project;
    if(!employee) errors.push('EMPLOYEE_NOT_FOUND'); else resolved.employee=employee;
    if(role==='manager' && project && !ctx.allowedProjects.has(String(project.id))) errors.push('PROJECT_OUT_OF_SCOPE');
    if(row.supervisorEmail){
      const supervisor=ctx.userByEmail.get(row.supervisorEmail);
      if(!supervisor || supervisor.user_status!=='active' || supervisor.org_status!=='active' || supervisor.role!=='supervisor') {
        errors.push('SUPERVISOR_NOT_FOUND');
      } else resolved.supervisor=supervisor;
    }
    existing=project&&employee ? ctx.assignmentByKey.get(`${project.id}:${employee.id}`) || null : null;
  }

  if(existing) warnings.push('WILL_UPDATE');
  return {
    entity,...row,
    action:existing?'update':'create',
    existingId:existing?.id||null,
    resolved,
    errors:[...new Set(errors)],
    warnings:[...new Set(warnings)],
    valid:errors.length===0,
  };
}

function publicPreview(row){
  return {
    rowNumber:row.rowNumber,
    key:naturalKey(row.entity,row),
    label:row.name || row.fullName || row.employeeCode || row.projectCode || row.clientCode || row.sku || row.competitorCode,
    action:row.action,valid:row.valid,errors:row.errors,warnings:row.warnings,
  };
}
function summary(rows){
  return {
    total:rows.length,valid:rows.filter(r=>r.valid).length,
    errors:rows.filter(r=>!r.valid).length,
    warnings:rows.filter(r=>r.valid&&r.warnings.length).length,
    inserts:rows.filter(r=>r.valid&&r.action==='create').length,
    updates:rows.filter(r=>r.valid&&r.action==='update').length,
  };
}

async function preview(request,env,claims,entity){
  if(!allowedEntity(claims,entity)) return json({error:'BULK_ENTITY_FORBIDDEN'},403);
  const body=await request.json().catch(()=>({}));
  const rows=Array.isArray(body.rows)?body.rows:[];
  if(!rows.length||rows.length>MAX_PREVIEW_ROWS) return json({error:'INVALID_ROW_COUNT',max:MAX_PREVIEW_ROWS},400);
  const ctx=await context(env,claims);
  const validated=rows.map((row,index)=>validateRow(entity,normalize(entity,row,index),ctx,claims));
  addDuplicateErrors(validated);
  for(const row of validated) row.valid=row.errors.length===0;
  return json({ok:true,entity,rows:validated.map(publicPreview),summary:summary(validated)});
}

function auditMetadata(entity,row,importId){
  const base={ bulkImportId:importId, bulkImportedAt:new Date().toISOString() };
  if(entity==='clients') return { ...base,legalName:row.legalName,industry:row.industry,picName:row.picName,picRole:row.picRole,picPhone:row.picPhone,picEmail:row.picEmail,address:row.address,city:row.city,province:row.province,website:row.website,cooperationStart:row.cooperationStart,cooperationEnd:row.cooperationEnd,notes:row.notes };
  if(entity==='projects') return { ...base,description:row.description,region:row.region,contractValue:row.contractValue,targetVisits:row.targetVisits,targetOutlets:row.targetOutlets,notes:row.notes,startDate:row.startDate,endDate:row.endDate };
  if(entity==='outlets') return { ...base,area:row.area,type:row.type,channel:row.channel,ownership:row.ownership,owner:row.owner,phone:row.phone,visitFrequency:row.visitFrequency,notes:row.notes,projectIds:row.resolved.projects.map(p=>p.id) };
  if(entity==='products') return { ...base,brand:row.brand,category:row.category,price:row.price,cost:row.cost,margin:row.margin,projectIds:row.resolved.projects.map(p=>p.id) };
  if(entity==='competitors') return { ...base };
  if(entity==='competitorProducts') return { ...base };
  if(entity==='projectAssignments') return { ...base,roleOnProject:row.role,allocationPercent:row.allocationPercent,notes:row.notes };
  return base;
}

async function commit(request,env,claims,entity,requestId){
  if(!allowedEntity(claims,entity)) return json({error:'BULK_ENTITY_FORBIDDEN'},403);
  const body=await request.json().catch(()=>({}));
  const rows=Array.isArray(body.rows)?body.rows:[];
  if(!rows.length||rows.length>MAX_COMMIT_ROWS) return json({error:'INVALID_ROW_COUNT',max:MAX_COMMIT_ROWS},400);
  const importId=str(body.importId||`BULK-MASTER-${crypto.randomUUID()}`,120);
  const chunkId=str(body.chunkId||'1',80);
  const sourceName=str(body.sourceName||'bulk-master',180);
  const finalChunk=body.finalChunk===true;

  const owner=await env.DB.prepare(
    'SELECT organization_id,actor_user_id,entity_type FROM core_bulk_master_runs WHERE id=? LIMIT 1'
  ).bind(importId).first();
  if(owner && (String(owner.organization_id)!==String(claims.organizationId)
    || String(owner.actor_user_id)!==String(claims.sub) || owner.entity_type!==entity)) {
    return json({error:'IMPORT_OWNERSHIP_MISMATCH'},409);
  }
  const replay=await env.DB.prepare(
    'SELECT status,inserted_count,updated_count,summary_json FROM core_bulk_master_chunks WHERE import_id=? AND chunk_id=? AND organization_id=? LIMIT 1'
  ).bind(importId,chunkId,claims.organizationId).first();
  if(replay?.status==='completed'){
    return json({ok:true,replayed:true,entity,importId,chunkId,summary:{
      inserted:Number(replay.inserted_count||0),updated:Number(replay.updated_count||0)
    }});
  }

  const ctx=await context(env,claims);
  const validated=rows.map((row,index)=>validateRow(entity,normalize(entity,row,index),ctx,claims));
  addDuplicateErrors(validated);
  for(const row of validated) row.valid=row.errors.length===0;
  const totals=summary(validated);
  if(totals.errors) return json({error:'BULK_VALIDATION_FAILED',entity,rows:validated.map(publicPreview),summary:totals},422);



  const statements=[];
  let inserted=0,updated=0;
  for(const row of validated){
    const action=row.action;
    const existingId=row.existingId;
    const id=existingId || uid({
      clients:'CL',projects:'PRJ',outlets:'OUT',products:'PRD',competitors:'CMP',
      competitorProducts:'CPD',projectAssignments:'ASN'
    }[entity]||'ROW');
    const meta=metadata('{}',auditMetadata(entity,row,importId));

    if(entity==='clients'){
      statements.push(env.DB.prepare(`
        INSERT INTO core_clients(id,organization_id,code,name,status,metadata_json,row_version,created_at,updated_at)
        VALUES(?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,status=excluded.status,
          metadata_json=excluded.metadata_json,row_version=core_clients.row_version+1,updated_at=CURRENT_TIMESTAMP
        WHERE core_clients.organization_id=excluded.organization_id
      `).bind(id,claims.organizationId,row.clientCode,row.name,row.status,meta));
    }

    if(entity==='projects'){
      statements.push(env.DB.prepare(`
        INSERT INTO core_projects(id,organization_id,client_id,code,name,status,starts_on,ends_on,metadata_json,row_version,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,code=excluded.code,name=excluded.name,
          status=excluded.status,starts_on=excluded.starts_on,ends_on=excluded.ends_on,
          metadata_json=excluded.metadata_json,row_version=core_projects.row_version+1,updated_at=CURRENT_TIMESTAMP
        WHERE core_projects.organization_id=excluded.organization_id
      `).bind(id,claims.organizationId,row.resolved.client.id,row.projectCode,row.name,row.status,row.startDate||null,row.endDate||null,meta));
    }

    if(entity==='outlets'){
      statements.push(env.DB.prepare(`
        INSERT INTO core_outlets(
          id,organization_id,client_id,code,name,address,latitude,longitude,geofence_radius_m,status,
          metadata_json,row_version,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,code=excluded.code,name=excluded.name,
          address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,
          geofence_radius_m=excluded.geofence_radius_m,status=excluded.status,metadata_json=excluded.metadata_json,
          row_version=core_outlets.row_version+1,updated_at=CURRENT_TIMESTAMP
        WHERE core_outlets.organization_id=excluded.organization_id
      `).bind(id,claims.organizationId,row.resolved.client.id,row.outletCode,row.name,row.address||null,row.lat,row.lng,row.geofenceRadiusM,row.status,meta));
      statements.push(env.DB.prepare('DELETE FROM core_project_outlets WHERE organization_id=? AND outlet_id=?').bind(claims.organizationId,id));
      for(const project of row.resolved.projects){
        statements.push(env.DB.prepare(`
          INSERT INTO core_project_outlets(organization_id,project_id,outlet_id,status,created_at)
          VALUES(?,?,?,'active',CURRENT_TIMESTAMP)
        `).bind(claims.organizationId,project.id,id));
      }
    }

    if(entity==='products'){
      statements.push(env.DB.prepare(`
        INSERT INTO core_products(id,organization_id,client_id,sku,name,unit,status,metadata_json,row_version,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,sku=excluded.sku,name=excluded.name,
          unit=excluded.unit,status=excluded.status,metadata_json=excluded.metadata_json,
          row_version=core_products.row_version+1,updated_at=CURRENT_TIMESTAMP
        WHERE core_products.organization_id=excluded.organization_id
      `).bind(id,claims.organizationId,row.resolved.client.id,row.sku,row.name,row.unit,row.status,meta));
      statements.push(env.DB.prepare('DELETE FROM core_project_products WHERE organization_id=? AND product_id=?').bind(claims.organizationId,id));
      for(const project of row.resolved.projects){
        statements.push(env.DB.prepare(`
          INSERT INTO core_project_products(organization_id,project_id,product_id,status,created_at,updated_at)
          VALUES(?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        `).bind(claims.organizationId,project.id,id));
      }
    }

    if(entity==='competitors'){
      statements.push(env.DB.prepare(`
        INSERT INTO core_competitors(
          id,organization_id,code,name,category,color,status,notes,metadata_json,row_version,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,category=excluded.category,
          color=excluded.color,status=excluded.status,notes=excluded.notes,metadata_json=excluded.metadata_json,
          row_version=core_competitors.row_version+1,updated_at=CURRENT_TIMESTAMP
        WHERE core_competitors.organization_id=excluded.organization_id
      `).bind(id,claims.organizationId,row.competitorCode,row.name,row.category||null,row.color||null,row.status,row.notes||null,meta));
    }

    if(entity==='competitorProducts'){
      statements.push(env.DB.prepare(`
        INSERT INTO core_competitor_products(
          id,organization_id,competitor_id,sku,name,unit,typical_price,status,metadata_json,row_version,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET competitor_id=excluded.competitor_id,sku=excluded.sku,
          name=excluded.name,unit=excluded.unit,typical_price=excluded.typical_price,status=excluded.status,
          metadata_json=excluded.metadata_json,row_version=core_competitor_products.row_version+1,updated_at=CURRENT_TIMESTAMP
        WHERE core_competitor_products.organization_id=excluded.organization_id
      `).bind(id,claims.organizationId,row.resolved.competitor.id,row.sku,row.name,row.unit,row.typicalPrice,row.status,meta));
    }

    if(entity==='projectAssignments'){
      statements.push(env.DB.prepare(`
        INSERT INTO core_employee_project_assignments(
          id,organization_id,project_id,employee_id,supervisor_user_id,position_name,status,starts_on,ends_on,
          metadata_json,row_version,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,employee_id=excluded.employee_id,
          supervisor_user_id=excluded.supervisor_user_id,position_name=excluded.position_name,status=excluded.status,
          starts_on=excluded.starts_on,ends_on=excluded.ends_on,metadata_json=excluded.metadata_json,
          row_version=core_employee_project_assignments.row_version+1,updated_at=CURRENT_TIMESTAMP
        WHERE core_employee_project_assignments.organization_id=excluded.organization_id
      `).bind(
        id,claims.organizationId,row.resolved.project.id,row.resolved.employee.id,row.resolved.supervisor?.id||null,
        row.role,row.status,row.startDate||null,row.endDate||null,meta
      ));
      if(row.resolved.employee.auth_user_id){
        const membershipRole=lower(row.role).includes('supervisor')?'supervisor':'employee';
        statements.push(env.DB.prepare(`
          INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,created_at,updated_at)
          VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT(organization_id,project_id,user_id) DO UPDATE SET
            role=excluded.role,status=excluded.status,updated_at=CURRENT_TIMESTAMP
        `).bind(claims.organizationId,row.resolved.project.id,row.resolved.employee.auth_user_id,membershipRole,row.status==='active'?'active':'inactive'));
      }
    }

    if(action==='update') updated+=1; else inserted+=1;
  }

  if(!owner){
    statements.unshift(env.DB.prepare(`
      INSERT INTO core_bulk_master_runs(
        id,organization_id,actor_user_id,entity_type,source_name,status,created_at,updated_at
      ) VALUES(?,?,?,?,?,'running',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(importId,claims.organizationId,claims.sub,entity,sourceName));
  }
  const chunkSummary=JSON.stringify({inserted,updated,rows:validated.length});
  statements.push(env.DB.prepare(`
    INSERT INTO core_bulk_master_chunks(
      import_id,chunk_id,organization_id,entity_type,status,row_count,inserted_count,updated_count,summary_json,created_at
    ) VALUES(?,?,?,?,'completed',?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(importId,chunkId,claims.organizationId,entity,validated.length,inserted,updated,chunkSummary));

  statements.push(env.DB.prepare(`
    UPDATE core_bulk_master_runs
    SET row_count=row_count+?,inserted_count=inserted_count+?,updated_count=updated_count+?,
        warning_count=warning_count+?,status=?,updated_at=CURRENT_TIMESTAMP,
        completed_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE completed_at END
    WHERE id=? AND organization_id=?
  `).bind(validated.length,inserted,updated,validated.reduce((n,r)=>n+r.warnings.length,0),
    finalChunk?'completed':'running',finalChunk?1:0,importId,claims.organizationId));

  const sync=await env.DB.prepare('SELECT revision,cutover_mode FROM core_sync_state WHERE organization_id=?').bind(claims.organizationId).first();
  if(sync?.cutover_mode!=='cloud') return json({error:'CUTOVER_REQUIRED'},409);
  const currentRevision=Number(sync.revision||0), nextRevision=currentRevision+1;
  const mutationId=`bulk-master:${importId}:${chunkId}`;
  const guardId=`guard:${importId}:${chunkId}`;
  statements.unshift(env.DB.prepare(`
    INSERT INTO core_bulk_revision_guards(organization_id,guard_id,expected_revision,created_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
  `).bind(claims.organizationId,guardId,currentRevision));
  statements.push(env.DB.prepare(`
    INSERT OR IGNORE INTO core_sync_mutations(
      organization_id,mutation_id,actor_user_id,base_revision,applied_revision,change_count,created_at
    ) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(claims.organizationId,mutationId,claims.sub,currentRevision,nextRevision,validated.length));
  statements.push(env.DB.prepare(
    'DELETE FROM core_bulk_revision_guards WHERE organization_id=? AND guard_id=?'
  ).bind(claims.organizationId,guardId));
  statements.push(env.DB.prepare(`
    UPDATE core_sync_state SET revision=?,last_mutation_id=?,updated_at=CURRENT_TIMESTAMP
    WHERE organization_id=? AND revision=?
  `).bind(nextRevision,mutationId,claims.organizationId,currentRevision));

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const latest=await env.DB.prepare(
      'SELECT revision FROM core_sync_state WHERE organization_id=? LIMIT 1'
    ).bind(claims.organizationId).first().catch(()=>null);
    if(Number(latest?.revision) !== currentRevision){
      return json({error:'REVISION_CONFLICT',revision:Number(latest?.revision||0),requestId},409);
    }
    throw error;
  }
  return json({ok:true,entity,importId,chunkId,revision:nextRevision,summary:{inserted,updated}},201);
}

export async function handleBulkMasterRoute(request,env,claims,url=new URL(request.url),requestId=crypto.randomUUID()){
  const match=url.pathname.match(/^\/api\/bulk\/master\/([^/]+)\/(preview|commit)$/);
  if (env.CORE_BULK_API_ENABLED !== 'true') return json({error:'CORE_BULK_API_LOCKED',requestId},503);
  if(!match) return null;
  if(!claims?.organizationId) return json({error:'ORGANIZATION_REQUIRED',requestId},409);
  const entity=decodeURIComponent(match[1]), action=match[2];
  if(!ENTITY_TYPES.has(entity)) return json({error:'BULK_ENTITY_NOT_SUPPORTED',requestId},404);
  if(request.method!=='POST') return json({error:'METHOD_NOT_ALLOWED',requestId},405);
  if(action==='preview') return preview(request,env,claims,entity);
  return commit(request,env,claims,entity,requestId);
}

export const __test = {
  ENTITY_TYPES,MANAGER_ENTITIES,normalize,naturalKey,status,allowedEntity,summary,
};
