import {
  extractBearerToken,
  hashPassword,
  passwordNeedsUpgrade,
  resolveSessionSecret,
  signClaims,
  verifyPassword,
  verifyToken,
} from './index.js';

const encoder = new TextEncoder();
const loginBuckets = new Map();

const authJson = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    ...headers,
  },
});

const roleOf = value => String(value || '').trim().toLowerCase();
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const normalizeId = value => String(value || '').trim().slice(0, 120);
const nowSeconds = () => Math.floor(Date.now() / 1000);

function ttlSeconds(env) {
  const configured = Number(env.API_SESSION_TTL_SECONDS || 28800);
  if (!Number.isFinite(configured)) return 28800;
  return Math.min(43200, Math.max(900, Math.floor(configured)));
}

async function sha256Text(value) {
  if (!value) return null;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}

async function allRows(stmt) {
  const result = await stmt.all();
  return Array.isArray(result?.results) ? result.results : [];
}

async function findUserByEmail(env, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return env.DB.prepare(
    'SELECT id,email,display_name,password_hash,role,status,last_login_at FROM auth_users WHERE lower(email)=? LIMIT 1',
  ).bind(normalized).first();
}

async function findUserById(env, id) {
  return env.DB.prepare(
    'SELECT id,email,display_name,password_hash,role,status,last_login_at FROM auth_users WHERE id=? LIMIT 1',
  ).bind(id).first();
}

async function activeOrganizationsForUser(env, userId) {
  return allRows(env.DB.prepare(`
    SELECT ou.organization_id AS id, o.code, o.name, ou.role
    FROM core_organization_users ou
    JOIN core_organizations o ON o.id=ou.organization_id
    WHERE ou.user_id=?
      AND ou.status='active'
      AND o.status='active'
    ORDER BY o.name, o.id
  `).bind(userId));
}

async function activeOrganization(env, organizationId) {
  if (!organizationId) return null;
  return env.DB.prepare(
    "SELECT id,code,name,status FROM core_organizations WHERE id=? AND status='active' LIMIT 1",
  ).bind(organizationId).first();
}

async function firstActiveOrganization(env) {
  return env.DB.prepare(
    "SELECT id,code,name,status FROM core_organizations WHERE status='active' ORDER BY name,id LIMIT 1",
  ).first();
}

async function organizationMembership(env, userId, organizationId) {
  return env.DB.prepare(`
    SELECT ou.organization_id, ou.role, ou.status, o.code, o.name
    FROM core_organization_users ou
    JOIN core_organizations o ON o.id=ou.organization_id
    WHERE ou.user_id=?
      AND ou.organization_id=?
      AND ou.status='active'
      AND o.status='active'
    LIMIT 1
  `).bind(userId, organizationId).first();
}

async function profileSnapshot(env, userId, organizationId = '') {
  const row = await env.DB.prepare(`
    SELECT u.id,u.email,u.display_name,
           e.id AS employee_id,e.full_name,e.phone,e.metadata_json
    FROM auth_users u
    LEFT JOIN core_employees e
      ON e.auth_user_id=u.id AND e.organization_id=?
    WHERE u.id=?
    LIMIT 1
  `).bind(organizationId || '',userId).first();
  if (!row) return null;
  let employeeMeta = {};
  try { employeeMeta = JSON.parse(row.metadata_json || '{}') || {}; } catch { employeeMeta = {}; }
  return {
    id:row.id,
    email:row.email,
    name:String(row.display_name || row.full_name || row.email || '').trim(),
    employeeId:row.employee_id || null,
    phone:row.phone || '',
    area:String(employeeMeta.area || ''),
  };
}

async function deviceSnapshot(env, userId, organizationId = '') {
  if (!organizationId) return { deviceBound:false, deviceLabel:'', devicePairedAt:null, deviceLastSeenAt:null };
  const row = await env.DB.prepare(`
    SELECT status,device_label,paired_at,last_seen_at
    FROM core_auth_devices
    WHERE organization_id=? AND user_id=?
    LIMIT 1
  `).bind(organizationId,userId).first();
  return {
    deviceBound:row?.status === 'active',
    deviceLabel:row?.device_label || '',
    devicePairedAt:row?.paired_at || null,
    deviceLastSeenAt:row?.last_seen_at || null,
  };
}

