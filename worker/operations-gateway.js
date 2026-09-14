import { handleOperationalRoute } from './operations.js';

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

function sanitizeImportBody(body = {}) {
  const snapshot = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : {};
  return {
    ...body,
    snapshot: {
      ...snapshot,
      accounts: Array.isArray(snapshot.accounts)
        ? snapshot.accounts.map(account => ({ ...account, legacyProjectId: account.projectId || account.legacyProjectId || null, projectId: null }))
        : [],
      surveyTemplates: Array.isArray(snapshot.surveyTemplates)
        ? snapshot.surveyTemplates.map(sanitizeSurveyRow)
        : [],
    },
  };
}

function sanitizeSyncBody(body = {}) {
  if (!Array.isArray(body.changes)) return body;
  return {
    ...body,
    changes: body.changes.map(change => change?.entity === 'surveyTemplates' && change?.row
      ? { ...change, row: sanitizeSurveyRow(change.row) }
      : change),
  };
}

async function repairManagerMemberships(env, organizationId, originalSnapshot = {}) {
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

export async function handleOperationalGateway(request, env, claims, url = new URL(request.url)) {
  if (!url.pathname.startsWith('/api/core/')) return null;

  if (url.pathname === '/api/core/import' && request.method === 'POST') {
    const original = await request.clone().json().catch(() => ({}));
    const sanitized = sanitizeImportBody(original);
    const response = await handleOperationalRoute(jsonBodyRequest(request, sanitized), env, claims, url);
    if (response?.status === 201 && original.dryRun !== true) {
      await repairManagerMemberships(env, claims.organizationId, original.snapshot || {});
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
  sanitizeImportBody,
  sanitizeSyncBody,
};
