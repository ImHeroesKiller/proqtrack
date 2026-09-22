import { handleOperationalGateway } from './operations-gateway.js';

export async function handleM4Sync(request, env, claims, url = new URL(request.url)) {
  if (url.pathname !== '/api/core/sync' || request.method !== 'POST') return null;
  const body = await request.clone().json().catch(() => ({}));
  const response = await handleOperationalGateway(request, env, claims, url);
  if (response?.status !== 409) return response;

  try {
    const payload = await response.clone().json();
    if (payload?.error === 'REVISION_CONFLICT') {
      await env.DB.prepare(`
        INSERT INTO core_sync_conflicts(
          id,organization_id,mutation_id,actor_user_id,client_revision,server_revision,resolution,details_json
        ) VALUES(?,?,?,?,?,?,'manual',?)
      `).bind(
        crypto.randomUUID(),
        claims.organizationId,
        String(body.mutationId || request.headers.get('idempotency-key') || 'unknown').slice(0, 160),
        claims.sub,
        Math.max(0, Number(body.baseRevision || 0)),
        Math.max(0, Number(payload.revision || 0)),
        JSON.stringify({ changeCount: Array.isArray(body.changes) ? body.changes.length : 0 }),
      ).run();
    }
  } catch (error) {
    console.warn('m4_conflict_receipt_failed', error?.message || error);
  }
  return response;
}
