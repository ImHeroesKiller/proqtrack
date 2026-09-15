import { createWorkflowRequestInternal } from './workflows.js';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

const REPORT_TYPES = Object.freeze(['activity', 'attendance', 'sales', 'surveys', 'operational_summary']);
const REPORT_FORMATS = Object.freeze(['csv', 'json']);
const REPORT_ROLES = Object.freeze(['supervisor', 'manager', 'head', 'admin', 'superadmin']);
const SCHEDULE_ROLES = Object.freeze(['manager', 'head', 'admin', 'superadmin']);
const encoder = new TextEncoder();

const roleOf = claims => String(claims?.role || '').trim().toLowerCase();
const normalize = value => String(value || '').trim();
const broadRole = role => ['head', 'admin', 'superadmin'].includes(role);
const clamp = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

async function sha256Hex(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function allRows(statement) {
  const result = await statement.all();
  return Array.isArray(result?.results) ? result.results : [];
}

function projectAllowed(claims, projectId) {
  if (!projectId) return broadRole(roleOf(claims));
  if (broadRole(roleOf(claims))) return true;
  return Array.isArray(claims?.projectIds) && claims.projectIds.includes(projectId);
}

function canReadJob(claims, job) {
  if (!job || job.organization_id !== claims.organizationId) return false;
  const role = roleOf(claims);
  if (broadRole(role)) return true;
  if (job.requested_by === claims.sub) return true;
  if (role === 'manager' && job.project_id && Array.isArray(claims.projectIds) && claims.projectIds.includes(job.project_id)) return true;
  return false;
}

function normalizeDate(value) {
  const raw = normalize(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ][0-2]\d:[0-5]\d(?::[0-5]\d)?(?:\.\d+)?Z?)?$/.test(raw)) return null;
  return raw.slice(0, 10);
}

function parseFilters(value = {}) {
  return {
    from: normalizeDate(value.from),
    to: normalizeDate(value.to),
    employeeId: normalize(value.employeeId) || null,
    outletId: normalize(value.outletId) || null,
    status: normalize(value.status) || null,
  };
}

