const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' },
});

const clean = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const normalizeCode = value => clean(value, 32).toUpperCase().replace(/[^A-Z0-9_-]+/g, '').slice(0, 24);
const validTimezone = value => {
  const v = clean(value, 64);
  return v || 'Asia/Jakarta';
};

function metadata(input = {}, existing = '{}') {
  let base = {};
  try { base = JSON.parse(existing || '{}') || {}; } catch { base = {}; }
  const next = {
    ...base,
    legalName: clean(input.legalName ?? base.legalName, 240),
    industry: clean(input.industry ?? base.industry, 160),
    city: clean(input.city ?? base.city, 160),
    notes: clean(input.notes ?? base.notes, 1200),
  };
  return JSON.stringify(next);
}

function publicOrg(row) {
  let meta = {};
  try { meta = JSON.parse(row?.metadata_json || '{}') || {}; } catch { meta = {}; }
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    timezone: row.timezone || 'Asia/Jakarta',
    legalName: meta.legalName || row.name,
    industry: meta.industry || '',
    city: meta.city || '',
    notes: meta.notes || '',
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function audit(env, requestId, claims, action, resourceId, detail = {}) {
  try {
    await env.DB.prepare(`
      INSERT INTO security_audit_logs(
        request_id,actor_id,actor_role,action,resource_type,resource_id,outcome,detail,created_at
      ) VALUES(?,?,?,?, 'organization', ?, 'success', ?, CURRENT_TIMESTAMP)
    `).bind(
      requestId,claims.sub,claims.role,action,resourceId || null,
      JSON.stringify(detail).slice(0,1000),
    ).run();
  } catch (error) {
    console.warn('organization_admin_audit_failed', error?.message || error);
  }
}

async function listOrganizations(env, requestId) {
  const result = await env.DB.prepare(`
    SELECT id,code,name,status,timezone,metadata_json,created_at,updated_at
    FROM core_organizations
    ORDER BY lower(name),id
  `).all();
  return json({ ok:true, organizations:(result?.results || []).map(publicOrg), requestId });
}

async function createOrganization(request, env, claims, requestId) {
  const body = await request.json().catch(() => ({}));
  const name = clean(body.name, 240);
  const code = normalizeCode(body.code || name);
  const status = ['active','inactive','suspended'].includes(clean(body.status).toLowerCase())
    ? clean(body.status).toLowerCase() : 'active';
  const timezone = validTimezone(body.timezone);
  if (!name) return json({ error:'ORGANIZATION_NAME_REQUIRED', requestId },400);
  if (!code) return json({ error:'ORGANIZATION_CODE_REQUIRED', requestId },400);

  const duplicate = await env.DB.prepare(
    'SELECT id FROM core_organizations WHERE upper(code)=? LIMIT 1',
  ).bind(code).first();
  if (duplicate) return json({ error:'ORGANIZATION_CODE_EXISTS', requestId },409);

  const id = `ORG-${crypto.randomUUID()}`;
  const meta = metadata(body);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO core_organizations(
        id,code,name,status,timezone,metadata_json,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(id,code,name,status,timezone,meta),
    env.DB.prepare(`
      INSERT INTO core_sync_state(
        organization_id,revision,cutover_mode,imported_at,updated_at
      ) VALUES(?,0,'cloud',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(id),
  ]);
  await audit(env,requestId,claims,'create_organization',id,{ code,name,status });

  const row = await env.DB.prepare(`
    SELECT id,code,name,status,timezone,metadata_json,created_at,updated_at
    FROM core_organizations WHERE id=? LIMIT 1
  `).bind(id).first();
  return json({ ok:true, organization:publicOrg(row), requestId },201);
}

async function updateOrganization(request, env, claims, id, requestId) {
  const current = await env.DB.prepare(`
    SELECT id,code,name,status,timezone,metadata_json,created_at,updated_at
    FROM core_organizations WHERE id=? LIMIT 1
  `).bind(id).first();
  if (!current) return json({ error:'ORGANIZATION_NOT_FOUND', requestId },404);

  const body = await request.json().catch(() => ({}));
  const name = body.name == null ? current.name : clean(body.name,240);
  const code = body.code == null ? current.code : normalizeCode(body.code);
  const status = body.status == null ? current.status : clean(body.status).toLowerCase();
  const timezone = body.timezone == null ? current.timezone : validTimezone(body.timezone);
  if (!name) return json({ error:'ORGANIZATION_NAME_REQUIRED', requestId },400);
  if (!code) return json({ error:'ORGANIZATION_CODE_REQUIRED', requestId },400);
  if (!['active','inactive','suspended'].includes(status)) {
    return json({ error:'ORGANIZATION_STATUS_INVALID', requestId },400);
  }
  if (String(claims.organizationId || '') === String(id) && status !== 'active') {
    return json({ error:'ACTIVE_ORGANIZATION_CANNOT_BE_DISABLED', requestId },409);
  }
  const duplicate = await env.DB.prepare(
    'SELECT id FROM core_organizations WHERE upper(code)=? AND id<>? LIMIT 1',
  ).bind(code,id).first();
  if (duplicate) return json({ error:'ORGANIZATION_CODE_EXISTS', requestId },409);

  const meta = metadata(body,current.metadata_json);
  await env.DB.prepare(`
    UPDATE core_organizations
    SET code=?,name=?,status=?,timezone=?,metadata_json=?,updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(code,name,status,timezone,meta,id).run();
  await audit(env,requestId,claims,'update_organization',id,{ code,name,status });

  const row = await env.DB.prepare(`
    SELECT id,code,name,status,timezone,metadata_json,created_at,updated_at
    FROM core_organizations WHERE id=? LIMIT 1
  `).bind(id).first();
  return json({ ok:true, organization:publicOrg(row), requestId });
}

export async function handleOrganizationAdminRoute(
  request, env, claims, url = new URL(request.url), requestId = crypto.randomUUID()
) {
  if (!url.pathname.startsWith('/api/admin/organizations')) return null;
  if (String(claims?.role || '').toLowerCase() !== 'superadmin') {
    return json({ error:'ORGANIZATION_ADMIN_FORBIDDEN', requestId },403);
  }

  if (url.pathname === '/api/admin/organizations' && request.method === 'GET') {
    return listOrganizations(env,requestId);
  }
  if (url.pathname === '/api/admin/organizations' && request.method === 'POST') {
    try { return await createOrganization(request,env,claims,requestId); }
    catch (error) { return json({ error:String(error?.message || error), requestId },409); }
  }

  const match = url.pathname.match(/^\/api\/admin\/organizations\/([^/]+)$/);
  if (match && request.method === 'PATCH') {
    try {
      return await updateOrganization(request,env,claims,decodeURIComponent(match[1]),requestId);
    } catch (error) {
      return json({ error:String(error?.message || error), requestId },409);
    }
  }
  return null;
}

export const __test = { normalizeCode, validTimezone, metadata, publicOrg };
