import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signClaims,
  verifyToken,
  resolveSessionSecret,
  extractBearerToken,
  hashPassword,
  verifyPassword,
  issueSessionForUser,
  handleApi,
  FORBIDDEN_SECRETS,
  MIN_SECRET_LENGTH,
  __resetRateLimitForTests,
} from '../worker/index.js';

const secret = 'test-secret-at-least-32-characters-long';

function request(path, { method = 'GET', body, headers = {}, rawBody } = {}) {
  return new Request(`https://proqtrack.test${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: rawBody ?? (body ? JSON.stringify(body) : undefined),
  });
}

function createEnv({
  users = [],
  fileApi = 'false',
  dataApi = 'false',
  authSecret = secret,
  files = new Map(),
} = {}) {
  return {
    ENVIRONMENT: 'mvp',
    API_AUTH_SECRET: authSecret,
    MVP_FILE_API_ENABLED: fileApi,
    MVP_DATA_API_ENABLED: dataApi,
    API_RATE_LIMIT_PER_MINUTE: '120',
    API_LOGIN_RATE_LIMIT_PER_MINUTE: '10',
    MVP_MAX_FILE_BYTES: '2097152',
    MVP_MAX_STORAGE_BYTES: '524288000',
    ALLOWED_UPLOAD_TYPES: 'image/jpeg,application/pdf',
    FILES: {
      async put(key, payload) { files.set(key, payload); },
      async get(key) {
        if (!files.has(key)) return null;
        return { body: files.get(key), httpMetadata: { contentType: 'image/jpeg' } };
      },
    },
    DB: {
      prepare(sql) {
        const stmt = {
          args: [],
          bind(...args) {
            this.args = args;
            return this;
          },
          async first() {
            if (/SELECT 1/.test(sql)) return { ok: 1 };
            if (/FROM auth_users/i.test(sql)) {
              const email = String(this.args[0] || '').toLowerCase();
              return users.find(user => user.email === email) || null;
            }
            if (/SUM\(size_bytes\)/.test(sql)) return { bytes: 0, files: 0 };
            return null;
          },
          async run() { return { success: true }; },
          async all() { return { results: [] }; },
        };
        return stmt;
      },
    },
  };
}

test('accepts a valid signed token', async () => {
  const claims = { sub: 'ACC-1', role: 'manager', projectIds: ['PRJ-1'], exp: 2_000_000_000 };
  const token = await signClaims(claims, secret);
  assert.deepEqual(await verifyToken(token, secret, 1_900_000_000), claims);
});

test('rejects a modified token', async () => {
  const token = await signClaims({ sub: 'ACC-1', role: 'employee', exp: 2_000_000_000 }, secret);
  const [payload, signature] = token.split('.');
  await assert.rejects(() => verifyToken(`${payload}x.${signature}`, secret, 1_900_000_000), /INVALID_TOKEN/);
});

test('rejects an expired token', async () => {
  const token = await signClaims({ sub: 'ACC-1', role: 'employee', exp: 100 }, secret);
  await assert.rejects(() => verifyToken(token, secret, 101), /TOKEN_EXPIRED/);
});

test('rejects claims without identity and role', async () => {
  const token = await signClaims({ exp: 2_000_000_000 }, secret);
  await assert.rejects(() => verifyToken(token, secret, 1_900_000_000), /INVALID_TOKEN/);
});

test('rejects missing, short, and hardcoded fallback secrets', () => {
  assert.throws(() => resolveSessionSecret({}), /SESSION_UNAVAILABLE/);
  assert.throws(() => resolveSessionSecret({ API_AUTH_SECRET: 'too-short' }), /SESSION_UNAVAILABLE/);
  assert.throws(
    () => resolveSessionSecret({ API_AUTH_SECRET: FORBIDDEN_SECRETS[0] }),
    /SESSION_UNAVAILABLE/,
  );
  assert.equal(FORBIDDEN_SECRETS[0].length >= MIN_SECRET_LENGTH, true);
  assert.equal(resolveSessionSecret({ API_AUTH_SECRET: secret }), secret);
});

test('reads bearer tokens only — never query strings', () => {
  const req = request('/api/files/x?access=stolen-token', {
    headers: { authorization: 'Bearer real-token' },
  });
  assert.equal(extractBearerToken(req), 'real-token');
  assert.equal(extractBearerToken(request('/api/files/x?access=stolen-token')), '');
});

test('POST /api/auth/session no longer mints tokens from client claims', async () => {
  const res = await handleApi(request('/api/auth/session', {
    method: 'POST',
    body: { sub: 'ACC-HACK', role: 'superadmin', projectIds: ['*'] },
  }), createEnv());
  assert.equal(res.status, 410);
  const payload = await res.json();
  assert.equal(payload.error, 'SESSION_MINTING_DISABLED');
  assert.equal(payload.token, undefined);
});

test('login ignores client-supplied role and uses the database role', async () => {
  __resetRateLimitForTests();
  const passwordHash = await hashPassword('correct-horse-battery');
  const env = createEnv({
    users: [{
      id: 'ACC-1',
      email: 'sales@proqtrack.id',
      password_hash: passwordHash,
      role: 'employee',
      status: 'active',
      project_ids: '["PRJ-1"]',
      client_ids: '[]',
    }],
  });
  const res = await handleApi(request('/api/auth/login', {
    method: 'POST',
    body: {
      email: 'sales@proqtrack.id',
      password: 'correct-horse-battery',
      role: 'superadmin',
      sub: 'ACC-HACK',
    },
  }), env);
  assert.equal(res.status, 200);
  const payload = await res.json();
  const claims = await verifyToken(payload.token, secret);
  assert.equal(claims.role, 'employee');
  assert.equal(claims.sub, 'ACC-1');
  assert.deepEqual(claims.projectIds, ['PRJ-1']);
});

test('login rejects unknown users, bad passwords, and plaintext hashes', async () => {
  __resetRateLimitForTests();
  const env = createEnv({
    users: [{
      id: 'ACC-1',
      email: 'sales@proqtrack.id',
      password_hash: 'plaintext-not-a-hash',
      role: 'employee',
      status: 'active',
      project_ids: '[]',
      client_ids: '[]',
    }],
  });
  const missing = await handleApi(request('/api/auth/login', {
    method: 'POST',
    body: { email: 'nobody@proqtrack.id', password: 'x' },
  }), env);
  assert.equal(missing.status, 401);
  const plaintext = await handleApi(request('/api/auth/login', {
    method: 'POST',
    body: { email: 'sales@proqtrack.id', password: 'plaintext-not-a-hash' },
  }), env);
  assert.equal(plaintext.status, 401);
});

test('PUT /api/state rejects malformed JSON without a stack trace', async () => {
  const { token } = await issueSessionForUser({
    id: 'ACC-H',
    email: 'head@proqtrack.id',
    role: 'head',
    project_ids: '[]',
    client_ids: '[]',
  }, secret);
  const env = createEnv({ dataApi: 'true' });
  const res = await handleApi(request('/api/state', {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    rawBody: '{not-json',
  }), env);
  assert.equal(res.status, 400);
  const payload = await res.json();
  assert.equal(payload.error, 'INVALID_JSON');
  assert.equal(payload.stack, undefined);
  assert.equal(String(JSON.stringify(payload)).includes('at '), false);
});

test('file and data APIs stay locked even with a valid token', async () => {
  const { token } = await issueSessionForUser({
    id: 'ACC-1',
    email: 'manager@proqtrack.id',
    role: 'manager',
    project_ids: '[]',
    client_ids: '[]',
  }, secret);
  const env = createEnv();
  const files = await handleApi(request('/api/files?name=a.jpg&projectId=general', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'image/jpeg' },
    rawBody: new Uint8Array([1, 2, 3, 4]),
  }), env);
  assert.equal(files.status, 503);
  assert.equal((await files.json()).error, 'DATA_API_LOCKED');

  const leaked = await handleApi(request(`/api/files/secret.jpg?access=${token}`), env);
  assert.equal(leaked.status, 401);
});

test('a query-string token cannot authenticate any API route', async () => {
  const { token } = await issueSessionForUser({
    id: 'ACC-1',
    email: 'manager@proqtrack.id',
    role: 'manager',
    project_ids: '[]',
    client_ids: '[]',
  }, secret);
  const res = await handleApi(
    request(`/api/auth/session?access=${token}`),
    createEnv(),
  );
  assert.equal(res.status, 401);
});

test('PBKDF2 hashes verify and plaintext never matches', async () => {
  const hashed = await hashPassword('secret-pass');
  assert.match(hashed, /^pbkdf2\$sha256\$100000\$/);
  assert.equal(await verifyPassword(hashed, 'secret-pass'), true);
  assert.equal(await verifyPassword(hashed, 'wrong'), false);
  assert.equal(await verifyPassword('secret-pass', 'secret-pass'), false);
});