const csvCell = value => {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const toCsv = (columns, rows) => [
  columns.map(column => csvCell(column.label)).join(','),
  ...rows.map(row => columns.map(column => csvCell(row[column.key])).join(',')),
].join('\r\n');

function reportDefinition(type) {
  if (type === 'activity') return {
    columns: [
      ['id', 'Visit ID'], ['project_id', 'Project ID'], ['scheduled_at', 'Scheduled At'],
      ['started_at', 'Started At'], ['completed_at', 'Completed At'], ['status', 'Status'],
      ['employee_id', 'Employee ID'], ['employee_name', 'Employee'], ['outlet_id', 'Outlet ID'], ['outlet_name', 'Outlet'],
    ],
    from: `core_visits v JOIN core_employees e ON e.id=v.employee_id AND e.organization_id=v.organization_id JOIN core_outlets o ON o.id=v.outlet_id AND o.organization_id=v.organization_id`,
    select: `v.id,v.project_id,v.scheduled_at,v.started_at,v.completed_at,v.status,v.employee_id,e.full_name AS employee_name,v.outlet_id,o.name AS outlet_name`,
    dateExpr: `COALESCE(v.completed_at,v.started_at,v.scheduled_at,v.created_at)`,
    projectExpr: 'v.project_id', employeeExpr: 'v.employee_id', outletExpr: 'v.outlet_id', statusExpr: 'v.status',
    order: `COALESCE(v.completed_at,v.started_at,v.scheduled_at,v.created_at),v.id`,
  };
  if (type === 'attendance') return {
    columns: [
      ['id', 'Attendance ID'], ['work_date', 'Work Date'], ['project_id', 'Project ID'],
      ['employee_id', 'Employee ID'], ['employee_name', 'Employee'], ['status', 'Status'],
      ['check_in_at', 'Check In'], ['check_out_at', 'Check Out'],
    ],
    from: `core_attendance a JOIN core_employees e ON e.id=a.employee_id AND e.organization_id=a.organization_id`,
    select: `a.id,a.work_date,a.project_id,a.employee_id,e.full_name AS employee_name,a.status,a.check_in_at,a.check_out_at`,
    dateExpr: 'a.work_date', projectExpr: 'a.project_id', employeeExpr: 'a.employee_id', outletExpr: null, statusExpr: 'a.status',
    order: 'a.work_date,a.id',
  };
  if (type === 'sales') return {
    columns: [
      ['id', 'Sale ID'], ['sold_at', 'Sold At'], ['project_id', 'Project ID'],
      ['employee_id', 'Employee ID'], ['employee_name', 'Employee'], ['outlet_id', 'Outlet ID'], ['outlet_name', 'Outlet'],
      ['product_id', 'Product ID'], ['sku', 'SKU'], ['product_name', 'Product'], ['quantity', 'Quantity'],
      ['unit_price', 'Unit Price'], ['total_amount', 'Total Amount'],
    ],
    from: `core_product_sales s JOIN core_employees e ON e.id=s.employee_id AND e.organization_id=s.organization_id JOIN core_outlets o ON o.id=s.outlet_id AND o.organization_id=s.organization_id JOIN core_products p ON p.id=s.product_id AND p.organization_id=s.organization_id`,
    select: `s.id,s.sold_at,s.project_id,s.employee_id,e.full_name AS employee_name,s.outlet_id,o.name AS outlet_name,s.product_id,p.sku,p.name AS product_name,s.quantity,s.unit_price,s.total_amount`,
    dateExpr: 's.sold_at', projectExpr: 's.project_id', employeeExpr: 's.employee_id', outletExpr: 's.outlet_id', statusExpr: null,
    order: 's.sold_at,s.id',
  };
  if (type === 'surveys') return {
    columns: [
      ['id', 'Response ID'], ['submitted_at', 'Submitted At'], ['project_id', 'Project ID'],
      ['template_id', 'Template ID'], ['template_name', 'Survey'], ['employee_id', 'Employee ID'], ['employee_name', 'Employee'],
      ['outlet_id', 'Outlet ID'], ['outlet_name', 'Outlet'], ['status', 'Status'], ['answers_json', 'Answers'],
    ],
    from: `core_survey_responses r JOIN core_survey_templates t ON t.id=r.template_id AND t.organization_id=r.organization_id JOIN core_employees e ON e.id=r.employee_id AND e.organization_id=r.organization_id LEFT JOIN core_outlets o ON o.id=r.outlet_id AND o.organization_id=r.organization_id`,
    select: `r.id,r.submitted_at,r.project_id,r.template_id,t.name AS template_name,r.employee_id,e.full_name AS employee_name,r.outlet_id,o.name AS outlet_name,r.status,r.answers_json`,
    dateExpr: `COALESCE(r.submitted_at,r.created_at)`, projectExpr: 'r.project_id', employeeExpr: 'r.employee_id', outletExpr: 'r.outlet_id', statusExpr: 'r.status',
    order: `COALESCE(r.submitted_at,r.created_at),r.id`,
  };
  return null;
}

function buildReportQuery(type, organizationId, projectId, filters, limit, offset) {
  const definition = reportDefinition(type);
  if (!definition) throw new Error('REPORT_TYPE_NOT_SUPPORTED');
  const clauses = [`${definition.projectExpr.split('.')[0]}.organization_id=?`];
  const binds = [organizationId];
  if (projectId) { clauses.push(`${definition.projectExpr}=?`); binds.push(projectId); }
  if (filters.from) { clauses.push(`date(${definition.dateExpr})>=date(?)`); binds.push(filters.from); }
  if (filters.to) { clauses.push(`date(${definition.dateExpr})<=date(?)`); binds.push(filters.to); }
  if (filters.employeeId && definition.employeeExpr) { clauses.push(`${definition.employeeExpr}=?`); binds.push(filters.employeeId); }
  if (filters.outletId && definition.outletExpr) { clauses.push(`${definition.outletExpr}=?`); binds.push(filters.outletId); }
  if (filters.status && definition.statusExpr) { clauses.push(`${definition.statusExpr}=?`); binds.push(filters.status); }
  return {
    sql: `SELECT ${definition.select} FROM ${definition.from} WHERE ${clauses.join(' AND ')} ORDER BY ${definition.order} LIMIT ? OFFSET ?`,
    binds: [...binds, limit, offset],
    columns: definition.columns.map(([key, label]) => ({ key, label })),
  };
}

async function operationalSummary(env, organizationId, projectId, filters) {
  const dateStart = filters.from || '1900-01-01';
  const dateEnd = filters.to || '2999-12-31';
  const projectClause = projectId ? ' AND project_id=?' : '';
  const bindBase = projectId ? [organizationId, projectId, dateStart, dateEnd] : [organizationId, dateStart, dateEnd];
  const [visits, attendance, sales, surveys] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM core_visits WHERE organization_id=?${projectClause} AND date(COALESCE(completed_at,started_at,scheduled_at,created_at)) BETWEEN date(?) AND date(?)`).bind(...bindBase).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS present FROM core_attendance WHERE organization_id=?${projectClause} AND date(work_date) BETWEEN date(?) AND date(?)`).bind(...bindBase).first(),
    env.DB.prepare(`SELECT COUNT(*) AS transactions,COALESCE(SUM(quantity),0) AS quantity,COALESCE(SUM(total_amount),0) AS amount FROM core_product_sales WHERE organization_id=?${projectClause} AND date(sold_at) BETWEEN date(?) AND date(?)`).bind(...bindBase).first(),
    env.DB.prepare(`SELECT COUNT(*) AS responses FROM core_survey_responses WHERE organization_id=?${projectClause} AND date(COALESCE(submitted_at,created_at)) BETWEEN date(?) AND date(?)`).bind(...bindBase).first(),
  ]);
  return [{
    from: filters.from || null,
    to: filters.to || null,
    project_id: projectId || null,
    visits_total: Number(visits?.total || 0),
    visits_completed: Number(visits?.completed || 0),
    attendance_total: Number(attendance?.total || 0),
    attendance_present_or_late: Number(attendance?.present || 0),
    sales_transactions: Number(sales?.transactions || 0),
    sales_quantity: Number(sales?.quantity || 0),
    sales_amount: Number(sales?.amount || 0),
    survey_responses: Number(surveys?.responses || 0),
  }];
}

