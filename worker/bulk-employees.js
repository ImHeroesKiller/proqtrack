import { hashPassword } from './index.js';

const MAX_PREVIEW_ROWS = 100;
const MAX_COMMIT_ROWS = 20;
const ACTOR_ROLES = new Set(['superadmin','head','admin','manager']);

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const str = (value, max = 240) => String(value ?? '').trim().slice(0, max);
const lower = value => str(value).toLowerCase();
const bool = value => ['1','true','yes','y','ya','iya','on'].includes(lower(value));
const allRows = async stmt => {
  const result = await stmt.all();
  return Array.isArray(result?.results) ? result.results : [];
};

function loginRole(value) {
  const role = lower(value);
  if (['supervisor','spv'].includes(role)) return 'supervisor';
  if (['employee','field sales','field_sales','sales','spg','merchandiser','promotor','agent','crew'].includes(role) || !role) return 'employee';
  return '';
}

function employmentStatus(value) {
  const status = lower(value);
  if (!status || ['active','aktif'].includes(status)) return 'active';
  if (['inactive','nonaktif','non-active'].includes(status)) return 'inactive';
  if (['terminated','resign','resigned'].includes(status)) return 'terminated';
  return '';
}

function normalizeRow(input = {}, index = 0) {
  const employeeCode = str(input.employee_code || input.employeeCode || input.code, 120);
  const fullName = str(input.full_name || input.fullName || input.name, 180);
  const email = lower(input.email).slice(0, 180);
  const phone = str(input.phone, 80);
  const role = loginRole(input.role);
  const area = str(input.area, 160);
  const position = str(input.position, 160) || (role === 'supervisor' ? 'Supervisor' : 'Field Sales');
  const projectRef = str(input.project_code || input.projectCode || input.project_id || input.projectId || input.project, 180);
  const supervisorEmail = lower(input.supervisor_email || input.supervisorEmail).slice(0, 180);
  const status = employmentStatus(input.status);
  const createLogin = bool(input.create_login ?? input.createLogin);
  const rowNumber = Number(input._row_number || input.rowNumber || index + 2);
  return { rowNumber, employeeCode, fullName, email, phone, role, area, position, projectRef, supervisorEmail, status, createLogin };
}

function randomPassword(length = 20) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
  const seed = ['A','a','7','!'];
  const bytes = crypto.getRandomValues(new Uint8Array(Math.max(length, 12)));
  const chars = [...seed];
  for (let i = chars.length; i < bytes.length; i += 1) chars.push(alphabet[bytes[i] % alphabet.length]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = bytes[i % bytes.length] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('').slice(0, length);
}

function employeeId() {
  return `EMP-${crypto.randomUUID()}`;
}
function assignmentId() {
  return `ASN-${crypto.randomUUID()}`;
}
function userId() {
  return `USR-${crypto.randomUUID()}`;
}

