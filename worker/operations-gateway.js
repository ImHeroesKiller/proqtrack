import { handleOperationalRoute } from './operations.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

const jsonBodyRequest = (request, body) => {
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
  });
};

const str = value => String(value ?? '').trim();

function sanitizeSurveyRow(row = {}) {
  if (!row.createdBy) return row;
  return {
    ...row,
    legacyCreatedBy: row.legacyCreatedBy || row.createdBy,
    createdBy: null,
  };
}

function sanitizeOperationalRow(entity, row = {}) {
  if (!row || typeof row !== 'object') return row;
  if (entity === 'surveyTemplates') return sanitizeSurveyRow(row);
  if (entity === 'clients' && row.status === 'prospect') {
    return { ...row, legacyStatus: row.legacyStatus || row.status, status: 'active' };
  }
  if (entity === 'projects') {
    const mapped = { on_hold: 'paused', completed: 'closed', cancelled: 'closed' }[row.status];
    if (mapped) return { ...row, legacyStatus: row.legacyStatus || row.status, status: mapped };
  }
  if (entity === 'projectAssignments' && row.status === 'removed') {
    return { ...row, legacyStatus: row.legacyStatus || row.status, status: 'ended' };
  }
  return row;
}

function sanitizeImportBody(body = {}) {
  const snapshot = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : {};
  const next = { ...snapshot };
  for (const entity of ['clients','projects','projectAssignments','surveyTemplates']) {
    if (Array.isArray(snapshot[entity])) next[entity] = snapshot[entity].map(row => sanitizeOperationalRow(entity, row));
  }
  // User identity can be created before operational parents, but employee/project
  // links are reconciled only after employees/projects/assignments exist.
  next.accounts = Array.isArray(snapshot.accounts)
    ? snapshot.accounts.map(account => ({
        ...account,
        legacyEmployeeId: account.employeeId || account.legacyEmployeeId || null,
        legacyProjectId: account.projectId || account.legacyProjectId || null,
        employeeId: null,
        projectId: null,
      }))
    : [];
  return { ...body, snapshot: next };
}

function sanitizeSyncBody(body = {}) {
  if (!Array.isArray(body.changes)) return body;
  return {
    ...body,
    changes: body.changes.map(change => change?.row
      ? { ...change, row: sanitizeOperationalRow(change.entity, change.row) }
      : change),
  };
}

function compatibilityBootstrap(payload = {}) {
  const data = payload.data && typeof payload.data === 'object' ? { ...payload.data } : {};
  if (Array.isArray(data.clients)) {
    data.clients = data.clients.map(row => ({ ...row, status: row.legacyStatus || row.status }));
  }
  if (Array.isArray(data.projects)) {
    data.projects = data.projects.map(row => ({
      ...row,
      status: row.legacyStatus || ({ paused: 'on_hold', closed: 'completed' }[row.status] || row.status),
    }));
  }
  if (Array.isArray(data.projectAssignments)) {
    data.projectAssignments = data.projectAssignments.map(row => ({
      ...row,
      status: row.legacyStatus || (row.status === 'ended' ? 'removed' : row.status),
    }));
  }
  if (Array.isArray(data.surveyTemplates)) {
    data.surveyTemplates = data.surveyTemplates.map(row => ({
      ...row,
      createdBy: row.legacyCreatedBy || row.createdBy || null,
    }));
  }

  const relations = [];
  const seen = new Set();
  for (const row of Array.isArray(data.projectProducts) ? data.projectProducts : []) {
    const key = `${row.projectId}:${row.productId}`;
    if (!row.projectId || !row.productId || seen.has(key)) continue;
    seen.add(key);
    relations.push(row);
  }
  for (const product of Array.isArray(data.products) ? data.products : []) {
    for (const projectId of Array.isArray(product.projectIds) ? product.projectIds : []) {
      const key = `${projectId}:${product.id}`;
      if (!projectId || !product.id || seen.has(key)) continue;
      seen.add(key);
      relations.push({
        id: `PP-${projectId}-${product.id}`,
        organizationId: product.organizationId,
        projectId,
        productId: product.id,
        status: 'active',
      });
    }
  }
  data.projectProducts = relations;
  return { ...payload, data };
}