async function generateReportRows(env, job) {
  const filters = parseFilters(JSON.parse(job.filters_json || '{}'));
  if (job.report_type === 'operational_summary') {
    const rows = await operationalSummary(env, job.organization_id, job.project_id, filters);
    return {
      rows,
      columns: Object.keys(rows[0]).map(key => ({ key, label: key })),
      truncated: false,
    };
  }
  const maxRows = clamp(env.REPORT_MAX_ROWS, 20000, 100, 50000);
  const batchSize = clamp(env.REPORT_BATCH_ROWS, 1000, 100, 5000);
  const rows = [];
  let offset = 0;
  let columns = [];
  while (rows.length < maxRows) {
    const take = Math.min(batchSize, maxRows - rows.length);
    const query = buildReportQuery(job.report_type, job.organization_id, job.project_id, filters, take, offset);
    columns = query.columns;
    const page = await allRows(env.DB.prepare(query.sql).bind(...query.binds));
    rows.push(...page);
    if (page.length < take) return { rows, columns, truncated: false };
    offset += page.length;
  }
  return { rows, columns, truncated: true };
}

async function finishReport(env, job, rows, columns, truncated) {
  const payload = (() => { try { return JSON.parse(job.payload || '{}'); } catch { return {}; } })();
  const format = REPORT_FORMATS.includes(job.format) ? job.format : 'csv';
  const result = format === 'json'
    ? JSON.stringify({ generatedAt: new Date().toISOString(), reportType: job.report_type, truncated, rows })
    : toCsv(columns, rows);
  const contentType = format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8';
  const extension = format === 'json' ? 'json' : 'csv';
  const key = `reports/${job.organization_id}/${job.id}.${extension}`;
  const bytes = encoder.encode(result);
  const hash = await sha256Hex(bytes);
  await env.FILES.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: {
      organizationId: job.organization_id,
      reportJobId: job.id,
      reportType: job.report_type,
      requestedBy: job.requested_by,
    },
  });

  const requiresApproval = payload.requiresApproval === true || payload.requiresApproval === 1;
  const publicationStatus = requiresApproval ? 'pending_approval' : 'published';
  await env.DB.prepare(`
    UPDATE report_generation_jobs
    SET status='completed',progress_percent=100,result_key=?,result_content_type=?,result_size_bytes=?,
      result_sha256=?,publication_status=?,completed_at=CURRENT_TIMESTAMP,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP,
      last_error=NULL,expires_at=datetime('now','+30 days')
    WHERE id=? AND organization_id=?
  `).bind(key, contentType, bytes.byteLength, hash, publicationStatus, job.id, job.organization_id).run();

  if (requiresApproval) {
    try {
      const workflowId = await createWorkflowRequestInternal(env, {
        organizationId: job.organization_id,
        workflowType: 'report_publish',
        subjectType: 'report',
        subjectId: job.id,
        projectId: job.project_id || null,
        requestedBy: job.requested_by,
        payload: { reportType: job.report_type, reportName: job.report_name, resultKey: key },
      });
      await env.DB.prepare(`UPDATE report_generation_jobs SET approval_request_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(workflowId, job.id).run();
    } catch (error) {
      console.error('report_approval_create_failed', { jobId: job.id, error: error?.message || String(error) });
      await env.DB.prepare(`
        UPDATE report_generation_jobs SET publication_status='draft',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).bind(`APPROVAL_CREATE_FAILED:${String(error?.message || error).slice(0, 300)}`, job.id).run();
    }
  }
  return { key, sizeBytes: bytes.byteLength, sha256: hash, publicationStatus, rowCount: rows.length, truncated };
}