async function projectScope(env, userId, organizationId, role) {
  if (!organizationId) return { projectIds: [], clientIds: [] };
  const broad = ['superadmin', 'head', 'admin'].includes(role);
  const projects = broad
    ? await allRows(env.DB.prepare(`
        SELECT id,client_id FROM core_projects
        WHERE organization_id=? AND status='active'
        ORDER BY id
      `).bind(organizationId))
    : await allRows(env.DB.prepare(`
        SELECT p.id,p.client_id
        FROM core_project_memberships pm
        JOIN core_projects p
          ON p.id=pm.project_id AND p.organization_id=pm.organization_id
        WHERE pm.organization_id=?
          AND pm.user_id=?
          AND pm.status='active'
          AND p.status='active'
        ORDER BY p.id
      `).bind(organizationId, userId));

  const projectIds = [...new Set(projects.map(row => String(row.id)).filter(Boolean))];
  let clientIds;
  if (broad) {
    const clients = await allRows(env.DB.prepare(`
      SELECT id FROM core_clients
      WHERE organization_id=? AND status='active'
      ORDER BY id
    `).bind(organizationId));
    clientIds = [...new Set(clients.map(row => String(row.id)).filter(Boolean))];
  } else {
    clientIds = [...new Set(projects.map(row => String(row.client_id || '')).filter(Boolean))];
  }
  return { projectIds, clientIds };
}

export async function resolveAuthorizationForUser(env, user, organizationId = '') {
  if (!user?.id || user.status !== 'active') throw new Error('USER_ACCESS_DISABLED');
  const globalRole = roleOf(user.role);
  const orgId = normalizeId(organizationId);

  if (globalRole === 'superadmin') {
    if (!orgId) {
      return {
        organizationId: null,
        organization: null,
        role: 'superadmin',
        projectIds: [],
        clientIds: [],
      };
    }
    const org = await activeOrganization(env, orgId);
    if (!org) throw new Error('ORGANIZATION_ACCESS_DENIED');
    const scope = await projectScope(env, user.id, orgId, 'superadmin');
    return {
      organizationId: orgId,
      organization: { id: org.id, code: org.code, name: org.name },
      role: 'superadmin',
      ...scope,
    };
  }

  if (!orgId) throw new Error('ORGANIZATION_REQUIRED');
  const membership = await organizationMembership(env, user.id, orgId);
  if (!membership) throw new Error('ORGANIZATION_ACCESS_DENIED');
  const role = roleOf(membership.role);
  if (!['head', 'manager', 'supervisor', 'employee', 'admin'].includes(role)) {
    throw new Error('ORGANIZATION_ACCESS_DENIED');
  }
  const scope = await projectScope(env, user.id, orgId, role);
  return {
    organizationId: orgId,
    organization: { id: orgId, code: membership.code, name: membership.name },
    role,
    ...scope,
  };
}

async function createSession(env, request, user, authorization, now = nowSeconds()) {
  const sid = crypto.randomUUID();
  const ttl = ttlSeconds(env);
  const exp = now + ttl;
  const expiresAt = new Date(exp * 1000).toISOString();
  const ipHash = await sha256Text(request.headers.get('cf-connecting-ip') || '');
  const userAgentHash = await sha256Text(request.headers.get('user-agent') || '');

  await env.DB.prepare(`
    INSERT INTO core_auth_sessions(
      id,user_id,organization_id,role_at_issue,status,issued_at,expires_at,
      created_ip_hash,user_agent_hash
    ) VALUES(?,?,?,?, 'active', CURRENT_TIMESTAMP, ?, ?, ?)
  `).bind(
    sid,
    user.id,
    authorization.organizationId || null,
    authorization.role,
    expiresAt,
    ipHash,
    userAgentHash,
  ).run();

  const claims = {
    sub: String(user.id).slice(0, 80),
    sid,
    role: authorization.role,
    email: String(user.email || '').slice(0, 180),
    organizationId: authorization.organizationId || null,
    projectIds: authorization.projectIds,
    clientIds: authorization.clientIds,
    scope: 'api',
    authz: 'server',
    nbf: now,
    exp,
  };
  const token = await signClaims(claims, resolveSessionSecret(env));
  return { token, claims, expiresAt };
}