async function context(env, claims) {
  const org = claims.organizationId;
  const [projects, employees, users, memberships, projectMemberships, assignments] = await Promise.all([
    allRows(env.DB.prepare("SELECT id,code,name,status FROM core_projects WHERE organization_id=? AND status='active'").bind(org)),
    allRows(env.DB.prepare('SELECT id,auth_user_id,employee_code,full_name,email,phone,employment_status,metadata_json FROM core_employees WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare(`
      SELECT u.id,u.email,u.role AS global_role,u.status AS user_status,
             ou.role AS membership_role,ou.status AS membership_status
      FROM auth_users u
      LEFT JOIN core_organization_users ou
        ON ou.user_id=u.id AND ou.organization_id=?
    `).bind(org)),
    allRows(env.DB.prepare('SELECT user_id,role,status FROM core_organization_users WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT project_id,user_id,role,status FROM core_project_memberships WHERE organization_id=?').bind(org)),
    allRows(env.DB.prepare('SELECT id,project_id,employee_id,status FROM core_employee_project_assignments WHERE organization_id=?').bind(org)),
  ]);

  const projectByRef = new Map();
  for (const project of projects) {
    for (const key of [project.id, project.code, project.name]) if (key) projectByRef.set(lower(key), project);
  }
  return {
    org,
    projectByRef,
    employeeByCode: new Map(employees.map(row => [lower(row.employee_code), row])),
    employeeByEmail: new Map(employees.filter(row => row.email).map(row => [lower(row.email), row])),
    userByEmail: new Map(users.map(row => [lower(row.email), row])),
    membershipByUser: new Map(memberships.map(row => [String(row.user_id), row])),
    projectMembershipByKey: new Map(projectMemberships.map(row => [`${row.project_id}:${row.user_id}`, row])),
    assignmentByKey: new Map(assignments.map(row => [`${row.project_id}:${row.employee_id}`, row])),
  };
}

function safeMetadata(existing = '{}', patch = {}) {
  let base = {};
  try { base = JSON.parse(existing || '{}') || {}; } catch { base = {}; }
  return JSON.stringify({ ...base, ...patch });
}

function validateRows(rows, ctx, claims) {
  const seenCodes = new Map();
  const seenEmails = new Map();
  const output = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = normalizeRow(rows[index], index);
    const errors = [], warnings = [];

    if (!row.employeeCode) errors.push('EMPLOYEE_CODE_REQUIRED');
    if (!row.fullName) errors.push('FULL_NAME_REQUIRED');
    if (!row.projectRef) errors.push('PROJECT_REQUIRED');
    if (!row.role) errors.push('ROLE_INVALID');
    if (!row.status) errors.push('STATUS_INVALID');
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('EMAIL_INVALID');
    if (row.createLogin && !row.email) errors.push('EMAIL_REQUIRED_FOR_LOGIN');

    const codeKey = lower(row.employeeCode);
    if (codeKey) {
      if (seenCodes.has(codeKey)) errors.push(`DUPLICATE_EMPLOYEE_CODE_ROW_${seenCodes.get(codeKey)}`);
      else seenCodes.set(codeKey, row.rowNumber);
    }
    if (row.email) {
      if (seenEmails.has(row.email)) errors.push(`DUPLICATE_EMAIL_ROW_${seenEmails.get(row.email)}`);
      else seenEmails.set(row.email, row.rowNumber);
    }

    const project = ctx.projectByRef.get(lower(row.projectRef));
    if (!project) errors.push('PROJECT_NOT_FOUND');
    else if (claims.role === 'manager' && !claims.projectIds?.includes(String(project.id))) errors.push('PROJECT_OUT_OF_SCOPE');

    const existing = ctx.employeeByCode.get(codeKey) || null;
    const emailOwner = row.email ? ctx.employeeByEmail.get(row.email) : null;
    if (emailOwner && (!existing || String(emailOwner.id) !== String(existing.id))) errors.push('EMAIL_USED_BY_ANOTHER_EMPLOYEE');

    let supervisor = null;
    if (row.supervisorEmail) {
      supervisor = ctx.userByEmail.get(row.supervisorEmail) || null;
      const membership = supervisor ? ctx.membershipByUser.get(String(supervisor.id)) : null;
      if (!supervisor || supervisor.user_status !== 'active' || membership?.status !== 'active'
        || !['head','admin','manager','supervisor'].includes(String(membership?.role || ''))) {
        errors.push('SUPERVISOR_NOT_FOUND');
      }
    }

    const user = row.email ? ctx.userByEmail.get(row.email) || null : null;
    if (user && existing?.auth_user_id && String(existing.auth_user_id) !== String(user.id)) {
      errors.push('EMPLOYEE_LOGIN_IDENTITY_MISMATCH');
    }
    if (user && !existing?.auth_user_id) {
      const membership = ctx.membershipByUser.get(String(user.id));
      if (user.global_role === 'superadmin' || ['head','admin','manager'].includes(String(membership?.role || ''))) {
        errors.push('PRIVILEGED_LOGIN_REQUIRES_ACCOUNT_MANAGEMENT');
      }
    }
    let loginAction = 'none';
    if (row.createLogin) {
      if (user?.user_status && user.user_status !== 'active') errors.push('LOGIN_USER_DISABLED');
      else if (!user) loginAction = 'create';
      else {
        const membership = ctx.membershipByUser.get(String(user.id));
        loginAction = membership?.status === 'active' ? 'existing' : 'link';
        if (membership?.status === 'active' && membership.role !== row.role) {
          warnings.push(`LOGIN_ROLE_PRESERVED_${String(membership.role).toUpperCase()}`);
        }
      }
    } else if (existing?.auth_user_id) {
      loginAction = 'existing';
    }

    if (existing) warnings.push('EMPLOYEE_WILL_BE_UPDATED');

    output.push({
      ...row,
      projectId: project?.id || null,
      projectCode: project?.code || row.projectRef,
      existingEmployeeId: existing?.id || null,
      existingAuthUserId: existing?.auth_user_id || null,
      supervisorUserId: supervisor?.id || null,
      loginUserId: user?.id || null,
      action: existing ? 'update' : 'create',
      loginAction,
      errors,
      warnings,
      valid: errors.length === 0,
    });
  }
  return output;
}

function summary(rows) {
  return {
    total: rows.length,
    valid: rows.filter(row => row.valid).length,
    errors: rows.reduce((sum, row) => sum + row.errors.length, 0),
    warnings: rows.reduce((sum, row) => sum + row.warnings.length, 0),
    inserts: rows.filter(row => row.valid && row.action === 'create').length,
    updates: rows.filter(row => row.valid && row.action === 'update').length,
    loginCreates: rows.filter(row => row.valid && row.loginAction === 'create').length,
    loginLinks: rows.filter(row => row.valid && row.loginAction === 'link').length,
  };
}

async function preview(request, env, claims) {
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length || rows.length > MAX_PREVIEW_ROWS) return json({ error: 'INVALID_ROW_COUNT', max: MAX_PREVIEW_ROWS }, 400);
  const ctx = await context(env, claims);
  const validated = validateRows(rows, ctx, claims);
  return json({
    ok: true,
    rows: validated.map(row => ({
      rowNumber: row.rowNumber,
      employeeCode: row.employeeCode,
      fullName: row.fullName,
      email: row.email,
      projectCode: row.projectCode,
      role: row.role,
      action: row.action,
      loginAction: row.loginAction,
      valid: row.valid,
      errors: row.errors,
      warnings: row.warnings,
    })),
    summary: summary(validated),
  });
}

async function commit(request, env, claims, requestId) {
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length || rows.length > MAX_COMMIT_ROWS) return json({ error: 'INVALID_ROW_COUNT', max: MAX_COMMIT_ROWS }, 400);

  const importId = str(body.importId || `BULK-${crypto.randomUUID()}`, 120);
  const chunkId = str(body.chunkId || '1', 80);
  const sourceName = str(body.sourceName || 'bulk-upload', 180);
  const finalChunk = body.finalChunk === true;

  const replay = await env.DB.prepare(
    "SELECT status,row_count FROM core_bulk_import_chunks WHERE import_id=? AND chunk_id=? AND organization_id=? LIMIT 1",
  ).bind(importId, chunkId, claims.organizationId).first();
  if (replay?.status === 'completed') {
    return json({ ok: true, replayed: true, importId, chunkId, credentials: [] });
  }

  const ctx = await context(env, claims);
  const validated = validateRows(rows, ctx, claims);
  const totals = summary(validated);
  if (totals.errors) return json({ error: 'BULK_VALIDATION_FAILED', rows: validated, summary: totals }, 422);

  const statements = [];
  const credentials = [];
  let inserted = 0, updated = 0, loginCreated = 0, loginLinked = 0;

  for (const row of validated) {
    const existing = row.existingEmployeeId ? ctx.employeeByCode.get(lower(row.employeeCode)) : null;
    const empId = existing?.id || employeeId();
    let authUserId = existing?.auth_user_id || null;
    let membershipRole = row.role;

    if (row.createLogin) {
      if (row.loginAction === 'create') {
        authUserId = userId();
        const password = randomPassword();
        const passwordHash = await hashPassword(password);
        statements.push(env.DB.prepare(`
          INSERT INTO auth_users(id,email,password_hash,role,status,project_ids,client_ids,created_at)
          VALUES(?,?,?,?,'active','[]','[]',CURRENT_TIMESTAMP)
        `).bind(authUserId,row.email,passwordHash,row.role));
        credentials.push({
          rowNumber: row.rowNumber,
          employeeCode: row.employeeCode,
          fullName: row.fullName,
          email: row.email,
          initialPassword: password,
        });
        loginCreated += 1;
      } else {
        authUserId = row.loginUserId || authUserId;
        if (row.loginAction === 'link') loginLinked += 1;
        const existingMembership = authUserId ? ctx.membershipByUser.get(String(authUserId)) : null;
        if (existingMembership?.role) membershipRole = existingMembership.role;
      }

      if (authUserId) {
        statements.push(env.DB.prepare(`
          INSERT INTO core_organization_users(organization_id,user_id,role,status,created_at,updated_at)
          VALUES(?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT(organization_id,user_id) DO UPDATE SET
            status='active',
            role=CASE
              WHEN core_organization_users.role='employee' THEN excluded.role
              ELSE core_organization_users.role
            END,
            updated_at=CURRENT_TIMESTAMP
        `).bind(claims.organizationId,authUserId,membershipRole));

        const projectMembership = ctx.projectMembershipByKey.get(`${row.projectId}:${authUserId}`);
        const projectRole = projectMembership?.role || (membershipRole === 'supervisor' ? 'supervisor' : 'employee');
        statements.push(env.DB.prepare(`
          INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,created_at,updated_at)
          VALUES(?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT(organization_id,project_id,user_id) DO UPDATE SET
            status='active',
            role=core_project_memberships.role,
            updated_at=CURRENT_TIMESTAMP
        `).bind(claims.organizationId,row.projectId,authUserId,projectRole));
      }
    }

    const metadata = safeMetadata(existing?.metadata_json, {
      role: row.role === 'supervisor' ? 'Supervisor' : 'Field Sales',
      area: row.area,
      position: row.position,
      bulkImportId: importId,
      bulkImportedAt: new Date().toISOString(),
    });
    if (existing) updated += 1;
    else inserted += 1;

    statements.push(env.DB.prepare(`
      INSERT INTO core_employees(
        id,organization_id,auth_user_id,employee_code,full_name,email,phone,
        employment_status,metadata_json,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        auth_user_id=COALESCE(excluded.auth_user_id,core_employees.auth_user_id),
        employee_code=excluded.employee_code,
        full_name=excluded.full_name,
        email=excluded.email,
        phone=excluded.phone,
        employment_status=excluded.employment_status,
        metadata_json=excluded.metadata_json,
        updated_at=CURRENT_TIMESTAMP
      WHERE core_employees.organization_id=excluded.organization_id
    `).bind(
      empId,claims.organizationId,authUserId,row.employeeCode,row.fullName,
      row.email || null,row.phone || null,row.status,metadata,
    ));

    const assignmentKey = `${row.projectId}:${empId}`;
    const existingAssignment = ctx.assignmentByKey.get(assignmentKey);
    statements.push(env.DB.prepare(`
      INSERT INTO core_employee_project_assignments(
        id,organization_id,project_id,employee_id,supervisor_user_id,position_name,
        status,starts_on,metadata_json,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,'active',date('now'),'{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        supervisor_user_id=excluded.supervisor_user_id,
        position_name=excluded.position_name,
        status='active',
        updated_at=CURRENT_TIMESTAMP
      WHERE core_employee_project_assignments.organization_id=excluded.organization_id
    `).bind(
      existingAssignment?.id || assignmentId(),claims.organizationId,row.projectId,empId,
      row.supervisorUserId || null,row.position,
    ));
  }

  const runStatus = finalChunk ? 'completed' : 'running';
  statements.push(env.DB.prepare(`
    INSERT INTO core_bulk_import_runs(
      id,organization_id,actor_user_id,entity_type,source_name,status,row_count,
      inserted_count,updated_count,login_created_count,login_linked_count,
      warning_count,error_count,detail_json,created_at,updated_at,completed_at
    ) VALUES(?,?,?,'employees',?,?,?,?,?,?,?,?,0,'{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,
      CASE WHEN ?='completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
    ON CONFLICT(id) DO UPDATE SET
      row_count=core_bulk_import_runs.row_count+excluded.row_count,
      inserted_count=core_bulk_import_runs.inserted_count+excluded.inserted_count,
      updated_count=core_bulk_import_runs.updated_count+excluded.updated_count,
      login_created_count=core_bulk_import_runs.login_created_count+excluded.login_created_count,
      login_linked_count=core_bulk_import_runs.login_linked_count+excluded.login_linked_count,
      warning_count=core_bulk_import_runs.warning_count+excluded.warning_count,
      status=excluded.status,
      updated_at=CURRENT_TIMESTAMP,
      completed_at=CASE WHEN excluded.status='completed' THEN CURRENT_TIMESTAMP ELSE core_bulk_import_runs.completed_at END
  `).bind(
    importId,claims.organizationId,claims.sub,sourceName,runStatus,rows.length,
    inserted,updated,loginCreated,loginLinked,totals.warnings,runStatus,
  ));

  statements.push(env.DB.prepare(`
    INSERT INTO core_bulk_import_chunks(import_id,chunk_id,organization_id,status,row_count,created_at)
    VALUES(?,?,?,'completed',?,CURRENT_TIMESTAMP)
  `).bind(importId,chunkId,claims.organizationId,rows.length));

  statements.push(env.DB.prepare(`
    INSERT INTO core_sync_state(organization_id,revision,cutover_mode,imported_at,updated_at)
    VALUES(?,1,'cloud',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(organization_id) DO UPDATE SET
      revision=core_sync_state.revision+1,
      cutover_mode='cloud',
      updated_at=CURRENT_TIMESTAMP
  `).bind(claims.organizationId));

  statements.push(env.DB.prepare(`
    INSERT INTO security_audit_logs(
      request_id,actor_id,actor_role,action,resource_type,resource_id,outcome,detail,created_at
    ) VALUES(?,?,?,?,?,?, 'success', ?, CURRENT_TIMESTAMP)
  `).bind(
    requestId,claims.sub,claims.role,'bulk_employee_import','employees',importId,
    JSON.stringify({ chunkId, rows: rows.length, inserted, updated, loginCreated, loginLinked, warnings: totals.warnings }).slice(0,1000),
  ));

  await env.DB.batch(statements);
  const state = await env.DB.prepare('SELECT revision FROM core_sync_state WHERE organization_id=?').bind(claims.organizationId).first();

  return json({
    ok: true,
    importId,
    chunkId,
    revision: Number(state?.revision || 0),
    summary: { ...totals, inserted, updated, loginCreated, loginLinked },
    credentials,
  });
}

export async function handleBulkEmployeeRoute(request, env, claims, url = new URL(request.url), requestId = crypto.randomUUID()) {
  if (env.CORE_BULK_API_ENABLED === 'false') return json({ error: 'BULK_API_DISABLED' }, 503);
  if (!claims?.organizationId) return json({ error: 'ORGANIZATION_REQUIRED' }, 409);
  if (!ACTOR_ROLES.has(String(claims.role || '').toLowerCase())) return json({ error: 'BULK_FORBIDDEN' }, 403);

  if (url.pathname === '/api/bulk/employees/preview' && request.method === 'POST') return preview(request, env, claims);
  if (url.pathname === '/api/bulk/employees/commit' && request.method === 'POST') return commit(request, env, claims, requestId);
  return null;
}

export const __test = {
  MAX_PREVIEW_ROWS,
  MAX_COMMIT_ROWS,
  loginRole,
  employmentStatus,
  normalizeRow,
  validateRows,
  summary,
};