async function failOrRetry(env, job, error) {
  const attempts = Number(job.attempts || 0);
  const maxAttempts = Number(job.max_attempts || 3);
  const message = String(error?.message || error).slice(0, 700);
  if (attempts < maxAttempts) {
    const delayMinutes = Math.min(30, Math.max(1, 2 ** Math.max(0, attempts - 1)));
    await env.DB.prepare(`
      UPDATE report_generation_jobs
      SET status='queued',available_at=datetime('now', ?),lease_expires_at=NULL,worker_id=NULL,
        last_error=?,progress_percent=0,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND organization_id=?
    `).bind(`+${delayMinutes} minutes`, message, job.id, job.organization_id).run();
    return 'queued';
  }
  await env.DB.prepare(`
    UPDATE report_generation_jobs
    SET status='failed',lease_expires_at=NULL,last_error=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND organization_id=?
  `).bind(message, job.id, job.organization_id).run();
  return 'failed';
}

async function claimNextJob(env, workerId) {
  const candidate = await env.DB.prepare(`
    SELECT * FROM report_generation_jobs
    WHERE status='queued'
      AND COALESCE(available_at,created_at)<=CURRENT_TIMESTAMP
      AND organization_id IS NOT NULL
    ORDER BY priority DESC,created_at ASC
    LIMIT 1
  `).first();
  if (!candidate) return null;
  const result = await env.DB.prepare(`
    UPDATE report_generation_jobs
    SET status='processing',attempts=attempts+1,claimed_at=CURRENT_TIMESTAMP,
      lease_expires_at=datetime('now','+5 minutes'),worker_id=?,progress_percent=5,updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status='queued'
  `).bind(workerId, candidate.id).run();
  if (!Number(result?.meta?.changes || 0)) return null;
  return env.DB.prepare('SELECT * FROM report_generation_jobs WHERE id=? LIMIT 1').bind(candidate.id).first();
}

