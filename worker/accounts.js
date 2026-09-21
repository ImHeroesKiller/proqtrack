import { hashPassword } from './index.js';

const ADMIN_ROLES = new Set(['superadmin','head','admin']);
const ROLE_ORDER = Object.freeze({
  superadmin: 100,
  head: 80,
  admin: 70,
  manager: 50,
  supervisor: 30,
  employee: 10,
});

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const clean = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const lower = value => clean(value).toLowerCase();
const rows = async stmt => {
  const result = await stmt.all();
  return Array.isArray(result?.results) ? result.results : [];
};

function permittedRole(actorRole, targetRole) {
  const actor = lower(actorRole);
  const target = lower(targetRole);
  if (!['head','admin','manager','supervisor','employee'].includes(target)) return false;
  if (actor === 'superadmin') return true;
  if (actor === 'head') return target !== 'head';
  if (actor === 'admin') return ['manager','supervisor','employee'].includes(target);
  return false;
}

function canManageTarget(actorRole, targetRole, actorId, targetId) {
  if (String(actorId) === String(targetId)) return actorRole === 'superadmin' || actorRole === 'head' || actorRole === 'admin';
  return permittedRole(actorRole, targetRole);
}

function validEmail(value) {
  const email = lower(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

async function writeAudit(env, requestId, claims, action, resourceId, detail = {}) {
  try {
    await env.DB.prepare(`
      INSERT INTO security_audit_logs(
        request_id,actor_id,actor_role,action,resource_type,resource_id,outcome,detail,created_at
      ) VALUES(?,?,?,?, 'account', ?, 'success', ?, CURRENT_TIMESTAMP)
    `).bind(
      requestId,claims.sub,claims.role,action,resourceId || null,
      JSON.stringify(detail).slice(0,1000),
    ).run();
  } catch (error) {
    console.warn('account_admin_audit_failed', error?.message || error);
  }
}

async function findTarget(env, organizationId, userId) {
  return env.DB.prepare(`
    SELECT u.id,u.email,u.status AS global_status,ou.role,ou.status,
      (
        SELECT e.id FROM core_employees e
        WHERE e.organization_id=ou.organization_id AND e.auth_user_id=ou.user_id
        LIMIT 1
      ) AS employee_id,
      (
        SELECT pm.project_id FROM core_project_memberships pm
        WHERE pm.organization_id=ou.organization_id
          AND pm.user_id=ou.user_id
          AND pm.role='manager'
          AND pm.status='active'
        ORDER BY pm.project_id LIMIT 1
      ) AS project_id
    FROM core_organization_users ou
    JOIN auth_users u ON u.id=ou.user_id
    WHERE ou.organization_id=? AND ou.user_id=?
    LIMIT 1
  `).bind(organizationId,userId).first();
}

async function employeeForLink(env, organizationId, employeeId, targetUserId = '') {
  if (!employeeId) return null;
  const employee = await env.DB.prepare(`
    SELECT id,full_name,email,auth_user_id,employment_status
    FROM core_employees
    WHERE organization_id=? AND id=?
    LIMIT 1
  `).bind(organizationId,employeeId).first();
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');
  if (employee.auth_user_id && String(employee.auth_user_id) !== String(targetUserId || '')) {
    throw new Error('EMPLOYEE_ALREADY_LINKED');
  }
  return employee;
}

async function projectForManager(env, organizationId, projectId) {
  if (!projectId) throw new Error('PROJECT_REQUIRED');
  const project = await env.DB.prepare(`
    SELECT id FROM core_projects
    WHERE organization_id=? AND id=? AND status='active'
    LIMIT 1
  `).bind(organizationId,projectId).first();
  if (!project) throw new Error('PROJECT_NOT_FOUND');
  return project;
}

async function activeEmployeeProjects(env, organizationId, employeeId) {
  if (!employeeId) return [];
  return rows(env.DB.prepare(`
    SELECT project_id FROM core_employee_project_assignments
    WHERE organization_id=? AND employee_id=? AND status='active'
    ORDER BY project_id
  `).bind(organizationId,employeeId));
}

async function accountList(env, claims, requestId) {
  const organizationId = claims.organizationId;
  const list = await rows(env.DB.prepare(`
    SELECT
      u.id,u.email,ou.role,ou.status,
      e.id AS employee_id,e.full_name,
      d.status AS device_status,d.device_label,d.paired_at,d.last_seen_at,
      (
        SELECT pm.project_id FROM core_project_memberships pm
        WHERE pm.organization_id=ou.organization_id
          AND pm.user_id=ou.user_id
          AND pm.role='manager'
          AND pm.status='active'
        ORDER BY pm.project_id LIMIT 1
      ) AS project_id
    FROM core_organization_users ou
    JOIN auth_users u ON u.id=ou.user_id
    LEFT JOIN core_employees e
      ON e.organization_id=ou.organization_id AND e.auth_user_id=u.id
    LEFT JOIN core_auth_devices d
      ON d.organization_id=ou.organization_id AND d.user_id=u.id
    WHERE ou.organization_id=?
    ORDER BY lower(u.email),u.id
  `).bind(organizationId));

  const visible = list.filter(row => {
    if (claims.role === 'superadmin') return true;
    if (claims.role === 'head') return row.role !== 'head';
    if (claims.role === 'admin') return String(row.id) === String(claims.sub) || ['manager','supervisor','employee'].includes(row.role);
    return false;
  });

  return json({
    ok: true,
    accounts: visible.map(row => ({
      id: row.id,
      organizationId,
      email: row.email,
      name: row.full_name || row.email,
      role: row.role,
      status: row.status,
      employeeId: row.employee_id || null,
      projectId: row.project_id || null,
      deviceBound: row.device_status === 'active',
      deviceLabel: row.device_label || '',
      devicePairedAt: row.paired_at || null,
      deviceLastSeenAt: row.last_seen_at || null,
    })),
    requestId,
  });
}

async function createAccount(env, claims, request, requestId) {
  const body = await request.json().catch(() => ({}));
  const email = validEmail(body.email);
  const password = String(body.password || '');
  const role = lower(body.role || 'employee');
  const status = ['active','inactive','suspended'].includes(lower(body.status)) ? lower(body.status) : 'active';
  const employeeId = clean(body.employeeId,120);
  const projectId = clean(body.projectId,120);
  if (!email) return json({ error:'EMAIL_INVALID', requestId },400);
  if (password.length < 8) return json({ error:'PASSWORD_TOO_SHORT', requestId },400);
  if (!permittedRole(claims.role,role)) return json({ error:'ACCOUNT_ROLE_FORBIDDEN', requestId },403);

  const conflict = await env.DB.prepare('SELECT id FROM auth_users WHERE lower(email)=? LIMIT 1').bind(email).first();
  if (conflict) return json({ error:'EMAIL_ALREADY_USED', requestId },409);
  const employee = await employeeForLink(env,claims.organizationId,employeeId);
  if (role === 'manager') await projectForManager(env,claims.organizationId,projectId);

  const userId = `USR-${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(password);
  const statements = [
    env.DB.prepare(`
      INSERT INTO auth_users(id,email,password_hash,role,status,project_ids,client_ids,created_at)
      VALUES(?,?,?,?, 'active','[]','[]',CURRENT_TIMESTAMP)
    `).bind(userId,email,passwordHash,role),
    env.DB.prepare(`
      INSERT INTO core_organization_users(
        organization_id,user_id,role,status,created_at,updated_at
      ) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(claims.organizationId,userId,role,status),
  ];

  if (employee) {
    statements.push(env.DB.prepare(`
      UPDATE core_employees
      SET auth_user_id=?,email=?,updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=? AND id=?
    `).bind(userId,email,claims.organizationId,employee.id));
  }

  let projects = [];
  if (role === 'manager') projects = [{ project_id:projectId }];
  else projects = await activeEmployeeProjects(env,claims.organizationId,employee?.id);
  for (const project of projects) {
    statements.push(env.DB.prepare(`
      INSERT INTO core_project_memberships(
        organization_id,project_id,user_id,role,status,created_at,updated_at
      ) VALUES(?,?,?,?, 'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(organization_id,project_id,user_id) DO UPDATE SET
        role=excluded.role,status='active',updated_at=CURRENT_TIMESTAMP
    `).bind(claims.organizationId,project.project_id,userId,role === 'manager' ? 'manager' : role));
  }

  await env.DB.batch(statements);
  await writeAudit(env,requestId,claims,'create_account',userId,{ role,employeeId:employee?.id || null,projectId:projectId || null });
  return json({
    ok:true,
    account:{
      id:userId,organizationId:claims.organizationId,email,
      name:employee?.full_name || clean(body.name) || email,
      role,status,employeeId:employee?.id || null,projectId:role === 'manager' ? projectId : null,
      deviceBound:false,
    },
    requestId,
  },201);
}

async function updateAccount(env, claims, request, userId, requestId) {
  const target = await findTarget(env,claims.organizationId,userId);
  if (!target) return json({ error:'ACCOUNT_NOT_FOUND', requestId },404);
  if (!canManageTarget(claims.role,target.role,claims.sub,userId)) {
    return json({ error:'ACCOUNT_FORBIDDEN', requestId },403);
  }

  const body = await request.json().catch(() => ({}));
  const nextRole = lower(body.role || target.role);
  if (String(userId) !== String(claims.sub) && !permittedRole(claims.role,nextRole)) {
    return json({ error:'ACCOUNT_ROLE_FORBIDDEN', requestId },403);
  }
  if (String(userId) === String(claims.sub) && nextRole !== target.role) {
    return json({ error:'SELF_ROLE_CHANGE_FORBIDDEN', requestId },403);
  }
  const nextStatus = ['active','inactive','suspended'].includes(lower(body.status))
    ? lower(body.status) : target.status;
  if (String(userId) === String(claims.sub) && nextStatus !== 'active') {
    return json({ error:'SELF_DISABLE_FORBIDDEN', requestId },403);
  }
  const email = body.email == null ? target.email : validEmail(body.email);
  if (!email) return json({ error:'EMAIL_INVALID', requestId },400);
  const conflict = await env.DB.prepare(
    'SELECT id FROM auth_users WHERE lower(email)=? AND id<>? LIMIT 1',
  ).bind(email,userId).first();
  if (conflict) return json({ error:'EMAIL_ALREADY_USED', requestId },409);

  const employeeId = body.employeeId === undefined ? clean(target.employee_id,120) : clean(body.employeeId,120);
  const employee = await employeeForLink(env,claims.organizationId,employeeId,userId);
  const projectId = body.projectId === undefined ? clean(target.project_id,120) : clean(body.projectId,120);
  if (nextRole === 'manager') await projectForManager(env,claims.organizationId,projectId);

  const statements = [
    env.DB.prepare('UPDATE auth_users SET email=? WHERE id=?').bind(email,userId),
    env.DB.prepare(`
      UPDATE core_organization_users
      SET role=?,status=?,updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=? AND user_id=?
    `).bind(nextRole,nextStatus,claims.organizationId,userId),
    env.DB.prepare(`
      UPDATE core_project_memberships
      SET status='inactive',updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=? AND user_id=?
    `).bind(claims.organizationId,userId),
    env.DB.prepare(`
      UPDATE core_employees
      SET auth_user_id=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=? AND auth_user_id=? AND id<>?
    `).bind(claims.organizationId,userId,employee?.id || ''),
  ];

  if (body.password) {
    if (String(body.password).length < 8) return json({ error:'PASSWORD_TOO_SHORT', requestId },400);
    statements.push(
      env.DB.prepare('UPDATE auth_users SET password_hash=? WHERE id=?')
        .bind(await hashPassword(String(body.password)),userId),
    );
  }

  if (employee) {
    statements.push(env.DB.prepare(`
      UPDATE core_employees
      SET auth_user_id=?,email=?,
          full_name=CASE WHEN ?<>'' THEN ? ELSE full_name END,
          updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=? AND id=?
    `).bind(userId,email,clean(body.name),clean(body.name),claims.organizationId,employee.id));
  }

  let projects = [];
  if (nextRole === 'manager') projects = [{ project_id:projectId }];
  else projects = await activeEmployeeProjects(env,claims.organizationId,employee?.id);
  for (const project of projects) {
    statements.push(env.DB.prepare(`
      INSERT INTO core_project_memberships(
        organization_id,project_id,user_id,role,status,created_at,updated_at
      ) VALUES(?,?,?,?, 'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(organization_id,project_id,user_id) DO UPDATE SET
        role=excluded.role,status='active',updated_at=CURRENT_TIMESTAMP
    `).bind(claims.organizationId,project.project_id,userId,nextRole === 'manager' ? 'manager' : nextRole));
  }

  if (body.password || nextStatus !== target.status || nextRole !== target.role) {
    statements.push(env.DB.prepare(`
      UPDATE core_auth_sessions
      SET status='revoked',revoked_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND id<>? AND status='active'
    `).bind(userId,String(userId) === String(claims.sub) ? claims.sid : ''));
  }
  await env.DB.batch(statements);
  await writeAudit(env,requestId,claims,'update_account',userId,{ role:nextRole,status:nextStatus,employeeId:employee?.id || null });
  return json({
    ok:true,
    account:{
      id:userId,organizationId:claims.organizationId,email,
      name:employee?.full_name || clean(body.name) || email,
      role:nextRole,status:nextStatus,employeeId:employee?.id || null,
      projectId:nextRole === 'manager' ? projectId : null,
    },
    requestId,
  });
}

async function resetDevice(env, claims, userId, requestId) {
  const target = await findTarget(env,claims.organizationId,userId);
  if (!target) return json({ error:'ACCOUNT_NOT_FOUND', requestId },404);
  if (!canManageTarget(claims.role,target.role,claims.sub,userId) || target.role !== 'employee') {
    return json({ error:'DEVICE_RESET_FORBIDDEN', requestId },403);
  }
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE core_auth_devices
      SET status='reset_pending',reset_at=CURRENT_TIMESTAMP,reset_by=?,updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=? AND user_id=?
    `).bind(claims.sub,claims.organizationId,userId),
    env.DB.prepare(`
      UPDATE core_auth_sessions
      SET status='revoked',revoked_at=CURRENT_TIMESTAMP
      WHERE user_id=? AND status='active'
    `).bind(userId),
  ]);
  await writeAudit(env,requestId,claims,'reset_device',userId);
  return json({ ok:true, requestId });
}

export async function handleAccountAdminRoute(request, env, claims, url = new URL(request.url), requestId = crypto.randomUUID()) {
  if (!url.pathname.startsWith('/api/admin/accounts')) return null;
  if (!claims?.organizationId) return json({ error:'ORGANIZATION_REQUIRED', requestId },409);
  if (!ADMIN_ROLES.has(lower(claims.role))) return json({ error:'ACCOUNT_ADMIN_FORBIDDEN', requestId },403);

  if (url.pathname === '/api/admin/accounts' && request.method === 'GET') {
    return accountList(env,claims,requestId);
  }
  if (url.pathname === '/api/admin/accounts' && request.method === 'POST') {
    try { return await createAccount(env,claims,request,requestId); }
    catch (error) { return json({ error:String(error?.message || error), requestId },409); }
  }

  const resetMatch = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/reset-device$/);
  if (resetMatch && request.method === 'POST') {
    return resetDevice(env,claims,decodeURIComponent(resetMatch[1]),requestId);
  }

  const accountMatch = url.pathname.match(/^\/api\/admin\/accounts\/([^/]+)$/);
  if (accountMatch && request.method === 'PATCH') {
    try { return await updateAccount(env,claims,request,decodeURIComponent(accountMatch[1]),requestId); }
    catch (error) { return json({ error:String(error?.message || error), requestId },409); }
  }
  return null;
}

export const __test = { permittedRole, canManageTarget, validEmail };
