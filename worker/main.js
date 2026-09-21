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
import { handleReportRoute, enqueueDueReportSchedules, processReportQueue } from './reports.js';
import { handleWorkflowRoute } from './workflows.js';
import { handleAnalyticsRoute } from './analytics.js';
import { handleBulkEmployeeRoute } from './bulk-employees.js';
import { handleBulkMasterRoute } from './bulk-master.js';
import { handleAccountAdminRoute } from './accounts.js';
import { handleOrganizationAdminRoute } from './organizations.js';

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

function apiScopeFor(url) {
  if (url.pathname.startsWith('/api/admin/')) return 'admin';
  if (url.pathname.startsWith('/api/bulk/')) return 'bulk';
  if (url.pathname.startsWith('/api/evidence')) return 'evidence';
  if (url.pathname.startsWith('/api/reports') || url.pathname.startsWith('/api/report-schedules')) return 'reporting';
  if (url.pathname.startsWith('/api/workflows')) return 'workflow';
  return 'api';
}

function apiLimitFor(url, request, env) {
  if (url.pathname.startsWith('/api/admin/')) {
    return Number(env.API_ADMIN_RATE_LIMIT_PER_MINUTE || 30);
  }
  if (url.pathname.startsWith('/api/bulk/') && request.method === 'POST') {
    return Number(env.API_BULK_RATE_LIMIT_PER_MINUTE || 60);
  }
  if (url.pathname.startsWith('/api/evidence') && request.method === 'POST') {
    return Number(env.API_EVIDENCE_RATE_LIMIT_PER_MINUTE || 30);
  }
  if (url.pathname === '/api/core/sync' && request.method === 'POST') {
    return Number(env.API_SYNC_RATE_LIMIT_PER_MINUTE || 60);
  }
  if ((url.pathname === '/api/reports' || url.pathname === '/api/report-schedules') && request.method === 'POST') {
    return Number(env.API_REPORT_RATE_LIMIT_PER_MINUTE || 20);
  }
  if (url.pathname.startsWith('/api/workflows') && request.method === 'POST') {
    return Number(env.API_WORKFLOW_RATE_LIMIT_PER_MINUTE || 30);
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

async function recoverExpiredReportLeases(env) {
  try {
    await env.DB.prepare(`
      UPDATE report_generation_jobs
      SET status='queued',worker_id=NULL,lease_expires_at=NULL,available_at=CURRENT_TIMESTAMP,
        last_error='LEASE_EXPIRED',progress_percent=0,updated_at=CURRENT_TIMESTAMP
      WHERE status='processing' AND lease_expires_at IS NOT NULL AND lease_expires_at<CURRENT_TIMESTAMP
    `).run();
  } catch (error) {
    console.warn('report_lease_recovery_failed', error?.message || error);
  }
}

async function runM6Scheduler(env) {
  await recoverExpiredReportLeases(env);
  const enqueued = await enqueueDueReportSchedules(env, 20);
  const processed = await processReportQueue(env, { maxJobs: Number(env.REPORT_QUEUE_MAX_JOBS || 3) });
  console.log(JSON.stringify({ event: 'm6_report_scheduler', enqueued, processed: processed.length }));
  return { enqueued, processed: processed.length };
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
          const scope = apiScopeFor(url);
          const apiLimit = await checkDistributedRateLimit(request, env, {
            scope,
            subject: claims.sub,
            limit: apiLimitFor(url, request, env),
          });
          if (!apiLimit.allowed) {
            await writeRateLimitAudit(env, {
              requestId: id,
              claims,
              scope,
              subjectHash: apiLimit.subjectHash,
              limit: apiLimit.limit,
            });
            response = rateLimitResponse(apiLimit, id);
          }
        }

        if (!response && url.pathname === '/api/monitoring/summary' && request.method === 'GET') {
          response = await monitoringSummary(env, claims, id);
        }

        if (!response && (url.pathname.startsWith('/api/reports') || url.pathname.startsWith('/api/report-schedules'))) {
          response = await handleReportRoute(request, env, claims, url, id);
          if (response && url.pathname === '/api/reports' && request.method === 'POST' && response.status === 202) {
            const work = processReportQueue(env, { maxJobs: 1 }).catch(error => {
              console.error('report_immediate_processing_failed', { requestId: id, error: error?.message || String(error) });
            });
            if (ctx?.waitUntil) ctx.waitUntil(work);
          }
        }

        if (!response && (url.pathname.startsWith('/api/workflows') || url.pathname.startsWith('/api/notifications'))) {
          response = await handleWorkflowRoute(request, env, claims, url, id);
        }

        if (!response && (url.pathname.startsWith('/api/analytics/') || url.pathname.startsWith('/api/query/'))) {
          response = await handleAnalyticsRoute(request, env, claims, url, id);
        }

        if (!response && url.pathname.startsWith('/api/admin/organizations')) {
          response = await handleOrganizationAdminRoute(request, env, claims, url, id);
        }

        if (!response && url.pathname.startsWith('/api/admin/accounts')) {
          response = await handleAccountAdminRoute(request, env, claims, url, id);
        }

        if (!response && url.pathname.startsWith('/api/bulk/master/')) {
          response = await handleBulkMasterRoute(request, env, claims, url, id);
        }

        if (!response && url.pathname.startsWith('/api/bulk/employees')) {
          response = await handleBulkEmployeeRoute(request, env, claims, url, id);
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
    const scheduler = runM6Scheduler(env).catch(error => {
      console.error('m6_scheduler_failed', error?.stack || error?.message || String(error));
    });
    const maintenance = runProductionMaintenance(env).catch(error => {
      console.error('production_maintenance_scheduled_failed', error?.stack || error?.message || String(error));
    });
    if (ctx?.waitUntil) {
      ctx.waitUntil(scheduler);
      ctx.waitUntil(maintenance);
    } else {
      await scheduler;
      await maintenance;
    }

    if (typeof legacyWorker.scheduled === 'function') {
      const legacy = legacyWorker.scheduled(event, env, ctx);
      if (ctx?.waitUntil && legacy?.then) ctx.waitUntil(legacy);
      else await legacy;
    }
  },
};