export async function processReportQueue(env, { maxJobs = 3, workerId = crypto.randomUUID() } = {}) {
  const count = clamp(maxJobs, 3, 1, 10);
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const job = await claimNextJob(env, workerId);
    if (!job) break;
    try {
      const generated = await generateReportRows(env, job);
      await env.DB.prepare(`UPDATE report_generation_jobs SET progress_percent=70,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(job.id).run();
      const result = await finishReport(env, job, generated.rows, generated.columns, generated.truncated);
      results.push({ id: job.id, status: 'completed', ...result });
    } catch (error) {
      const status = await failOrRetry(env, job, error);
      console.error('report_generation_failed', { jobId: job.id, status, error: error?.message || String(error) });
      results.push({ id: job.id, status, error: String(error?.message || error) });
    }
  }
  return results;
}

function timeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
}

function zonedDateToUtc({ year, month, day, hour }, timeZone) {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = timeZoneParts(guess, timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const desired = Date.UTC(year, month - 1, day, hour, 0, 0);
    guess = new Date(guess.getTime() + desired - represented);
  }
  return guess;
}

function addLocalDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function nextScheduleAt({ cadence, runHour, runDay, timezone }, from = new Date()) {
  const timeZone = normalize(timezone) || 'Asia/Jakarta';
  const local = timeZoneParts(from, timeZone);
  const hour = clamp(runHour, 7, 0, 23);
  let target = { year: local.year, month: local.month, day: local.day, hour };
  if (cadence === 'weekly') {
    const desiredDay = clamp(runDay, 1, 1, 7);
    const currentIsoDay = (() => {
      const d = new Date(Date.UTC(local.year, local.month - 1, local.day));
      const day = d.getUTCDay();
      return day === 0 ? 7 : day;
    })();
    let delta = (desiredDay - currentIsoDay + 7) % 7;
    let candidate = zonedDateToUtc(target, timeZone);
    if (delta === 0 && candidate <= from) delta = 7;
    const next = addLocalDays(local, delta);
    target = { ...next, hour };
  } else if (cadence === 'monthly') {
    const desiredDay = clamp(runDay, 1, 1, 28);
    target.day = desiredDay;
    let candidate = zonedDateToUtc(target, timeZone);
    if (candidate <= from) {
      const nextMonth = new Date(Date.UTC(local.year, local.month, 1));
      target = { year: nextMonth.getUTCFullYear(), month: nextMonth.getUTCMonth() + 1, day: desiredDay, hour };
    }
  } else {
    let candidate = zonedDateToUtc(target, timeZone);
    if (candidate <= from) {
      const next = addLocalDays(local, 1);
      target = { ...next, hour };
    }
  }
  return zonedDateToUtc(target, timeZone).toISOString().replace('T', ' ').replace('.000Z', '');
}

export async function enqueueDueReportSchedules(env, limit = 20) {
  const schedules = await allRows(env.DB.prepare(`
    SELECT * FROM core_report_schedules
    WHERE status='active' AND next_run_at<=CURRENT_TIMESTAMP
    ORDER BY next_run_at ASC LIMIT ?
  `).bind(clamp(limit, 20, 1, 100)));
  let enqueued = 0;
  for (const schedule of schedules) {
    const scheduledFor = schedule.next_run_at;
    const payload = JSON.stringify({ requiresApproval: Number(schedule.requires_approval || 0) === 1, scheduled: true, scheduledFor });
    await env.DB.prepare(`
      INSERT OR IGNORE INTO report_generation_jobs(
        id,report_type,format,project_id,requested_by,status,payload,result_key,attempts,max_attempts,
        created_at,updated_at,organization_id,report_name,filters_json,priority,progress_percent,
        available_at,publication_status,schedule_id
      ) VALUES(?,?,?,?,?,'queued',?,NULL,0,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,4,0,?,'draft',?)
    `).bind(
      crypto.randomUUID(), schedule.report_type, schedule.format, schedule.project_id || null,
      schedule.created_by, payload, schedule.organization_id, schedule.name,
      schedule.filters_json || '{}', scheduledFor, schedule.id,
    ).run();
    const next = nextScheduleAt({
      cadence: schedule.cadence,
      runHour: schedule.run_hour,
      runDay: schedule.run_day,
      timezone: schedule.timezone,
    }, new Date(`${String(scheduledFor).replace(' ', 'T')}Z`));
    await env.DB.prepare(`
      UPDATE core_report_schedules SET last_run_at=?,next_run_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?
    `).bind(scheduledFor, next, schedule.id, schedule.organization_id).run();
    enqueued += 1;
  }
  return enqueued;
}

async function loadJob(env, organizationId, id) {
  return env.DB.prepare(`SELECT * FROM report_generation_jobs WHERE id=? AND organization_id=? LIMIT 1`).bind(id, organizationId).first();
}

export async function handleReportRoute(request, env, claims, url = new URL(request.url), requestId = crypto.randomUUID()) {
  const organizationId = claims?.organizationId;
  if (!organizationId) return json({ error: 'ORGANIZATION_REQUIRED', requestId }, 409);
  const role = roleOf(claims);

  if (url.pathname === '/api/reports' && request.method === 'POST') {
    if (!REPORT_ROLES.includes(role)) return json({ error: 'FORBIDDEN', requestId }, 403);
    const body = await request.json().catch(() => ({}));
    const reportType = normalize(body.reportType).toLowerCase();
    const format = normalize(body.format || 'csv').toLowerCase();
    const projectId = normalize(body.projectId) || null;
    if (!REPORT_TYPES.includes(reportType) || !REPORT_FORMATS.includes(format)) return json({ error: 'INVALID_REPORT', requestId }, 400);
    if (!projectAllowed(claims, projectId)) return json({ error: projectId ? 'PROJECT_ACCESS_DENIED' : 'PROJECT_REQUIRED', requestId }, 403);
    const id = crypto.randomUUID();
    const reportName = normalize(body.name) || `${reportType}-${new Date().toISOString().slice(0, 10)}`;
    const filters = parseFilters(body.filters || {});
    await env.DB.prepare(`
      INSERT INTO report_generation_jobs(
        id,report_type,format,project_id,requested_by,status,payload,result_key,attempts,max_attempts,
        created_at,updated_at,organization_id,report_name,filters_json,priority,progress_percent,
        available_at,publication_status
      ) VALUES(?,?,?,?,?,'queued',?,NULL,0,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,0,CURRENT_TIMESTAMP,'draft')
    `).bind(
      id, reportType, format, projectId, claims.sub,
      JSON.stringify({ requiresApproval: body.requiresApproval === true }), organizationId,
      reportName, JSON.stringify(filters), clamp(body.priority, 5, 1, 10),
    ).run();
    return json({ ok: true, id, status: 'queued', publicationStatus: 'draft', requestId }, 202);
  }

  if (url.pathname === '/api/reports' && request.method === 'GET') {
    const limit = clamp(url.searchParams.get('limit'), 50, 1, 100);
    const status = normalize(url.searchParams.get('status'));
    const clauses = ['organization_id=?'];
    const binds = [organizationId];
    if (status) { clauses.push('status=?'); binds.push(status); }
    if (!broadRole(role)) {
      if (role === 'manager' && Array.isArray(claims.projectIds) && claims.projectIds.length) {
        const projects = claims.projectIds.slice(0, 100);
        clauses.push(`(requested_by=? OR project_id IN (${projects.map(() => '?').join(',')}))`);
        binds.push(claims.sub, ...projects);
      } else {
        clauses.push('requested_by=?'); binds.push(claims.sub);
      }
    }
    const jobs = await allRows(env.DB.prepare(`
      SELECT id,report_type,format,project_id,requested_by,status,report_name,progress_percent,
        publication_status,approval_request_id,schedule_id,attempts,max_attempts,last_error,
        result_size_bytes,result_sha256,created_at,started_at,completed_at,expires_at
      FROM report_generation_jobs WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC LIMIT ?
    `).bind(...binds, limit));
    return json({ reports: jobs, requestId });
  }

  const downloadMatch = url.pathname.match(/^\/api\/reports\/([^/]+)\/download$/);
  if (downloadMatch && request.method === 'GET') {
    const job = await loadJob(env, organizationId, decodeURIComponent(downloadMatch[1]));
    if (!job) return json({ error: 'REPORT_NOT_FOUND', requestId }, 404);
    if (!canReadJob(claims, job)) return json({ error: 'FORBIDDEN', requestId }, 403);
    if (job.status !== 'completed' || !job.result_key) return json({ error: 'REPORT_NOT_READY', requestId }, 409);
    if (job.publication_status !== 'published' && job.requested_by !== claims.sub && !broadRole(role)) {
      return json({ error: 'REPORT_NOT_PUBLISHED', requestId }, 403);
    }
    const object = await env.FILES.get(job.result_key);
    if (!object) return json({ error: 'REPORT_OBJECT_MISSING', requestId }, 404);
    const filename = `${normalize(job.report_name).replace(/[^a-zA-Z0-9._-]/g, '-') || job.id}.${job.format === 'json' ? 'json' : 'csv'}`;
    return new Response(object.body, {
      headers: {
        'content-type': job.result_content_type || object.httpMetadata?.contentType || 'application/octet-stream',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
        'x-content-sha256': job.result_sha256 || '',
      },
    });
  }

  const jobMatch = url.pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (jobMatch && request.method === 'GET') {
    const job = await loadJob(env, organizationId, decodeURIComponent(jobMatch[1]));
    if (!job) return json({ error: 'REPORT_NOT_FOUND', requestId }, 404);
    if (!canReadJob(claims, job)) return json({ error: 'FORBIDDEN', requestId }, 403);
    return json({ report: job, requestId });
  }

  const cancelMatch = url.pathname.match(/^\/api\/reports\/([^/]+)\/cancel$/);
  if (cancelMatch && request.method === 'POST') {
    const job = await loadJob(env, organizationId, decodeURIComponent(cancelMatch[1]));
    if (!job) return json({ error: 'REPORT_NOT_FOUND', requestId }, 404);
    if (job.requested_by !== claims.sub && !broadRole(role)) return json({ error: 'FORBIDDEN', requestId }, 403);
    const result = await env.DB.prepare(`
      UPDATE report_generation_jobs SET status='cancelled',updated_at=CURRENT_TIMESTAMP,completed_at=CURRENT_TIMESTAMP
      WHERE id=? AND organization_id=? AND status='queued'
    `).bind(job.id, organizationId).run();
    if (!Number(result?.meta?.changes || 0)) return json({ error: 'REPORT_NOT_CANCELLABLE', requestId }, 409);
    return json({ ok: true, id: job.id, status: 'cancelled', requestId });
  }

  const retryMatch = url.pathname.match(/^\/api\/reports\/([^/]+)\/retry$/);
  if (retryMatch && request.method === 'POST') {
    if (!['manager', 'head', 'admin', 'superadmin'].includes(role)) return json({ error: 'FORBIDDEN', requestId }, 403);
    const job = await loadJob(env, organizationId, decodeURIComponent(retryMatch[1]));
    if (!job || !canReadJob(claims, job)) return json({ error: 'REPORT_NOT_FOUND', requestId }, 404);
    if (job.status !== 'failed') return json({ error: 'REPORT_NOT_RETRYABLE', requestId }, 409);
    await env.DB.prepare(`
      UPDATE report_generation_jobs SET status='queued',attempts=0,available_at=CURRENT_TIMESTAMP,last_error=NULL,
        progress_percent=0,completed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?
    `).bind(job.id, organizationId).run();
    return json({ ok: true, id: job.id, status: 'queued', requestId });
  }

  if (url.pathname === '/api/report-schedules' && request.method === 'POST') {
    if (!SCHEDULE_ROLES.includes(role)) return json({ error: 'FORBIDDEN', requestId }, 403);
    const body = await request.json().catch(() => ({}));
    const reportType = normalize(body.reportType).toLowerCase();
    const format = normalize(body.format || 'csv').toLowerCase();
    const projectId = normalize(body.projectId) || null;
    const cadence = normalize(body.cadence || 'daily').toLowerCase();
    const timezone = normalize(body.timezone || 'Asia/Jakarta');
    if (!REPORT_TYPES.includes(reportType) || !REPORT_FORMATS.includes(format) || !['daily', 'weekly', 'monthly'].includes(cadence)) {
      return json({ error: 'INVALID_SCHEDULE', requestId }, 400);
    }
    if (!projectAllowed(claims, projectId)) return json({ error: projectId ? 'PROJECT_ACCESS_DENIED' : 'PROJECT_REQUIRED', requestId }, 403);
    try { timeZoneParts(new Date(), timezone); } catch { return json({ error: 'INVALID_TIMEZONE', requestId }, 400); }
    const schedule = {
      cadence,
      runHour: clamp(body.runHour, 7, 0, 23),
      runDay: body.runDay == null ? null : clamp(body.runDay, 1, 1, cadence === 'monthly' ? 28 : 7),
      timezone,
    };
    const id = crypto.randomUUID();
    const next = nextScheduleAt(schedule, new Date());
    await env.DB.prepare(`
      INSERT INTO core_report_schedules(
        id,organization_id,name,report_type,format,project_id,cadence,run_hour,run_day,timezone,
        filters_json,requires_approval,status,next_run_at,created_by,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(
      id, organizationId, normalize(body.name) || `${reportType} schedule`, reportType, format, projectId,
      cadence, schedule.runHour, schedule.runDay, timezone, JSON.stringify(parseFilters(body.filters || {})),
      body.requiresApproval === true ? 1 : 0, next, claims.sub,
    ).run();
    return json({ ok: true, id, status: 'active', nextRunAt: next, requestId }, 201);
  }

  if (url.pathname === '/api/report-schedules' && request.method === 'GET') {
    if (!SCHEDULE_ROLES.includes(role)) return json({ error: 'FORBIDDEN', requestId }, 403);
    const clauses = ['organization_id=?'];
    const binds = [organizationId];
    if (!broadRole(role)) {
      const projects = Array.isArray(claims.projectIds) ? claims.projectIds.slice(0, 100) : [];
      if (!projects.length) return json({ schedules: [], requestId });
      clauses.push(`project_id IN (${projects.map(() => '?').join(',')})`);
      binds.push(...projects);
    }
    const schedules = await allRows(env.DB.prepare(`
      SELECT id,name,report_type,format,project_id,cadence,run_hour,run_day,timezone,requires_approval,status,next_run_at,last_run_at,created_by,created_at,updated_at
      FROM core_report_schedules WHERE ${clauses.join(' AND ')} ORDER BY next_run_at,id
    `).bind(...binds));
    return json({ schedules, requestId });
  }

  const scheduleStatusMatch = url.pathname.match(/^\/api\/report-schedules\/([^/]+)\/status$/);
  if (scheduleStatusMatch && request.method === 'POST') {
    if (!SCHEDULE_ROLES.includes(role)) return json({ error: 'FORBIDDEN', requestId }, 403);
    const id = decodeURIComponent(scheduleStatusMatch[1]);
    const body = await request.json().catch(() => ({}));
    const status = normalize(body.status).toLowerCase();
    if (!['active', 'paused', 'archived'].includes(status)) return json({ error: 'INVALID_SCHEDULE_STATUS', requestId }, 400);
    const schedule = await env.DB.prepare(`SELECT * FROM core_report_schedules WHERE id=? AND organization_id=? LIMIT 1`).bind(id, organizationId).first();
    if (!schedule) return json({ error: 'SCHEDULE_NOT_FOUND', requestId }, 404);
    if (!projectAllowed(claims, schedule.project_id)) return json({ error: 'FORBIDDEN', requestId }, 403);
    const next = status === 'active' ? nextScheduleAt(schedule, new Date()) : schedule.next_run_at;
    await env.DB.prepare(`UPDATE core_report_schedules SET status=?,next_run_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`).bind(status, next, id, organizationId).run();
    return json({ ok: true, id, status, nextRunAt: next, requestId });
  }

  return null;
}

export const __test = {
  REPORT_TYPES,
  REPORT_FORMATS,
  parseFilters,
  projectAllowed,
  csvCell,
  nextScheduleAt,
  buildReportQuery,
};
