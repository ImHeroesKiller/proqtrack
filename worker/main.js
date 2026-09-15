import legacyWorker, { resolveSessionSecret, signClaims } from './index.js';
import {
  authenticateAuthoritatively,
  authErrorResponse,
  handleAuthRoute,
} from './authz.js';
import { handleOperationalGateway } from './operations-gateway.js';
import { handleEvidenceRoute } from './evidence.js';
import { handleM4Sync } from './m4-sync.js';
import {
  applySecurityHeaders,
  checkDistributedRateLimit,
  healthResponse,
  monitoringSummary,
  rateLimitResponse,
  recordRequestTelemetry,
  writeRateLimitAudit,
} from './hardening.js';
import { runProductionMaintenance } from './maintenance.js';

const requestId = request => request.headers.get('cf-ray') || crypto.randomUUID();
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

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

function apiLimitFor(url, request, env) {
  if (url.pathname.startsWith('/api/evidence') && request.method === 'POST') {
    return Number(env.API_EVIDENCE_RATE_LIMIT_PER_MINUTE || 30);
  }
  if (url.pathname === '/api/core/sync' && request.method === 'POST') {
    return Number(env.API_SYNC_RATE_LIMIT_PER_MINUTE || 60);
  }
  return Number(env.API_RATE_LIMIT_PER_MINUTE || 120);
}

async function finalizeResponse(request, env, ctx, response, id, startedAt, claims = null) {
  const durationMs = Date.now() - startedAt;
  const hardened = applySecurityHeaders(response, env, id);
  const telemetry = recordRequestTelemetry(env, {
    requestId: id,
    method: request.method,
    pathname: new URL(request.url).pathname,
    status: response.status,
    durationMs,
    claims,
    cf: request.cf || null,
  }).catch(error => {
    console.warn('request_telemetry_failed', { requestId: id, error: error?.message || String(error) });
  });
  if (ctx?.waitUntil) ctx.waitUntil(telemetry);
  else await telemetry;
  return hardened;
}

export default {
  async fetch(request, env, ctx) {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const id = requestId(request);
    let claims = null;
    let response = null;

    try {
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const loginLimit = await checkDistributedRateLimit(request, env, {
          scope: 'auth_login',
          limit: Number(env.API_LOGIN_RATE_LIMIT_PER_MINUTE || 10),
        });
        if (!loginLimit.allowed) {
          await writeRateLimitAudit(env, {
            requestId: id,
            scope: 'auth_login',
            subjectHash: loginLimit.subjectHash,
            limit: loginLimit.limit,
          });
          response = rateLimitResponse(loginLimit, id);
        }
      }

      if (!response && url.pathname.startsWith('/api/auth/')) {
        const handled = await handleAuthRoute(request, env, url, id);
        if (handled) response = handled;
      }

      if (!response && url.pathname === '/api/health' && request.method === 'GET') {
        response = await healthResponse(env, id);
      }

      if (!response && url.pathname.startsWith('/api/')) {
        try {
          claims = await authenticateAuthoritatively(request, env);
        } catch (error) {
          response = authErrorResponse(error, id);
        }

        if (!response) {
          const apiLimit = await checkDistributedRateLimit(request, env, {
            scope: url.pathname.startsWith('/api/evidence') ? 'evidence' : 'api',
            subject: claims.sub,
            limit: apiLimitFor(url, request, env),
          });
          if (!apiLimit.allowed) {
            await writeRateLimitAudit(env, {
              requestId: id,
              claims,
              scope: url.pathname.startsWith('/api/evidence') ? 'evidence' : 'api',
              subjectHash: apiLimit.subjectHash,
              limit: apiLimit.limit,
            });
            response = rateLimitResponse(apiLimit, id);
          }
        }

        if (!response && url.pathname === '/api/monitoring/summary' && request.method === 'GET') {
          response = await monitoringSummary(env, claims, id);
        }

        if (!response && url.pathname === '/api/core/sync' && request.method === 'POST') {
          const sync = await handleM4Sync(request, env, claims, url);
          if (sync) response = sync;
        }

        if (!response && url.pathname.startsWith('/api/core/')) {
          const operational = await handleOperationalGateway(request, env, claims, url);
          if (operational) response = operational;
        }

        if (!response && url.pathname.startsWith('/api/evidence')) {
          const evidenceEnv = env.CORE_EVIDENCE_API_ENABLED == null
            ? { ...env, CORE_EVIDENCE_API_ENABLED: 'true' }
            : env;
          const evidence = await handleEvidenceRoute(request, evidenceEnv, claims, url);
          if (evidence) response = evidence;
        }

        if (!response) response = await forwardWithAuthoritativeClaims(request, env, claims);
      }

      if (!response) response = await legacyWorker.fetch(request, env);
    } catch (error) {
      console.error('gateway_request_failed', {
        requestId: id,
        path: url.pathname,
        error: error?.stack || error?.message || String(error),
      });
      response = json({ error: 'INTERNAL_ERROR', requestId: id }, 500);
    }

    return finalizeResponse(request, env, ctx, response, id, startedAt, claims);
  },

  async scheduled(event, env, ctx) {
    const maintenance = runProductionMaintenance(env);
    if (ctx?.waitUntil) ctx.waitUntil(maintenance);
    else await maintenance;

    if (typeof legacyWorker.scheduled === 'function') {
      const legacy = legacyWorker.scheduled(event, env, ctx);
      if (ctx?.waitUntil && legacy?.then) ctx.waitUntil(legacy);
      else await legacy;
    }
  },
};
