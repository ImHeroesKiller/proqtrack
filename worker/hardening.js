const encoder = new TextEncoder();

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  },
});

const clampInt = (value, fallback, min = 1, max = 100000) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const sqliteTimestamp = value => new Date(value).toISOString().replace('T', ' ').slice(0, 19);

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '')));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function classifyRoute(pathname = '') {
  if (pathname === '/api/health') return 'health';
  if (pathname.startsWith('/api/auth/')) return 'auth';
  if (pathname.startsWith('/api/core/')) return 'core';
  if (pathname.startsWith('/api/admin/')) return 'admin';
  if (pathname.startsWith('/api/bulk/')) return 'bulk';
  if (pathname.startsWith('/api/evidence')) return 'evidence';
  if (pathname.startsWith('/api/reports') || pathname.startsWith('/api/report-schedules')) return 'reporting';
  if (pathname.startsWith('/api/workflows') || pathname.startsWith('/api/notifications')) return 'workflow';
  if (pathname.startsWith('/api/analytics/') || pathname.startsWith('/api/query/')) return 'analytics';
  if (pathname.startsWith('/api/monitoring/')) return 'monitoring';
  if (pathname.startsWith('/api/')) return 'legacy_api';
  return 'asset';
}

export async function checkDistributedRateLimit(request, env, {
  scope = 'api',
  subject = '',
  limit = 120,
  windowSeconds = 60,
} = {}) {
  const max = clampInt(limit, 120, 1, 10000);
  const window = clampInt(windowSeconds, 60, 10, 3600);
  const epoch = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(epoch / window) * window;
  const resetAt = windowStart + window;
  const rawSubject = String(subject || request.headers.get('cf-connecting-ip') || 'anonymous');
  const subjectHash = await sha256Hex(rawSubject);
  const bucketKey = `${String(scope).slice(0, 40)}:${subjectHash}:${windowStart}`;
  const expiresAt = sqliteTimestamp((resetAt + window) * 1000);

  await env.DB.prepare(`
    INSERT INTO core_rate_limit_buckets(
      bucket_key,scope,subject_hash,window_start,request_count,limit_value,expires_at,updated_at
    ) VALUES(?,?,?,?,1,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(bucket_key) DO UPDATE SET
      request_count=core_rate_limit_buckets.request_count+1,
      limit_value=excluded.limit_value,
      expires_at=excluded.expires_at,
      updated_at=CURRENT_TIMESTAMP
  `).bind(bucketKey, scope, subjectHash, windowStart, max, expiresAt).run();

  const row = await env.DB.prepare(
    'SELECT request_count,limit_value FROM core_rate_limit_buckets WHERE bucket_key=? LIMIT 1',
  ).bind(bucketKey).first();
  const count = Number(row?.request_count || 0);
  const allowed = count <= max;
  return {
    allowed,
    count,
    limit: max,
    remaining: Math.max(0, max - count),
    resetAt,
    retryAfter: allowed ? 0 : Math.max(1, resetAt - epoch),
    subjectHash,
  };
}

export function rateLimitResponse(result, requestId) {
  return json({ error: 'RATE_LIMITED', requestId }, 429, {
    'retry-after': String(result.retryAfter || 60),
    'x-ratelimit-limit': String(result.limit || 0),
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': String(result.resetAt || 0),
  });
}

