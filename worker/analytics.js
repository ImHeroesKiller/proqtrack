const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const roleOf = claims => String(claims?.role || '').trim().toLowerCase();
const broadRole = role => ['head', 'admin', 'superadmin'].includes(role);
const normalize = value => String(value || '').trim();
const clamp = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function dateOnly(value, fallback) {
  const raw = normalize(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function scopedProjects(claims, requestedProjectId) {
  const requested = normalize(requestedProjectId);
  if (broadRole(roleOf(claims))) return requested ? [requested] : null;
  const allowed = Array.isArray(claims?.projectIds) ? claims.projectIds.map(String) : [];
  if (requested) return allowed.includes(requested) ? [requested] : [];
  return allowed.slice(0, 100);
}

function projectClause(projects, expression = 'project_id') {
  if (projects == null) return { sql: '', binds: [] };
  if (!projects.length) return { sql: ' AND 1=0', binds: [] };
  return { sql: ` AND ${expression} IN (${projects.map(() => '?').join(',')})`, binds: projects };
}

async function allRows(stmt) {
  const result = await stmt.all();
  return Array.isArray(result?.results) ? result.results : [];
}

function b64urlEncode(value) {
  const bytes = encoder.encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(value) {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
}

export async function analyticsOverview(env, claims, url, requestId) {
  const organizationId = claims?.organizationId;
  if (!organizationId) return json({ error: 'ORGANIZATION_REQUIRED', requestId }, 409);
  if (!['supervisor', 'manager', 'head', 'admin', 'superadmin'].includes(roleOf(claims))) {
    return json({ error: 'FORBIDDEN', requestId }, 403);
  }
  const defaults = defaultRange();
  const from = dateOnly(url.searchParams.get('from'), defaults.from);
  const to = dateOnly(url.searchParams.get('to'), defaults.to);
  if (Date.parse(`${to}T00:00:00Z`) < Date.parse(`${from}T00:00:00Z`)) return json({ error: 'INVALID_DATE_RANGE', requestId }, 400);
  const rangeDays = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
  if (rangeDays > 366) return json({ error: 'DATE_RANGE_TOO_LARGE', maxDays: 366, requestId }, 400);

  const projects = scopedProjects(claims, url.searchParams.get('projectId'));
  if (projects != null && !projects.length) return json({ error: 'PROJECT_ACCESS_DENIED', requestId }, 403);
  const p = projectClause(projects);
  const binds = values => [organizationId, ...p.binds, ...values];

  const [visits, attendance, sales, surveys, employees, outlets, dailySales, dailyVisits, topProducts] = await Promise.all([
    env.DB.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected
      FROM core_visits WHERE organization_id=?${p.sql}
        AND date(COALESCE(completed_at,started_at,scheduled_at,created_at)) BETWEEN date(?) AND date(?)
    `).bind(...binds([from, to])).first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN status='late' THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN status='leave' THEN 1 ELSE 0 END) AS leave_count
      FROM core_attendance WHERE organization_id=?${p.sql}
        AND date(work_date) BETWEEN date(?) AND date(?)
    `).bind(...binds([from, to])).first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS transactions,COALESCE(SUM(quantity),0) AS quantity,COALESCE(SUM(total_amount),0) AS amount
      FROM core_product_sales WHERE organization_id=?${p.sql}
        AND COALESCE(json_extract(metadata_json,'$.lifecycleStatus'),'active')<>'voided'
        AND date(sold_at) BETWEEN date(?) AND date(?)
    `).bind(...binds([from, to])).first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS responses,SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) AS submitted
      FROM core_survey_responses WHERE organization_id=?${p.sql}
        AND date(COALESCE(submitted_at,created_at)) BETWEEN date(?) AND date(?)
    `).bind(...binds([from, to])).first(),
    env.DB.prepare(projects == null
      ? `SELECT COUNT(*) AS count FROM core_employees WHERE organization_id=? AND employment_status='active'`
      : `SELECT COUNT(DISTINCT a.employee_id) AS count FROM core_employee_project_assignments a WHERE a.organization_id=? AND a.status='active'${projectClause(projects, 'a.project_id').sql}`
    ).bind(...(projects == null ? [organizationId] : [organizationId, ...projects])).first(),
    env.DB.prepare(projects == null
      ? `SELECT COUNT(*) AS count FROM core_outlets WHERE organization_id=? AND status='active'`
      : `SELECT COUNT(DISTINCT po.outlet_id) AS count FROM core_project_outlets po WHERE po.organization_id=? AND po.status='active'${projectClause(projects, 'po.project_id').sql}`
    ).bind(...(projects == null ? [organizationId] : [organizationId, ...projects])).first(),
    allRows(env.DB.prepare(`
      SELECT date(sold_at) AS day,COUNT(*) AS transactions,COALESCE(SUM(total_amount),0) AS amount
      FROM core_product_sales WHERE organization_id=?${p.sql}
        AND COALESCE(json_extract(metadata_json,'$.lifecycleStatus'),'active')<>'voided'
        AND date(sold_at) BETWEEN date(?) AND date(?)
      GROUP BY date(sold_at) ORDER BY day
    `).bind(...binds([from, to]))),
    allRows(env.DB.prepare(`
      SELECT date(COALESCE(completed_at,started_at,scheduled_at,created_at)) AS day,
        COUNT(*) AS total,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed
      FROM core_visits WHERE organization_id=?${p.sql}
        AND date(COALESCE(completed_at,started_at,scheduled_at,created_at)) BETWEEN date(?) AND date(?)
      GROUP BY day ORDER BY day
    `).bind(...binds([from, to]))),
    allRows(env.DB.prepare(`
      SELECT s.product_id,pd.sku,pd.name,COALESCE(SUM(s.quantity),0) AS quantity,COALESCE(SUM(s.total_amount),0) AS amount
      FROM core_product_sales s JOIN core_products pd ON pd.id=s.product_id AND pd.organization_id=s.organization_id
      WHERE s.organization_id=?${projectClause(projects, 's.project_id').sql}
        AND COALESCE(json_extract(s.metadata_json,'$.lifecycleStatus'),'active')<>'voided'
        AND date(s.sold_at) BETWEEN date(?) AND date(?)
      GROUP BY s.product_id,pd.sku,pd.name ORDER BY amount DESC,quantity DESC LIMIT 10
    `).bind(organizationId, ...(projects == null ? [] : projects), from, to)),
  ]);

  const visitTotal = Number(visits?.total || 0);
  const attendanceTotal = Number(attendance?.total || 0);
  return json({
    ok: true,
    window: { from, to, days: rangeDays },
    projectIds: projects,
    kpis: {
      activeEmployees: Number(employees?.count || 0),
      activeOutlets: Number(outlets?.count || 0),
      visits: {
        total: visitTotal,
        completed: Number(visits?.completed || 0),
        cancelled: Number(visits?.cancelled || 0),
        rejected: Number(visits?.rejected || 0),
        completionRate: visitTotal ? Math.round(Number(visits?.completed || 0) * 10000 / visitTotal) / 100 : 0,
      },
      attendance: {
        total: attendanceTotal,
        present: Number(attendance?.present || 0),
        late: Number(attendance?.late || 0),
        absent: Number(attendance?.absent || 0),
        leave: Number(attendance?.leave_count || 0),
        presenceRate: attendanceTotal ? Math.round((Number(attendance?.present || 0) + Number(attendance?.late || 0)) * 10000 / attendanceTotal) / 100 : 0,
      },
      sales: {
        transactions: Number(sales?.transactions || 0),
        quantity: Number(sales?.quantity || 0),
        amount: Number(sales?.amount || 0),
      },
      surveys: { responses: Number(surveys?.responses || 0), submitted: Number(surveys?.submitted || 0) },
    },
    series: { dailySales, dailyVisits },
    topProducts,
    requestId,
  });
}

const QUERY_DEFINITIONS = Object.freeze({
  visits: {
    select: `v.id,v.project_id,v.outlet_id,o.name AS outlet_name,v.employee_id,e.full_name AS employee_name,v.status,v.scheduled_at,v.started_at,v.completed_at,v.updated_at`,
    from: `core_visits v JOIN core_employees e ON e.id=v.employee_id AND e.organization_id=v.organization_id JOIN core_outlets o ON o.id=v.outlet_id AND o.organization_id=v.organization_id`,
    org: 'v.organization_id', project: 'v.project_id', sort: `COALESCE(v.completed_at,v.started_at,v.scheduled_at,v.created_at)`, id: 'v.id', date: `COALESCE(v.completed_at,v.started_at,v.scheduled_at,v.created_at)`,
  },
  attendance: {
    select: `a.id,a.project_id,a.employee_id,e.full_name AS employee_name,a.work_date,a.status,a.check_in_at,a.check_out_at,a.updated_at`,
    from: `core_attendance a JOIN core_employees e ON e.id=a.employee_id AND e.organization_id=a.organization_id`,
    org: 'a.organization_id', project: 'a.project_id', sort: 'a.work_date', id: 'a.id', date: 'a.work_date',
  },
  sales: {
    select: `s.id,s.project_id,s.outlet_id,o.name AS outlet_name,s.employee_id,e.full_name AS employee_name,s.product_id,p.sku,p.name AS product_name,s.quantity,s.unit_price,s.total_amount,s.sold_at,s.updated_at`,
    from: `core_product_sales s JOIN core_employees e ON e.id=s.employee_id AND e.organization_id=s.organization_id JOIN core_outlets o ON o.id=s.outlet_id AND o.organization_id=s.organization_id JOIN core_products p ON p.id=s.product_id AND p.organization_id=s.organization_id`,
    org: 's.organization_id', project: 's.project_id', sort: 's.sold_at', id: 's.id', date: 's.sold_at',
    fixedClause: "COALESCE(json_extract(s.metadata_json,'$.lifecycleStatus'),'active')<>'voided'",
  },
  surveys: {
    select: `r.id,r.project_id,r.template_id,t.name AS template_name,r.outlet_id,r.employee_id,e.full_name AS employee_name,r.status,r.submitted_at,r.updated_at`,
    from: `core_survey_responses r JOIN core_survey_templates t ON t.id=r.template_id AND t.organization_id=r.organization_id JOIN core_employees e ON e.id=r.employee_id AND e.organization_id=r.organization_id`,
    org: 'r.organization_id', project: 'r.project_id', sort: `COALESCE(r.submitted_at,r.created_at)`, id: 'r.id', date: `COALESCE(r.submitted_at,r.created_at)`,
  },
});

export async function cursorQuery(env, claims, entity, url, requestId) {
  const definition = QUERY_DEFINITIONS[entity];
  if (!definition) return json({ error: 'QUERY_ENTITY_NOT_SUPPORTED', requestId }, 404);
  const organizationId = claims?.organizationId;
  if (!organizationId) return json({ error: 'ORGANIZATION_REQUIRED', requestId }, 409);
  const projects = scopedProjects(claims, url.searchParams.get('projectId'));
  if (projects != null && !projects.length) return json({ error: 'PROJECT_ACCESS_DENIED', requestId }, 403);
  const limit = clamp(url.searchParams.get('limit'), 50, 1, 200);
  const defaults = defaultRange();
  const from = dateOnly(url.searchParams.get('from'), defaults.from);
  const to = dateOnly(url.searchParams.get('to'), defaults.to);
  const cursor = b64urlDecode(normalize(url.searchParams.get('cursor')));
  const clauses = [`${definition.org}=?`];
  const binds = [organizationId];
  if (definition.fixedClause) clauses.push(definition.fixedClause);
  const pc = projectClause(projects, definition.project);
  if (pc.sql) { clauses.push(pc.sql.replace(/^ AND /, '')); binds.push(...pc.binds); }
  clauses.push(`date(${definition.date}) BETWEEN date(?) AND date(?)`); binds.push(from, to);
  if (cursor?.sort && cursor?.id) {
    clauses.push(`(${definition.sort} < ? OR (${definition.sort}=? AND ${definition.id}<?))`);
    binds.push(cursor.sort, cursor.sort, cursor.id);
  }
  const rows = await allRows(env.DB.prepare(`
    SELECT ${definition.select},${definition.sort} AS __sort
    FROM ${definition.from}
    WHERE ${clauses.join(' AND ')}
    ORDER BY ${definition.sort} DESC,${definition.id} DESC
    LIMIT ?
  `).bind(...binds, limit + 1));
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor = hasMore && last ? b64urlEncode({ sort: last.__sort, id: last.id }) : null;
  return json({
    entity,
    items: page.map(({ __sort, ...row }) => row),
    page: { limit, hasMore, nextCursor },
    window: { from, to },
    requestId,
  });
}

export async function handleAnalyticsRoute(request, env, claims, url = new URL(request.url), requestId = crypto.randomUUID()) {
  if (url.pathname === '/api/analytics/overview' && request.method === 'GET') {
    return analyticsOverview(env, claims, url, requestId);
  }
  const queryMatch = url.pathname.match(/^\/api\/query\/(visits|attendance|sales|surveys)$/);
  if (queryMatch && request.method === 'GET') {
    return cursorQuery(env, claims, queryMatch[1], url, requestId);
  }
  return null;
}

export const __test = { scopedProjects, projectClause, b64urlEncode, b64urlDecode, QUERY_DEFINITIONS, dateOnly };