async function writeAuthAudit(env, {
  requestId,
  actor,
  action,
  outcome = 'success',
  detail = '',
}) {
  try {
    await env.DB.prepare(`
      INSERT INTO security_audit_logs(
        request_id,actor_id,actor_role,action,resource_type,outcome,detail,created_at
      ) VALUES(?,?,?,?, 'session', ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      requestId,
      actor?.sub || actor?.id || null,
      actor?.role || null,
      action,
      outcome,
      String(detail || '').slice(0, 500),
    ).run();
  } catch (error) {
    console.warn('auth_audit_write_failed', error?.message || error);
  }
}

async function enforceFieldDevice(env, authorization, user, body = {}) {
  if (roleOf(authorization?.role) !== 'employee') return null;
  const organizationId = normalizeId(authorization?.organizationId);
  const deviceId = normalizeId(body.deviceId);
  const deviceProof = String(body.deviceProof || '').trim().slice(0, 256);
  const deviceLabel = String(body.deviceLabel || '').trim().slice(0, 160);
  if (!organizationId || !deviceId || !deviceProof) throw new Error('DEVICE_REQUIRED');

  const deviceIdHash = await sha256Text(deviceId);
  const deviceProofHash = await sha256Text(deviceProof);
  const current = await env.DB.prepare(`
    SELECT device_id_hash,device_proof_hash,status
    FROM core_auth_devices
    WHERE organization_id=? AND user_id=?
    LIMIT 1
  `).bind(organizationId, user.id).first();

  if (!current || current.status === 'reset_pending') {
    await env.DB.prepare(`
      INSERT INTO core_auth_devices(
        organization_id,user_id,device_id_hash,device_proof_hash,device_label,status,
        paired_at,last_seen_at,reset_at,reset_by,updated_at
      ) VALUES(?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL,NULL,CURRENT_TIMESTAMP)
      ON CONFLICT(organization_id,user_id) DO UPDATE SET
        device_id_hash=excluded.device_id_hash,
        device_proof_hash=excluded.device_proof_hash,
        device_label=excluded.device_label,
        status='active',
        paired_at=CURRENT_TIMESTAMP,
        last_seen_at=CURRENT_TIMESTAMP,
        reset_at=NULL,
        reset_by=NULL,
        updated_at=CURRENT_TIMESTAMP
    `).bind(organizationId,user.id,deviceIdHash,deviceProofHash,deviceLabel || null).run();
    return { paired: true };
  }

  if (current.device_id_hash !== deviceIdHash || current.device_proof_hash !== deviceProofHash) {
    throw new Error('DEVICE_ACCESS_DENIED');
  }

  await env.DB.prepare(`
    UPDATE core_auth_devices
    SET last_seen_at=CURRENT_TIMESTAMP,
        device_label=COALESCE(?,device_label),
        updated_at=CURRENT_TIMESTAMP
    WHERE organization_id=? AND user_id=? AND status='active'
  `).bind(deviceLabel || null,organizationId,user.id).run();
  return { paired: false };
}

function loginRateAllowed(request, env) {
  const max = Math.max(1, Number(env.API_LOGIN_RATE_LIMIT_PER_MINUTE || 10));
  const key = `${request.headers.get('cf-connecting-ip') || 'anonymous'}:${Math.floor(Date.now() / 60000)}`;
  const count = (loginBuckets.get(key) || 0) + 1;
  loginBuckets.set(key, count);
  if (loginBuckets.size > 2000) {
    const current = Math.floor(Date.now() / 60000);
    for (const candidate of loginBuckets.keys()) {
      if (!candidate.endsWith(`:${current}`)) loginBuckets.delete(candidate);
    }
  }
  return count <= max;
}

export function __resetAuthGatewayForTests() {
  loginBuckets.clear();
}

export async function loginAuthoritatively(request, env, requestId = crypto.randomUUID()) {
  try {
    resolveSessionSecret(env);
  } catch {
    return authJson({ error: 'SESSION_UNAVAILABLE', requestId }, 503);
  }
  if (!loginRateAllowed(request, env)) {
    return authJson({ error: 'RATE_LIMITED', requestId }, 429, { 'retry-after': '60' });
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const requestedOrganizationId = normalizeId(body.organizationId);
  if (!email || !password) {
    return authJson({ error: 'INVALID_CREDENTIALS', requestId }, 400);
  }

  let user;
  try {
    user = await findUserByEmail(env, email);
  } catch (error) {
    await writeAuthAudit(env, { requestId, action: 'login', outcome: 'denied', detail: 'USER_LOOKUP_FAILED' });
    return authJson({ error: 'SESSION_UNAVAILABLE', requestId }, 503);
  }

  let validPassword = false;
  try {
    validPassword = !!(user
      && user.status === 'active'
      && await verifyPassword(user.password_hash, password));
  } catch (error) {
    console.warn('password_verify_failed', error?.message || error);
  }
  if (!validPassword) {
    await writeAuthAudit(env, { requestId, action: 'login', outcome: 'denied', detail: 'INVALID_CREDENTIALS' });
    return authJson({ error: 'INVALID_CREDENTIALS', requestId }, 401);
  }

  // Superadmin authority is global and never depends on organization membership.
  // To keep production sessions compatible with every deployed schema/runtime,
  // a successful superadmin login is attached to an active organization instead
  // of creating an organization-less session. The superadmin role remains global
  // and may switch to any other active organization explicitly.
  const globalRole = roleOf(user.role);
  let organizationId = requestedOrganizationId;
  if (globalRole === 'superadmin') {
    const requested = organizationId ? await activeOrganization(env, organizationId) : null;
    const selected = requested || await firstActiveOrganization(env);
    if (!selected) {
      await writeAuthAudit(env, {
        requestId,
        actor: user,
        action: 'login',
        outcome: 'denied',
        detail: 'ORGANIZATION_ACCESS_NOT_CONFIGURED',
      });
      return authJson({ error: 'ORGANIZATION_ACCESS_NOT_CONFIGURED', requestId }, 403);
    }
    organizationId = String(selected.id);
  } else {
    const memberships = await activeOrganizationsForUser(env, user.id);
    if (!memberships.length) {
      await writeAuthAudit(env, { requestId, actor: user, action: 'login', outcome: 'denied', detail: 'ORGANIZATION_ACCESS_NOT_CONFIGURED' });
      return authJson({ error: 'ORGANIZATION_ACCESS_NOT_CONFIGURED', requestId }, 403);
    }
    if (!organizationId && memberships.length > 1) {
      return authJson({
        error: 'ORGANIZATION_REQUIRED',
        organizations: memberships.map(row => ({ id: row.id, code: row.code, name: row.name, role: row.role })),
        requestId,
      }, 409);
    }
    if (!organizationId) organizationId = String(memberships[0].id);
    if (!memberships.some(row => String(row.id) === organizationId)) {
      await writeAuthAudit(env, { requestId, actor: user, action: 'login', outcome: 'denied', detail: 'ORGANIZATION_ACCESS_DENIED' });
      return authJson({ error: 'ORGANIZATION_ACCESS_DENIED', requestId }, 403);
    }
  }

  let authorization;
  try {
    authorization = await resolveAuthorizationForUser(env, user, organizationId);
  } catch (error) {
    await writeAuthAudit(env, { requestId, actor: user, action: 'login', outcome: 'denied', detail: error?.message });
    return authErrorResponse(error, requestId);
  }

  try {
    await enforceFieldDevice(env, authorization, user, body);
  } catch (error) {
    await writeAuthAudit(env, { requestId, actor: user, action: 'login', outcome: 'denied', detail: error?.message });
    return authErrorResponse(error, requestId);
  }

  if (passwordNeedsUpgrade(user.password_hash)) {
    try {
      const upgraded = await hashPassword(password);
      await env.DB.prepare('UPDATE auth_users SET password_hash=? WHERE id=?').bind(upgraded, user.id).run();
    } catch (error) {
      console.warn('password_hash_upgrade_failed', error?.message || error);
    }
  }

  const { token, claims } = await createSession(env, request, user, authorization);
  try {
    await env.DB.prepare('UPDATE auth_users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').bind(user.id).run();
  } catch (error) {
    console.warn('auth_user_touch_failed', error?.message || error);
  }
  await writeAuthAudit(env, { requestId, actor: claims, action: 'login' });
  const [profile, device] = await Promise.all([
    profileSnapshot(env,claims.sub,claims.organizationId || ''),
    deviceSnapshot(env,claims.sub,claims.organizationId || ''),
  ]);

  return authJson({
    ok: true,
    token,
    exp: claims.exp,
    account: {
      id: claims.sub,
      email: profile?.email || claims.email,
      name: profile?.name || claims.email,
      employeeId: profile?.employeeId || null,
      phone: profile?.phone || '',
      area: profile?.area || '',
      role: claims.role,
      organizationId: claims.organizationId,
      organization: authorization.organization,
      projectIds: claims.projectIds,
      clientIds: claims.clientIds,
      ...device,
    },
    requestId,
  });
}

export async function authenticateAuthoritatively(request, env) {
  const secret = resolveSessionSecret(env);
  const token = extractBearerToken(request);
  const signed = await verifyToken(token, secret);
  if (!signed.sid || signed.authz !== 'server') throw new Error('SESSION_REAUTH_REQUIRED');

  const session = await env.DB.prepare(`
    SELECT id,user_id,organization_id,role_at_issue,status,expires_at
    FROM core_auth_sessions
    WHERE id=? AND user_id=?
    LIMIT 1
  `).bind(signed.sid, signed.sub).first();
  if (!session) throw new Error('SESSION_REVOKED');
  if (session.status !== 'active') throw new Error('SESSION_REVOKED');
  if (Date.parse(session.expires_at) <= Date.now()) throw new Error('SESSION_EXPIRED');

  const signedOrg = signed.organizationId || null;
  const sessionOrg = session.organization_id || null;
  if (signedOrg !== sessionOrg) throw new Error('INVALID_TOKEN');

  const user = await findUserById(env, signed.sub);
  if (!user || user.status !== 'active') throw new Error('USER_ACCESS_DISABLED');
  if (!sessionOrg && roleOf(user.role) !== 'superadmin') throw new Error('SESSION_REAUTH_REQUIRED');

  const authorization = await resolveAuthorizationForUser(env, user, sessionOrg || '');
  try {
    await env.DB.prepare('UPDATE core_auth_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?').bind(session.id).run();
  } catch (error) {
    console.warn('session_touch_failed', error?.message || error);
  }

  return {
    sub: user.id,
    sid: session.id,
    email: user.email,
    role: authorization.role,
    organizationId: authorization.organizationId,
    organization: authorization.organization,
    projectIds: authorization.projectIds,
    clientIds: authorization.clientIds,
    exp: signed.exp,
    scope: 'api',
    authz: 'server',
  };
}

export async function revokeSession(env, sessionId) {
  await env.DB.prepare(`
    UPDATE core_auth_sessions
    SET status='revoked', revoked_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='active'
  `).bind(sessionId).run();
}

export async function revokeAllSessions(env, userId) {
  await env.DB.prepare(`
    UPDATE core_auth_sessions
    SET status='revoked', revoked_at=CURRENT_TIMESTAMP
    WHERE user_id=? AND status='active'
  `).bind(userId).run();
}

export function authErrorResponse(error, requestId = crypto.randomUUID()) {
  const code = String(error?.message || error || 'AUTH_REQUIRED');
  const status = code === 'SESSION_UNAVAILABLE' ? 503
    : code === 'ORGANIZATION_REQUIRED' ? 409
      : ['ORGANIZATION_ACCESS_DENIED', 'ORGANIZATION_ACCESS_NOT_CONFIGURED', 'USER_ACCESS_DISABLED',
          'DEVICE_REQUIRED', 'DEVICE_ACCESS_DENIED'].includes(code) ? 403
        : 401;
  return authJson({ error: code, requestId }, status, status === 401 ? { 'www-authenticate': 'Bearer' } : {});
}

export async function handleAuthRoute(request, env, url = new URL(request.url), requestId = crypto.randomUUID()) {
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    return loginAuthoritatively(request, env, requestId);
  }

  if (url.pathname === '/api/auth/session' && request.method === 'POST') {
    return authJson({
      error: 'SESSION_MINTING_DISABLED',
      message: 'Client-supplied claims are not accepted. Authenticate with POST /api/auth/login.',
      requestId,
    }, 410);
  }

  if (url.pathname === '/api/auth/session' && request.method === 'GET') {
    try {
      const claims = await authenticateAuthoritatively(request, env);
      const [profile, device] = await Promise.all([
        profileSnapshot(env,claims.sub,claims.organizationId || ''),
        deviceSnapshot(env,claims.sub,claims.organizationId || ''),
      ]);
      return authJson({
        ok:true,
        ...claims,
        email:profile?.email || claims.email,
        name:profile?.name || claims.email,
        employeeId:profile?.employeeId || null,
        phone:profile?.phone || '',
        area:profile?.area || '',
        ...device,
        requestId,
      });
    } catch (error) {
      return authErrorResponse(error, requestId);
    }
  }

  if (url.pathname === '/api/auth/change-password' && request.method === 'POST') {
    try {
      const claims = await authenticateAuthoritatively(request, env);
      const body = await request.json().catch(() => ({}));
      const currentPassword = String(body.currentPassword || '');
      const nextPassword = String(body.nextPassword || '');
      if (nextPassword.length < 8) return authJson({ error: 'PASSWORD_TOO_SHORT', requestId }, 400);

      const user = await findUserById(env, claims.sub);
      if (!user || !await verifyPassword(user.password_hash, currentPassword)) {
        return authJson({ error: 'INVALID_CURRENT_PASSWORD', requestId }, 403);
      }
      if (await verifyPassword(user.password_hash, nextPassword)) {
        return authJson({ error: 'PASSWORD_UNCHANGED', requestId }, 409);
      }

      const passwordHash = await hashPassword(nextPassword);
      await env.DB.batch([
        env.DB.prepare('UPDATE auth_users SET password_hash=? WHERE id=?').bind(passwordHash, claims.sub),
        env.DB.prepare(`
          UPDATE core_auth_sessions
          SET status='revoked', revoked_at=CURRENT_TIMESTAMP
          WHERE user_id=? AND id<>? AND status='active'
        `).bind(claims.sub, claims.sid),
      ]);
      await writeAuthAudit(env, { requestId, actor: claims, action: 'change_password' });
      return authJson({ ok: true, requestId });
    } catch (error) {
      return authErrorResponse(error, requestId);
    }
  }

  if (url.pathname === '/api/auth/profile' && request.method === 'PATCH') {
    try {
      const claims = await authenticateAuthoritatively(request, env);
      const body = await request.json().catch(() => ({}));
      const email = normalizeEmail(body.email || claims.email);
      const fullName = String(body.name || '').trim().slice(0, 180);
      const phone = String(body.phone || '').trim().slice(0, 64);
      const area = String(body.area || '').trim().slice(0, 120);
      if (!fullName) return authJson({ error:'PROFILE_NAME_REQUIRED', requestId },400);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return authJson({ error: 'EMAIL_INVALID', requestId }, 400);
      }
      const conflict = await env.DB.prepare(
        'SELECT id FROM auth_users WHERE lower(email)=? AND id<>? LIMIT 1',
      ).bind(email, claims.sub).first();
      if (conflict) return authJson({ error: 'EMAIL_ALREADY_USED', requestId }, 409);

      const statements = [
        env.DB.prepare('UPDATE auth_users SET email=?,display_name=? WHERE id=?').bind(email,fullName,claims.sub),
      ];
      if (claims.organizationId) {
        const employee = await env.DB.prepare(
          'SELECT id,metadata_json FROM core_employees WHERE organization_id=? AND auth_user_id=? LIMIT 1',
        ).bind(claims.organizationId,claims.sub).first();
        if (employee) {
          let metadata = {};
          try { metadata = JSON.parse(employee.metadata_json || '{}') || {}; } catch { metadata = {}; }
          metadata.area = area;
          statements.push(env.DB.prepare(`
            UPDATE core_employees
            SET email=?,full_name=?,phone=?,metadata_json=?,updated_at=CURRENT_TIMESTAMP
            WHERE organization_id=? AND id=?
          `).bind(email,fullName,phone,JSON.stringify(metadata),claims.organizationId,employee.id));
        }
      }
      await env.DB.batch(statements);
      const [profile, device] = await Promise.all([
        profileSnapshot(env,claims.sub,claims.organizationId || ''),
        deviceSnapshot(env,claims.sub,claims.organizationId || ''),
      ]);
      await writeAuthAudit(env, { requestId, actor: claims, action: 'update_profile' });
      return authJson({
        ok: true,
        account: { ...profile, role:claims.role, organizationId:claims.organizationId, ...device },
        requestId,
      });
    } catch (error) {
      return authErrorResponse(error, requestId);
    }
  }

  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    try {
      const claims = await authenticateAuthoritatively(request, env);
      await revokeSession(env, claims.sid);
      await writeAuthAudit(env, { requestId, actor: claims, action: 'logout' });
      return authJson({ ok: true, requestId });
    } catch (error) {
      return authErrorResponse(error, requestId);
    }
  }

  if (url.pathname === '/api/auth/logout-all' && request.method === 'POST') {
    try {
      const claims = await authenticateAuthoritatively(request, env);
      await revokeAllSessions(env, claims.sub);
      await writeAuthAudit(env, { requestId, actor: claims, action: 'logout_all' });
      return authJson({ ok: true, requestId });
    } catch (error) {
      return authErrorResponse(error, requestId);
    }
  }

  if (url.pathname === '/api/auth/switch-organization' && request.method === 'POST') {
    try {
      const current = await authenticateAuthoritatively(request, env);
      const body = await request.json().catch(() => ({}));
      const targetOrganizationId = normalizeId(body.organizationId);
      if (!targetOrganizationId) throw new Error('ORGANIZATION_REQUIRED');
      const user = await findUserById(env, current.sub);
      const authorization = await resolveAuthorizationForUser(env, user, targetOrganizationId);
      const next = await createSession(env, request, user, authorization);
      await revokeSession(env, current.sid);
      const [profile, device] = await Promise.all([
        profileSnapshot(env,next.claims.sub,next.claims.organizationId || ''),
        deviceSnapshot(env,next.claims.sub,next.claims.organizationId || ''),
      ]);
      await writeAuthAudit(env, { requestId, actor: next.claims, action: 'switch_organization' });
      return authJson({
        ok: true,
        token: next.token,
        exp: next.claims.exp,
        account: {
          id: next.claims.sub,
          email: profile?.email || next.claims.email,
          name: profile?.name || next.claims.email,
          employeeId: profile?.employeeId || null,
          phone: profile?.phone || '',
          area: profile?.area || '',
          role: next.claims.role,
          organizationId: next.claims.organizationId,
          organization: authorization.organization,
          projectIds: next.claims.projectIds,
          clientIds: next.claims.clientIds,
          ...device,
        },
        requestId,
      });
    } catch (error) {
      return authErrorResponse(error, requestId);
    }
  }

  return null;
}
