import test from 'node:test';
import assert from 'node:assert/strict';
import secureWorker from '../worker/main.js';
import { hashPassword, signClaims, verifyToken } from '../worker/index.js';
import {
  __resetAuthGatewayForTests,
  authenticateAuthoritatively,
  loginAuthoritatively,
  revokeSession,
} from '../worker/authz.js';

const secret = 'm2-test-secret-at-least-32-characters-long';

function request(path, { method = 'GET', body, headers = {} } = {}) {
  return new Request(`https://proqtrack.test${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createEnv(seed = {}) {
  const state = {
    users: seed.users || [],
    orgs: seed.orgs || [],
    orgUsers: seed.orgUsers || [],
    projects: seed.projects || [],
    projectMembers: seed.projectMembers || [],
    clients: seed.clients || [],
    sessions: new Map(),
    audit: [],
  };

  const DB = {
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      const stmt = {
        args: [],
        bind(...args) { this.args = args; return this; },
        async first() {
          if (/SELECT 1 AS ok/i.test(normalized)) return { ok: 1 };
          if (/FROM auth_users WHERE lower\(email\)=\?/i.test(normalized)) {
            const email = String(this.args[0] || '').toLowerCase();
            return state.users.find(row => row.email.toLowerCase() === email) || null;
          }
          if (/FROM auth_users WHERE id=\?/i.test(normalized)) {
            return state.users.find(row => row.id === this.args[0]) || null;
          }
          if (/FROM core_organizations WHERE id=\?/i.test(normalized)) {
            return state.orgs.find(row => row.id === this.args[0] && row.status === 'active') || null;
          }
          if (/FROM core_organization_users ou JOIN core_organizations o/i.test(normalized) && /LIMIT 1/i.test(normalized)) {
            const [userId, orgId] = this.args;
            const membership = state.orgUsers.find(row => row.user_id === userId && row.organization_id === orgId && row.status === 'active');
            const org = state.orgs.find(row => row.id === orgId && row.status === 'active');
            return membership && org
              ? { organization_id: orgId, role: membership.role, status: membership.status, code: org.code, name: org.name }
              : null;
          }
          if (/FROM core_auth_sessions/i.test(normalized)) {
            const [sessionId, userId] = this.args;
            const row = state.sessions.get(sessionId);
            return row && row.user_id === userId ? { ...row } : null;
          }
          if (/SUM\(size_bytes\)/i.test(normalized)) return { bytes: 0, files: 0 };
          return null;
        },
        async all() {
          if (/FROM core_organization_users ou JOIN core_organizations o/i.test(normalized)) {
            const [userId] = this.args;
            return {
              results: state.orgUsers
                .filter(row => row.user_id === userId && row.status === 'active')
                .map(row => {
                  const org = state.orgs.find(candidate => candidate.id === row.organization_id && candidate.status === 'active');
                  return org ? { id: org.id, code: org.code, name: org.name, role: row.role } : null;
                })
                .filter(Boolean),
            };
          }
          if (/FROM core_project_memberships pm JOIN core_projects p/i.test(normalized)) {
            const [orgId, userId] = this.args;
            const allowed = new Set(state.projectMembers
              .filter(row => row.organization_id === orgId && row.user_id === userId && row.status === 'active')
              .map(row => row.project_id));
            return {
              results: state.projects
                .filter(row => row.organization_id === orgId && row.status === 'active' && allowed.has(row.id))
                .map(row => ({ id: row.id, client_id: row.client_id })),
            };
          }
          if (/SELECT id,client_id FROM core_projects/i.test(normalized)) {
            const [orgId] = this.args;
            return {
              results: state.projects
                .filter(row => row.organization_id === orgId && row.status === 'active')
                .map(row => ({ id: row.id, client_id: row.client_id })),
            };
          }
          if (/SELECT id FROM core_clients/i.test(normalized)) {
            const [orgId] = this.args;
            return {
              results: state.clients
                .filter(row => row.organization_id === orgId && row.status === 'active')
                .map(row => ({ id: row.id })),
            };
          }
          return { results: [] };
        },
        async run() {
          if (/INSERT INTO core_auth_sessions/i.test(normalized)) {
            const [id, userId, organizationId, role, expiresAt, ipHash, userAgentHash] = this.args;
            state.sessions.set(id, {
              id,
              user_id: userId,
              organization_id: organizationId,
              role_at_issue: role,
              status: 'active',
              expires_at: expiresAt,
              created_ip_hash: ipHash,
              user_agent_hash: userAgentHash,
            });
            return { success: true };
          }
          if (/UPDATE core_auth_sessions SET last_seen_at/i.test(normalized)) return { success: true };
          if (/UPDATE core_auth_sessions SET status='revoked'.*WHERE id=\?/i.test(normalized)) {
            const [id] = this.args;
            const row = state.sessions.get(id);
            if (row && row.status === 'active') row.status = 'revoked';
            return { success: true };
          }
          if (/UPDATE core_auth_sessions SET status='revoked'.*WHERE user_id=\?/i.test(normalized)) {
            const [userId] = this.args;
            for (const row of state.sessions.values()) if (row.user_id === userId && row.status === 'active') row.status = 'revoked';
            return { success: true };
          }
          if (/UPDATE auth_users SET password_hash=\?/i.test(normalized)) {
            const [passwordHash, userId] = this.args;
            const user = state.users.find(row => row.id === userId);
            if (user) user.password_hash = passwordHash;
            return { success: true };
          }
          if (/UPDATE auth_users SET last_login_at/i.test(normalized)) return { success: true };
          if (/INSERT INTO security_audit_logs/i.test(normalized)) {
            state.audit.push([...this.args]);
            return { success: true };
          }
          return { success: true };
        },
      };
      return stmt;
    },
  };

  return {
    state,
    env: {
      ENVIRONMENT: 'mvp',
      API_AUTH_SECRET: secret,
      API_SESSION_TTL_SECONDS: '28800',
      API_RATE_LIMIT_PER_MINUTE: '120',
      API_LOGIN_RATE_LIMIT_PER_MINUTE: '10',
      MVP_DATA_API_ENABLED: 'false',
      MVP_FILE_API_ENABLED: 'false',
      MVP_MAX_FILE_BYTES: '2097152',
      MVP_MAX_STORAGE_BYTES: '524288000',
      ALLOWED_UPLOAD_TYPES: 'image/jpeg,application/pdf',
      DB,
      FILES: { async get() { return null; }, async put() {} },
      ASSETS: { async fetch() { return new Response('asset'); } },
    },
  };
}

async function fixture(overrides = {}) {
  const passwordHash = await hashPassword('correct-horse-battery');
  return createEnv({
    users: [{ id: 'ACC-1', email: 'user@proqtrack.id', password_hash: passwordHash, role: 'manager', status: 'active' }],
    orgs: [
      { id: 'ORG-A', code: 'A', name: 'Org A', status: 'active' },
      { id: 'ORG-B', code: 'B', name: 'Org B', status: 'active' },
    ],
    orgUsers: [{ organization_id: 'ORG-A', user_id: 'ACC-1', role: 'employee', status: 'active' }],
    clients: [
      { id: 'CLI-A', organization_id: 'ORG-A', status: 'active' },
      { id: 'CLI-B', organization_id: 'ORG-B', status: 'active' },
    ],
    projects: [
      { id: 'PRJ-A', organization_id: 'ORG-A', client_id: 'CLI-A', status: 'active' },
      { id: 'PRJ-A2', organization_id: 'ORG-A', client_id: 'CLI-A', status: 'active' },
      { id: 'PRJ-B', organization_id: 'ORG-B', client_id: 'CLI-B', status: 'active' },
    ],
    projectMembers: [{ organization_id: 'ORG-A', project_id: 'PRJ-A', user_id: 'ACC-1', status: 'active' }],
    ...overrides,
  });
}

async function login(env, body = {}) {
  __resetAuthGatewayForTests();
  return loginAuthoritatively(request('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'user@proqtrack.id',
      password: 'correct-horse-battery',
      deviceId: 'DEV-AUTHZ-TEST',
      deviceProof: 'proof-authz-test-stable',
      deviceLabel: 'Node test device',
      ...body,
    },
  }), env, 'REQ-LOGIN');
}

test('tenant membership role and normalized project scope override legacy auth claims', async () => {
  const { env } = await fixture();
  const response = await login(env, { role: 'superadmin', organizationId: 'ORG-A' });
  assert.equal(response.status, 200);
  const payload = await response.json();
  const claims = await verifyToken(payload.token, secret);
  assert.equal(claims.sub, 'ACC-1');
  assert.equal(claims.organizationId, 'ORG-A');
  assert.equal(claims.role, 'employee');
  assert.deepEqual(claims.projectIds, ['PRJ-A']);
  assert.deepEqual(claims.clientIds, ['CLI-A']);
  assert.ok(claims.sid);
  assert.equal(claims.authz, 'server');
});

test('cross-tenant organization selection is denied even with valid credentials', async () => {
  const { env } = await fixture();
  const response = await login(env, { organizationId: 'ORG-B' });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'ORGANIZATION_ACCESS_DENIED');
});

test('multi-organization user must explicitly choose an organization', async () => {
  const base = await fixture();
  base.state.orgUsers.push({ organization_id: 'ORG-B', user_id: 'ACC-1', role: 'manager', status: 'active' });
  const response = await login(base.env);
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.error, 'ORGANIZATION_REQUIRED');
  assert.deepEqual(payload.organizations.map(row => row.id).sort(), ['ORG-A', 'ORG-B']);
});

test('revoked session is rejected immediately', async () => {
  const { env } = await fixture();
  const response = await login(env, { organizationId: 'ORG-A' });
  const payload = await response.json();
  const req = request('/api/auth/session', { headers: { authorization: `Bearer ${payload.token}` } });
  const first = await authenticateAuthoritatively(req, env);
  await revokeSession(env, first.sid);
  await assert.rejects(() => authenticateAuthoritatively(req, env), /SESSION_REVOKED/);
});

test('role and project access changes take effect on the next request', async () => {
  const { env, state } = await fixture();
  const response = await login(env, { organizationId: 'ORG-A' });
  const payload = await response.json();
  const req = request('/api/auth/session', { headers: { authorization: `Bearer ${payload.token}` } });
  const before = await authenticateAuthoritatively(req, env);
  assert.equal(before.role, 'employee');
  assert.deepEqual(before.projectIds, ['PRJ-A']);

  state.orgUsers[0].role = 'manager';
  state.projectMembers.splice(0, 1, { organization_id: 'ORG-A', project_id: 'PRJ-A2', user_id: 'ACC-1', status: 'active' });
  const after = await authenticateAuthoritatively(req, env);
  assert.equal(after.role, 'manager');
  assert.deepEqual(after.projectIds, ['PRJ-A2']);
});

test('disabling a user invalidates an already-issued session', async () => {
  const { env, state } = await fixture();
  const response = await login(env, { organizationId: 'ORG-A' });
  const payload = await response.json();
  state.users[0].status = 'suspended';
  await assert.rejects(
    () => authenticateAuthoritatively(request('/api/auth/session', { headers: { authorization: `Bearer ${payload.token}` } }), env),
    /USER_ACCESS_DISABLED/,
  );
});

test('legacy signed token without a server session id is forced to re-authenticate', async () => {
  const { env } = await fixture();
  const token = await signClaims({
    sub: 'ACC-1', role: 'manager', projectIds: ['PRJ-B'], authz: 'legacy', exp: 2_000_000_000,
  }, secret);
  await assert.rejects(
    () => authenticateAuthoritatively(request('/api/auth/session', { headers: { authorization: `Bearer ${token}` } }), env),
    /SESSION_REAUTH_REQUIRED/,
  );
});

test('superadmin can select an active tenant without tenant membership and receives server-derived broad scope', async () => {
  const passwordHash = await hashPassword('correct-horse-battery');
  const { env } = createEnv({
    users: [{ id: 'SA-1', email: 'root@proqtrack.id', password_hash: passwordHash, role: 'superadmin', status: 'active' }],
    orgs: [{ id: 'ORG-A', code: 'A', name: 'Org A', status: 'active' }],
    clients: [{ id: 'CLI-A', organization_id: 'ORG-A', status: 'active' }],
    projects: [{ id: 'PRJ-A', organization_id: 'ORG-A', client_id: 'CLI-A', status: 'active' }],
  });
  __resetAuthGatewayForTests();
  const response = await loginAuthoritatively(request('/api/auth/login', {
    method: 'POST',
    body: { email: 'root@proqtrack.id', password: 'correct-horse-battery', organizationId: 'ORG-A' },
  }), env, 'REQ-SA');
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.account.role, 'superadmin');
  assert.deepEqual(payload.account.projectIds, ['PRJ-A']);
  assert.deepEqual(payload.account.clientIds, ['CLI-A']);
});

test('security gateway rejects legacy tokens before protected APIs and accepts authoritative sessions', async () => {
  const { env } = await fixture();
  const legacy = await signClaims({ sub: 'ACC-1', role: 'manager', exp: 2_000_000_000 }, secret);
  const rejected = await secureWorker.fetch(request('/api/files', { headers: { authorization: `Bearer ${legacy}` } }), env);
  assert.equal(rejected.status, 401);
  assert.equal((await rejected.json()).error, 'SESSION_REAUTH_REQUIRED');

  const response = await login(env, { organizationId: 'ORG-A' });
  const payload = await response.json();
  const accepted = await secureWorker.fetch(request('/api/usage', { headers: { authorization: `Bearer ${payload.token}` } }), env);
  assert.equal(accepted.status, 503);
  assert.equal((await accepted.json()).error, 'DATA_API_LOCKED');
});
