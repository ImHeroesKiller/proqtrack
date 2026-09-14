const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  },
});

const str = value => String(value ?? '').trim();
const roleOf = claims => str(claims?.role).toLowerCase();
const BROAD_ROLES = new Set(['superadmin', 'head', 'admin']);
const MAX_LIST = 100;

function projectAllowed(claims, projectId) {
  return BROAD_ROLES.has(roleOf(claims)) || (Array.isArray(claims?.projectIds) && claims.projectIds.includes(projectId));
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(buffer) {
  return hex(await crypto.subtle.digest('SHA-256', buffer));
}

function sniffImage(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: 'image/jpeg', ext: 'jpg' };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return { contentType: 'image/png', ext: 'png' };
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { contentType: 'image/webp', ext: 'webp' };
  return null;
}

function objectSegment(value) {
  return str(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'unknown';
}

async function writeAudit(env, claims, action, entityId, projectId, outcome = 'success', detail = {}) {
  try {
    await env.DB.prepare(`
      INSERT INTO core_operational_audit_logs(
        organization_id,request_id,actor_user_id,actor_role,action,entity_type,entity_id,project_id,outcome,detail_json
      ) VALUES(?,?,?,?,?,'field_evidence',?,?,?,?)
    `).bind(claims.organizationId, crypto.randomUUID(), claims.sub, claims.role, action, entityId || null, projectId || null, outcome, JSON.stringify(detail || {})).run();
  } catch (error) {
    console.warn('evidence_audit_failed', error?.message || error);
  }
}

async function resolveEmployeeAccess(env, claims, projectId, requestedEmployeeId = '') {
  const organizationId = claims.organizationId;
  if (!organizationId || !projectId || !projectAllowed(claims, projectId)) return null;
  let employeeId = str(requestedEmployeeId);
  if (!employeeId) {
    const own = await env.DB.prepare(`
      SELECT e.id FROM core_employees e
      JOIN core_employee_project_assignments a
        ON a.organization_id=e.organization_id AND a.employee_id=e.id AND a.project_id=? AND a.status='active'
      WHERE e.organization_id=? AND e.auth_user_id=? AND e.employment_status='active' LIMIT 1
    `).bind(projectId, organizationId, claims.sub).first();
    employeeId = str(own?.id);
  }
  if (!employeeId) return null;
  const row = await env.DB.prepare(`
    SELECT e.id,e.auth_user_id,a.supervisor_user_id FROM core_employees e
    JOIN core_employee_project_assignments a
      ON a.organization_id=e.organization_id AND a.employee_id=e.id AND a.project_id=? AND a.status='active'
    WHERE e.organization_id=? AND e.id=? AND e.employment_status='active' LIMIT 1
  `).bind(projectId, organizationId, employeeId).first();
  if (!row) return null;
  const role = roleOf(claims);
  if (BROAD_ROLES.has(role) || role === 'manager') return row;
  if (str(row.auth_user_id) === str(claims.sub)) return row;
  if (role === 'supervisor' && str(row.supervisor_user_id) === str(claims.sub)) return row;
  return null;
}

async function validateRelations(env, claims, projectId, employeeId, outletId, visitId) {
  const organizationId = claims.organizationId;
  if (outletId) {
    const outlet = await env.DB.prepare(`SELECT 1 AS ok FROM core_project_outlets WHERE organization_id=? AND project_id=? AND outlet_id=? AND status='active' LIMIT 1`).bind(organizationId, projectId, outletId).first();
    if (!outlet?.ok) throw new Error('OUTLET_PROJECT_MISMATCH');
  }
  if (visitId) {
    const visit = await env.DB.prepare(`SELECT 1 AS ok FROM core_visits WHERE organization_id=? AND id=? AND project_id=? AND employee_id=? LIMIT 1`).bind(organizationId, visitId, projectId, employeeId).first();
    if (!visit?.ok) throw new Error('VISIT_SCOPE_MISMATCH');
  }
}

function metadataRow(row) {
  if (!row) return null;
  let metadata = {};
  try { metadata = JSON.parse(row.metadata_json || '{}') || {}; } catch { metadata = {}; }
  return {
    id: row.id, organizationId: row.organization_id, projectId: row.project_id,
    outletId: row.outlet_id || null, employeeId: row.employee_id, visitId: row.visit_id || null,
    evidenceType: row.evidence_type, objectKey: row.object_key, contentType: row.content_type,
    sizeBytes: Number(row.size_bytes || 0), capturedAt: row.captured_at || null,
    latitude: row.latitude == null ? null : Number(row.latitude), longitude: row.longitude == null ? null : Number(row.longitude),
    contentSha256: row.content_sha256 || null, storageStatus: row.storage_status || 'ready', metadata,
    createdAt: row.created_at, updatedAt: row.updated_at || row.created_at,
  };
}

async function authorizeExisting(env, claims, row) {
  if (!row || row.organization_id !== claims.organizationId || !projectAllowed(claims, row.project_id)) return false;
  return !!(await resolveEmployeeAccess(env, claims, row.project_id, row.employee_id));
}

async function findEvidence(env, organizationId, evidenceId, idempotencyKey) {
  return env.DB.prepare(`SELECT * FROM core_field_evidence WHERE organization_id=? AND (id=? OR idempotency_key=?) LIMIT 1`).bind(organizationId, evidenceId, idempotencyKey).first();
}

function duplicateResponse(row, contentSha256, evidenceId) {
  if (!row) return null;
  if (row.content_sha256 !== contentSha256) return json({ error: 'EVIDENCE_IDEMPOTENCY_CONFLICT', evidenceId }, 409);
  if (row.storage_status === 'ready') return json({ ok: true, idempotent: true, evidence: metadataRow(row) });
  return null;
}

async function handleUpload(request, env, claims, url) {
  if (!env.FILES) return json({ error: 'EVIDENCE_STORAGE_UNAVAILABLE' }, 503);
  const organizationId = claims.organizationId;
  const projectId = str(url.searchParams.get('projectId'));
  const outletId = str(url.searchParams.get('outletId')) || null;
  const visitId = str(url.searchParams.get('visitId')) || null;
  const requestedEmployeeId = str(url.searchParams.get('employeeId'));
  const evidenceType = str(url.searchParams.get('evidenceType') || url.searchParams.get('category') || 'field_photo').slice(0, 80);
  const capturedAt = str(url.searchParams.get('capturedAt')) || new Date().toISOString();
  const latitudeRaw = url.searchParams.get('latitude');
  const longitudeRaw = url.searchParams.get('longitude');
  const latitude = latitudeRaw == null || latitudeRaw === '' ? null : Number(latitudeRaw);
  const longitude = longitudeRaw == null || longitudeRaw === '' ? null : Number(longitudeRaw);
  const evidenceId = str(request.headers.get('x-evidence-id') || url.searchParams.get('id') || crypto.randomUUID()).slice(0, 120);
  const idempotencyKey = str(request.headers.get('idempotency-key') || evidenceId).slice(0, 160);

  if (!organizationId || !projectId || !evidenceId || !projectAllowed(claims, projectId)) return json({ error: 'EVIDENCE_SCOPE_DENIED' }, 403);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(evidenceId)) return json({ error: 'INVALID_EVIDENCE_ID' }, 400);
  if ((latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) return json({ error: 'INVALID_COORDINATES' }, 400);

  const employee = await resolveEmployeeAccess(env, claims, projectId, requestedEmployeeId);
  if (!employee) return json({ error: 'EMPLOYEE_SCOPE_DENIED' }, 403);
  try { await validateRelations(env, claims, projectId, employee.id, outletId, visitId); }
  catch (error) { return json({ error: error.message }, 409); }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  const maxBytes = Number(env.EVIDENCE_MAX_FILE_BYTES || 5 * 1024 * 1024);
  if (declaredLength > maxBytes) return json({ error: 'EVIDENCE_TOO_LARGE', maxBytes }, 413);
  const payload = await request.arrayBuffer();
  if (!payload.byteLength || payload.byteLength > maxBytes) return json({ error: 'EVIDENCE_TOO_LARGE', maxBytes }, payload.byteLength ? 413 : 400);
  const sniffed = sniffImage(payload);
  if (!sniffed) return json({ error: 'UNSUPPORTED_EVIDENCE_TYPE' }, 415);
  const allowed = str(env.EVIDENCE_UPLOAD_TYPES || 'image/jpeg,image/png,image/webp').split(',').map(v => v.trim());
  if (!allowed.includes(sniffed.contentType)) return json({ error: 'UNSUPPORTED_EVIDENCE_TYPE' }, 415);

  const contentSha256 = await sha256(payload);
  let reservation = await findEvidence(env, organizationId, evidenceId, idempotencyKey);
  if (reservation) {
    const duplicate = duplicateResponse(reservation, contentSha256, evidenceId);
    if (duplicate) return duplicate;
  }

  let objectKey = reservation?.object_key || `evidence/${objectSegment(organizationId)}/${objectSegment(projectId)}/${objectSegment(evidenceId)}.${sniffed.ext}`;
  const name = str(url.searchParams.get('name') || `${evidenceId}.${sniffed.ext}`).slice(0, 180);
  const metadata = { name, source: 'offline-first', uploaderUserId: claims.sub };

  if (!reservation) {
    try {
      await env.DB.prepare(`
        INSERT INTO core_field_evidence(
          id,organization_id,project_id,outlet_id,employee_id,visit_id,evidence_type,object_key,
          content_type,size_bytes,captured_at,latitude,longitude,content_sha256,metadata_json,
          uploader_user_id,idempotency_key,row_version,updated_at,storage_status
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,'uploading')
      `).bind(evidenceId, organizationId, projectId, outletId, employee.id, visitId, evidenceType, objectKey, sniffed.contentType, payload.byteLength, capturedAt, latitude, longitude, contentSha256, JSON.stringify(metadata), claims.sub, idempotencyKey).run();
      reservation = await findEvidence(env, organizationId, evidenceId, idempotencyKey);
    } catch (error) {
      reservation = await findEvidence(env, organizationId, evidenceId, idempotencyKey);
      const duplicate = duplicateResponse(reservation, contentSha256, evidenceId);
      if (duplicate) return duplicate;
      if (!reservation || reservation.content_sha256 !== contentSha256) {
        console.error('evidence_reservation_failed', error?.message || error);
        return json({ error: 'EVIDENCE_METADATA_WRITE_FAILED' }, 500);
      }
      objectKey = reservation.object_key;
    }
  }

  try {
    await env.FILES.put(objectKey, payload, {
      httpMetadata: { contentType: sniffed.contentType, cacheControl: 'private, max-age=0, no-store' },
      customMetadata: { organizationId, projectId, employeeId: employee.id, outletId: outletId || '', visitId: visitId || '', evidenceType, sha256: contentSha256 },
    });
    await env.DB.prepare(`UPDATE core_field_evidence SET storage_status='ready',updated_at=CURRENT_TIMESTAMP,row_version=row_version+1 WHERE organization_id=? AND id=? AND content_sha256=? AND storage_status='uploading'`).bind(organizationId, evidenceId, contentSha256).run();
  } catch (error) {
    await writeAudit(env, claims, 'upload_evidence', evidenceId, projectId, 'failed', { error: 'EVIDENCE_STORAGE_WRITE_FAILED' });
    console.error('evidence_storage_write_failed', error?.message || error);
    return json({ error: 'EVIDENCE_STORAGE_WRITE_FAILED' }, 503);
  }

  const row = await env.DB.prepare('SELECT * FROM core_field_evidence WHERE organization_id=? AND id=?').bind(organizationId, evidenceId).first();
  await writeAudit(env, claims, 'upload_evidence', evidenceId, projectId, 'success', { contentType: sniffed.contentType, sizeBytes: payload.byteLength });
  return json({ ok: true, evidence: metadataRow(row) }, 201);
}

async function handleList(env, claims, url) {
  const organizationId = claims.organizationId;
  const projectId = str(url.searchParams.get('projectId'));
  if (!organizationId || (projectId && !projectAllowed(claims, projectId))) return json({ error: 'EVIDENCE_SCOPE_DENIED' }, 403);
  const limit = Math.min(MAX_LIST, Math.max(1, Number(url.searchParams.get('limit') || 50)));
  const rows = projectId
    ? await env.DB.prepare("SELECT * FROM core_field_evidence WHERE organization_id=? AND project_id=? AND storage_status='ready' ORDER BY created_at DESC LIMIT ?").bind(organizationId, projectId, limit).all()
    : await env.DB.prepare("SELECT * FROM core_field_evidence WHERE organization_id=? AND storage_status='ready' ORDER BY created_at DESC LIMIT ?").bind(organizationId, limit).all();
  const visible = [];
  for (const row of rows?.results || []) if (await authorizeExisting(env, claims, row)) visible.push(metadataRow(row));
  return json({ ok: true, evidence: visible });
}

async function handleRead(env, claims, evidenceId, metadataOnly = false) {
  const row = await env.DB.prepare('SELECT * FROM core_field_evidence WHERE organization_id=? AND id=? LIMIT 1').bind(claims.organizationId, evidenceId).first();
  if (!row) return json({ error: 'EVIDENCE_NOT_FOUND' }, 404);
  if (!(await authorizeExisting(env, claims, row))) return json({ error: 'EVIDENCE_SCOPE_DENIED' }, 403);
  if (row.storage_status !== 'ready') return json({ error: 'EVIDENCE_UPLOAD_IN_PROGRESS' }, 425);
  if (metadataOnly) return json({ ok: true, evidence: metadataRow(row) });
  const object = await env.FILES.get(row.object_key);
  if (!object) return json({ error: 'EVIDENCE_OBJECT_NOT_FOUND' }, 404);
  return new Response(object.body, {
    status: 200,
    headers: {
      'content-type': row.content_type,
      'content-length': String(row.size_bytes),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
      'etag': row.content_sha256 ? `"${row.content_sha256}"` : '',
    },
  });
}

export async function handleEvidenceRoute(request, env, claims, url = new URL(request.url)) {
  if (!url.pathname.startsWith('/api/evidence')) return null;
  if (env.CORE_EVIDENCE_API_ENABLED !== 'true') return json({ error: 'EVIDENCE_API_LOCKED' }, 503);
  if (!claims?.organizationId) return json({ error: 'ORGANIZATION_REQUIRED' }, 409);
  if (url.pathname === '/api/evidence' && request.method === 'POST') return handleUpload(request, env, claims, url);
  if (url.pathname === '/api/evidence' && request.method === 'GET') return handleList(env, claims, url);
  const suffix = url.pathname.slice('/api/evidence/'.length);
  if (!suffix) return json({ error: 'NOT_FOUND' }, 404);
  if (suffix.endsWith('/meta') && request.method === 'GET') return handleRead(env, claims, decodeURIComponent(suffix.slice(0, -5)), true);
  if (request.method === 'GET') return handleRead(env, claims, decodeURIComponent(suffix), false);
  return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
}

export const __test = { sniffImage, projectAllowed, objectSegment };