async function reconcileNormalizedMemberships(env, organizationId) {
  // Link employees to server users using email only after both sides and the
  // organization membership exist. This keeps the import FK-safe.
  await env.DB.prepare(`
    UPDATE core_employees
    SET auth_user_id = (
      SELECT u.id
      FROM auth_users u
      JOIN core_organization_users ou
        ON ou.user_id=u.id AND ou.organization_id=core_employees.organization_id AND ou.status='active'
      WHERE lower(u.email)=lower(core_employees.email)
      LIMIT 1
    ), updated_at=CURRENT_TIMESTAMP
    WHERE organization_id=?
      AND email IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM auth_users u
        JOIN core_organization_users ou
          ON ou.user_id=u.id AND ou.organization_id=core_employees.organization_id AND ou.status='active'
        WHERE lower(u.email)=lower(core_employees.email)
      )
  `).bind(organizationId).run();

  // Project memberships are derived from the now-existing normalized
  // assignments. The WHERE clause also makes SQLite's SELECT+UPSERT grammar
  // unambiguous.
  await env.DB.prepare(`
    INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,updated_at)
    SELECT
      a.organization_id,
      a.project_id,
      e.auth_user_id,
      CASE WHEN ou.role IN ('manager','supervisor') THEN ou.role ELSE 'employee' END,
      CASE WHEN a.status='active' THEN 'active' ELSE 'inactive' END,
      CURRENT_TIMESTAMP
    FROM core_employee_project_assignments a
    JOIN core_employees e
      ON e.organization_id=a.organization_id AND e.id=a.employee_id AND e.auth_user_id IS NOT NULL
    JOIN core_organization_users ou
      ON ou.organization_id=e.organization_id AND ou.user_id=e.auth_user_id AND ou.status='active'
    JOIN core_projects p
      ON p.organization_id=a.organization_id AND p.id=a.project_id
    WHERE a.organization_id=?
    ON CONFLICT(organization_id,project_id,user_id)
    DO UPDATE SET role=excluded.role,status=excluded.status,updated_at=CURRENT_TIMESTAMP
  `).bind(organizationId).run();
}

async function repairDirectManagerMemberships(env, organizationId, originalSnapshot = {}) {
  const accounts = Array.isArray(originalSnapshot.accounts) ? originalSnapshot.accounts : [];
  for (const account of accounts) {
    if (str(account.role).toLowerCase() !== 'manager') continue;
    const projectId = str(account.projectId || account.legacyProjectId);
    const email = str(account.email).toLowerCase();
    if (!projectId || !email) continue;
    await env.DB.prepare(`
      INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,updated_at)
      SELECT ?, p.id, u.id, 'manager', 'active', CURRENT_TIMESTAMP
      FROM core_projects p
      JOIN auth_users u ON lower(u.email)=lower(?)
      JOIN core_organization_users ou ON ou.organization_id=? AND ou.user_id=u.id AND ou.status='active'
      WHERE p.organization_id=? AND p.id=? AND p.status='active'
      ON CONFLICT(organization_id,project_id,user_id)
      DO UPDATE SET role='manager',status='active',updated_at=CURRENT_TIMESTAMP
    `).bind(organizationId,email,organizationId,organizationId,projectId).run();
  }
}

async function bestEffortReconcile(env, organizationId, originalSnapshot = null) {
  try {
    await reconcileNormalizedMemberships(env, organizationId);
  } catch (error) {
    console.warn('operational_membership_reconcile_failed', {
      organizationId,
      error: error?.message || String(error),
    });
  }
  if (!originalSnapshot) return;
  try {
    await repairDirectManagerMemberships(env, organizationId, originalSnapshot);
  } catch (error) {
    console.warn('operational_manager_repair_failed', {
      organizationId,
      error: error?.message || String(error),
    });
  }
}

export async function handleOperationalGateway(request, env, claims, url = new URL(request.url)) {
  if (!url.pathname.startsWith('/api/core/')) return null;

  if (url.pathname === '/api/core/bootstrap' && request.method === 'GET') {
    // Identity reconciliation is repair work, not a prerequisite for reading the
    // tenant. A repair failure must never turn a healthy bootstrap into HTTP 500.
    await bestEffortReconcile(env, claims.organizationId);
    const response = await handleOperationalRoute(request, env, claims, url);
    if (!response || !response.ok) return response;
    const payload = await response.json();
    return json(compatibilityBootstrap(payload), response.status);
  }

  if (url.pathname === '/api/core/import' && request.method === 'POST') {
    const original = await request.clone().json().catch(() => ({}));
    const sanitized = sanitizeImportBody(original);
    const response = await handleOperationalRoute(jsonBodyRequest(request, sanitized), env, claims, url);
    if (response?.status === 201 && original.dryRun !== true) {
      // The import transaction has already committed at this point. Follow-up
      // identity repair is deliberately best-effort so a repair problem cannot
      // misreport a successful import as HTTP 500. Bootstrap performs the same
      // reconciliation again on later requests.
      await bestEffortReconcile(env, claims.organizationId, original.snapshot || {});
    }
    return response;
  }

  if (url.pathname === '/api/core/sync' && request.method === 'POST') {
    const body = await request.clone().json().catch(() => ({}));
    return handleOperationalRoute(jsonBodyRequest(request, sanitizeSyncBody(body)), env, claims, url);
  }

  return handleOperationalRoute(request, env, claims, url);
}

export const __test = {
  sanitizeSurveyRow,
  sanitizeOperationalRow,
  sanitizeImportBody,
  sanitizeSyncBody,
  compatibilityBootstrap,
  bestEffortReconcile,
};