export function applySecurityHeaders(response, env, requestId = '') {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'DENY');
  headers.set('permissions-policy', 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()');
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('cross-origin-resource-policy', 'same-origin');
  if (requestId) headers.set('x-request-id', requestId);
  if (String(env.ENVIRONMENT || '').toLowerCase() === 'production' || String(env.ENVIRONMENT || '').toLowerCase() === 'mvp') {
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
  if (!headers.has('content-security-policy')) {
    headers.delete('content-security-policy-report-only');
    headers.set('content-security-policy', [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self'",
      "script-src-elem 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
    ].join('; '));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function writeRateLimitAudit(env, { requestId, claims = null, scope, subjectHash, limit }) {
  try {
    await env.DB.prepare(`
      INSERT INTO security_audit_logs(
        request_id,actor_id,actor_role,action,resource_type,outcome,detail,created_at
      ) VALUES(?,?,?,?,?,'denied',?,CURRENT_TIMESTAMP)
    `).bind(
      requestId,
      claims?.sub || null,
      claims?.role || null,
      'rate_limit',
      scope || 'api',
      JSON.stringify({ subjectHash: String(subjectHash || '').slice(0, 16), limit: Number(limit || 0) }).slice(0, 500),
    ).run();
  } catch (error) {
    console.warn('rate_limit_audit_failed', error?.message || error);
  }
}

export async function recordRequestTelemetry(env, {
  requestId,
  method,
  pathname,
  status,
  durationMs,
  claims = null,
  cf = null,
}) {
  const routeGroup = classifyRoute(pathname);
  const statusClass = `${Math.floor(Number(status || 0) / 100)}xx`;
  const latency = Math.max(0, Math.round(Number(durationMs || 0)));
  const errorCount = Number(status || 0) >= 500 ? 1 : 0;
  const bucketMinute = sqliteTimestamp(Math.floor(Date.now() / 60000) * 60000);
  const log = {
    event: 'http_request',
    requestId,
    routeGroup,
    method,
    status,
    durationMs: latency,
    actorId: claims?.sub || null,
    organizationId: claims?.organizationId || null,
    colo: cf?.colo || null,
    country: cf?.country || null,
  };
  console.log(JSON.stringify(log));

  await env.DB.prepare(`
    INSERT INTO core_observability_minute(
      bucket_minute,route_group,method,status_class,request_count,error_count,
      latency_sum_ms,latency_max_ms,updated_at
    ) VALUES(?,?,?,?,1,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(bucket_minute,route_group,method,status_class) DO UPDATE SET
      request_count=core_observability_minute.request_count+1,
      error_count=core_observability_minute.error_count+excluded.error_count,
      latency_sum_ms=core_observability_minute.latency_sum_ms+excluded.latency_sum_ms,
      latency_max_ms=MAX(core_observability_minute.latency_max_ms,excluded.latency_max_ms),
      updated_at=CURRENT_TIMESTAMP
  `).bind(bucketMinute, routeGroup, method, statusClass, errorCount, latency, latency).run();
}

export async function healthResponse(env, requestId) {
  let dbOk = false;
  let schemaReady = false;
  let reportingSchemaReady = false;
  let uatSchemaReady = false;
  try {
    const probe = await env.DB.prepare('SELECT 1 AS ok').first();
    dbOk = probe?.ok === 1;
    const schema = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type='table' AND name IN (
        'core_rate_limit_buckets','core_observability_minute','core_maintenance_runs'
      )
    `).first();
    schemaReady = Number(schema?.count || 0) === 3;
    const reporting = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type='table' AND name IN (
        'core_report_schedules','core_workflow_requests','core_workflow_steps','core_notifications'
      )
    `).first();
    const reportColumns = await env.DB.prepare(`PRAGMA table_info(report_generation_jobs)`).all();
    const names = new Set((reportColumns?.results || []).map(row => String(row.name)));
    reportingSchemaReady = Number(reporting?.count || 0) === 4
      && ['organization_id', 'publication_status', 'lease_expires_at', 'filters_json'].every(name => names.has(name));
    const uatSchema = await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM sqlite_master
      WHERE type='table' AND name IN (
        'core_auth_devices',
        'core_competitors',
        'core_competitor_products',
        'core_attendance_points',
        'core_sync_revision_guards',
        'core_master_bulk_receipts'
      )
    `).first();
    const orgColumns = await env.DB.prepare(`PRAGMA table_info(core_organizations)`).all();
    const orgColumnNames = new Set((orgColumns?.results || []).map(row => String(row.name)));
    uatSchemaReady = Number(uatSchema?.count || 0) === 6 && orgColumnNames.has('metadata_json');
  } catch (error) {
    console.error('health_probe_failed', { requestId, error: error?.message || String(error) });
  }
  const defaultMilestone = { milestone: 'M5' }.milestone;
  const milestone = String(env.APP_MILESTONE || defaultMilestone);
  const needsM6 = ['M6', 'M7'].includes(milestone.toUpperCase());
  const needsM7 = milestone.toUpperCase() === 'M7';
  const ok = dbOk && schemaReady && (!needsM6 || reportingSchemaReady) && (!needsM7 || uatSchemaReady);
  return json({
    ok,
    service: 'ProQTrack',
    environment: env.ENVIRONMENT || 'unknown',
    milestone,
    dependencies: { d1: dbOk, hardeningSchema: schemaReady, reportingSchema: reportingSchemaReady, uatSchema: uatSchemaReady },
    requestId,
  }, ok ? 200 : 503);
}

export async function monitoringSummary(env, claims, requestId) {
  if (!['superadmin', 'head', 'admin'].includes(String(claims?.role || '').toLowerCase())) {
    return json({ error: 'FORBIDDEN', requestId }, 403);
  }
  const [metrics, maintenance, sessions, rateLimited, reports, workflows] = await Promise.all([
    env.DB.prepare(`
      SELECT route_group,method,status_class,
        SUM(request_count) AS requests,
        SUM(error_count) AS errors,
        SUM(latency_sum_ms) AS latency_sum_ms,
        MAX(latency_max_ms) AS latency_max_ms
      FROM core_observability_minute
      WHERE bucket_minute >= datetime('now','-60 minutes')
      GROUP BY route_group,method,status_class
      ORDER BY requests DESC
    `).all(),
    env.DB.prepare(`
      SELECT id,task,status,detail_json,started_at,completed_at
      FROM core_maintenance_runs
      ORDER BY started_at DESC LIMIT 10
    `).all(),
    env.DB.prepare(`
      SELECT status,COUNT(*) AS count FROM core_auth_sessions GROUP BY status
    `).all(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count FROM security_audit_logs
      WHERE action='rate_limit' AND created_at>=datetime('now','-60 minutes')
    `).first(),
    env.DB.prepare(`
      SELECT status,COUNT(*) AS count FROM report_generation_jobs
      WHERE organization_id=? GROUP BY status
    `).bind(claims.organizationId || 'ORG-DEFAULT').all().catch(() => ({ results: [] })),
    env.DB.prepare(`
      SELECT status,COUNT(*) AS count FROM core_workflow_requests
      WHERE organization_id=? GROUP BY status
    `).bind(claims.organizationId || 'ORG-DEFAULT').all().catch(() => ({ results: [] })),
  ]);

  const rows = (metrics?.results || []).map(row => {
    const requests = Number(row.requests || 0);
    const latencySum = Number(row.latency_sum_ms || 0);
    return {
      routeGroup: row.route_group,
      method: row.method,
      statusClass: row.status_class,
      requests,
      errors: Number(row.errors || 0),
      avgLatencyMs: requests ? Math.round(latencySum / requests) : 0,
      maxLatencyMs: Number(row.latency_max_ms || 0),
    };
  });
  return json({
    ok: true,
    window: '60m',
    metrics: rows,
    sessions: sessions?.results || [],
    rateLimited: Number(rateLimited?.count || 0),
    reportQueue: reports?.results || [],
    workflows: workflows?.results || [],
    maintenance: (maintenance?.results || []).map(row => ({
      id: row.id,
      task: row.task,
      status: row.status,
      detail: (() => { try { return JSON.parse(row.detail_json || '{}'); } catch { return {}; } })(),
      startedAt: row.started_at,
      completedAt: row.completed_at,
    })),
    requestId,
  });
}

export const __test = { clampInt, sha256Hex, sqliteTimestamp };
