import legacyWorker, { resolveSessionSecret, signClaims } from './index.js';
import {
  authenticateAuthoritatively,
  authErrorResponse,
  handleAuthRoute,
} from './authz.js';
import { handleOperationalGateway } from './operations-gateway.js';
import { handleEvidenceRoute } from './evidence.js';

const requestId = request => request.headers.get('cf-ray') || crypto.randomUUID();

async function forwardWithAuthoritativeClaims(request, env, claims) {
  const now = Math.floor(Date.now() / 1000);
  const internalClaims = {
    sub: claims.sub,
    sid: claims.sid,
    role: claims.role,
    email: claims.email || '',
    organizationId: claims.organizationId || null,
    projectIds: claims.projectIds || [],
    clientIds: claims.clientIds || [],
    scope: 'api-internal',
    authz: 'server',
    nbf: now,
    exp: now + 60,
  };
  const token = await signClaims(internalClaims, resolveSessionSecret(env));
  const headers = new Headers(request.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (claims.organizationId) headers.set('x-proqtrack-organization-id', claims.organizationId);
  else headers.delete('x-proqtrack-organization-id');
  return legacyWorker.fetch(new Request(request, { headers }), env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = requestId(request);

    if (url.pathname.startsWith('/api/auth/')) {
      const handled = await handleAuthRoute(request, env, url, id);
      if (handled) return handled;
    }

    if (url.pathname === '/api/health') {
      return legacyWorker.fetch(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      let claims;
      try {
        claims = await authenticateAuthoritatively(request, env);
      } catch (error) {
        return authErrorResponse(error, id);
      }

      if (url.pathname.startsWith('/api/core/')) {
        const operational = await handleOperationalGateway(request, env, claims, url);
        if (operational) return operational;
      }

      if (url.pathname.startsWith('/api/evidence')) {
        const evidenceEnv = env.CORE_EVIDENCE_API_ENABLED == null
          ? { ...env, CORE_EVIDENCE_API_ENABLED: 'true' }
          : env;
        const evidence = await handleEvidenceRoute(request, evidenceEnv, claims, url);
        if (evidence) return evidence;
      }

      return forwardWithAuthoritativeClaims(request, env, claims);
    }

    return legacyWorker.fetch(request, env);
  },

  async scheduled(event, env, ctx) {
    if (typeof legacyWorker.scheduled === 'function') {
      return legacyWorker.scheduled(event, env, ctx);
    }
    return undefined;
  },
};
