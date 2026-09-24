const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

const ROLE_STEPS = Object.freeze({
  attendance_correction: ['supervisor', 'manager'],
  visit_exception: ['supervisor', 'manager'],
  report_publish: ['head'],
  survey_reopen: ['manager'],
});

const CREATE_ROLES = Object.freeze({
  attendance_correction: ['employee', 'supervisor', 'manager', 'head', 'admin', 'superadmin'],
  visit_exception: ['employee', 'supervisor', 'manager', 'head', 'admin', 'superadmin'],
  report_publish: ['manager', 'head', 'admin', 'superadmin'],
  survey_reopen: ['supervisor', 'manager', 'head', 'admin', 'superadmin'],
});

const normalize = value => String(value || '').trim();
const roleOf = claims => normalize(claims?.role).toLowerCase();
const broadRole = role => ['head', 'admin', 'superadmin'].includes(role);
const projectAllowed = (claims, projectId) => {
  if (!projectId) return true;
  if (broadRole(roleOf(claims))) return true;
  return Array.isArray(claims?.projectIds) && claims.projectIds.includes(projectId);
};

async function allRows(statement) {
  const result = await statement.all();
  return Array.isArray(result?.results) ? result.results : [];
}

async function addEvent(env, organizationId, requestId, eventType, actorUserId, payload = {}) {
  await env.DB.prepare(`
    INSERT INTO core_workflow_events(id,organization_id,request_id,event_type,actor_user_id,payload_json,created_at)
    VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(
    crypto.randomUUID(), organizationId, requestId, eventType, actorUserId || null,
    JSON.stringify(payload || {}).slice(0, 8000),
  ).run();
}

async function addRoleNotification(env, organizationId, targetRole, requestId, workflowType) {
  const title = 'Approval diperlukan';
  const body = `${workflowType.replaceAll('_', ' ')} menunggu persetujuan ${targetRole}.`;
  await env.DB.prepare(`
    INSERT INTO core_notifications(
      id,organization_id,target_role,notification_type,title,body,entity_type,entity_id,status,created_at
    ) VALUES(?,?,?,?,?,?, 'workflow', ?, 'unread', CURRENT_TIMESTAMP)
  `).bind(crypto.randomUUID(), organizationId, targetRole, 'workflow_approval', title, body, requestId).run();
}

async function addUserNotification(env, organizationId, userId, requestId, status) {
  if (!userId) return;
  await env.DB.prepare(`
    INSERT INTO core_notifications(
      id,organization_id,user_id,notification_type,title,body,entity_type,entity_id,status,created_at
    ) VALUES(?,?,?,?,?,?, 'workflow', ?, 'unread', CURRENT_TIMESTAMP)
  `).bind(
    crypto.randomUUID(), organizationId, userId, 'workflow_resolution',
    status === 'approved' ? 'Pengajuan disetujui' : status === 'rejected' ? 'Pengajuan ditolak' : 'Pengajuan dibatalkan',
    `Workflow ${requestId} berstatus ${status}.`, requestId,
  ).run();
}

async function archiveApprovalNotifications(env, organizationId, requestId, role) {
  await env.DB.prepare(`
    UPDATE core_notifications SET status='archived'
    WHERE organization_id=? AND entity_type='workflow' AND entity_id=?
      AND notification_type='workflow_approval' AND target_role=? AND status='unread'
  `).bind(organizationId, requestId, role).run();
}

export async function createWorkflowRequestInternal(env, {
  organizationId,
  workflowType,
  subjectType,
  subjectId,
  projectId = null,
  requestedBy,
  payload = {},
}) {
  const steps = ROLE_STEPS[workflowType];
  if (!steps) throw new Error('WORKFLOW_TYPE_NOT_SUPPORTED');
  if (!organizationId || !subjectType || !subjectId || !requestedBy) throw new Error('INVALID_WORKFLOW_REQUEST');

  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO core_workflow_requests(
      id,organization_id,workflow_type,subject_type,subject_id,project_id,requested_by,
      status,current_step,payload_json,version,created_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,'pending',1,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  `).bind(
    id, organizationId, workflowType, subjectType, subjectId, projectId || null,
    requestedBy, JSON.stringify(payload || {}).slice(0, 16000),
  ).run();

  for (let index = 0; index < steps.length; index += 1) {
    await env.DB.prepare(`
      INSERT INTO core_workflow_steps(
        organization_id,request_id,step_no,approver_role,status,created_at
      ) VALUES(?,?,?,?, 'pending', CURRENT_TIMESTAMP)
    `).bind(organizationId, id, index + 1, steps[index]).run();
  }
  await addEvent(env, organizationId, id, 'created', requestedBy, { workflowType, subjectType, subjectId });
  await addRoleNotification(env, organizationId, steps[0], id, workflowType);
  return id;
}

async function loadRequest(env, organizationId, id) {
  return env.DB.prepare(`
    SELECT * FROM core_workflow_requests WHERE organization_id=? AND id=? LIMIT 1
  `).bind(organizationId, id).first();
}

async function requestDetail(env, organizationId, id) {
  const request = await loadRequest(env, organizationId, id);
  if (!request) return null;
  const [steps, events] = await Promise.all([
    allRows(env.DB.prepare(`
      SELECT step_no,approver_role,approver_user_id,status,acted_by,acted_at,comment,created_at
      FROM core_workflow_steps WHERE organization_id=? AND request_id=? ORDER BY step_no
    `).bind(organizationId, id)),
    allRows(env.DB.prepare(`
      SELECT id,event_type,actor_user_id,payload_json,created_at
      FROM core_workflow_events WHERE organization_id=? AND request_id=? ORDER BY created_at,id
    `).bind(organizationId, id)),
  ]);
  return {
    ...request,
    payload: (() => { try { return JSON.parse(request.payload_json || '{}'); } catch { return {}; } })(),
    steps,
    events: events.map(row => ({
      ...row,
      payload: (() => { try { return JSON.parse(row.payload_json || '{}'); } catch { return {}; } })(),
    })),
  };
}

function canSeeRequest(claims, row) {
  const role = roleOf(claims);
  if (broadRole(role)) return true;
  if (row.requested_by === claims.sub) return true;
  if (row.project_id && Array.isArray(claims.projectIds) && claims.projectIds.includes(row.project_id)) return true;
  return false;
}

async function applyWorkflowEffect(env, request) {
  if (request.workflow_type === 'report_publish' && request.subject_type === 'report') {
    await env.DB.prepare(`
      UPDATE report_generation_jobs
      SET publication_status='published',updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND organization_id=? AND status='completed'
    `).bind(request.subject_id, request.organization_id).run();
  }
}

async function actOnRequest(env, claims, request, action, comment) {
  if (request.status !== 'pending') throw new Error('WORKFLOW_ALREADY_RESOLVED');
  const role = roleOf(claims);
  if (action === 'cancel') {
    if (claims.sub !== request.requested_by && !['admin', 'superadmin'].includes(role)) throw new Error('FORBIDDEN');
    await env.DB.prepare(`
      UPDATE core_workflow_requests
      SET status='cancelled',version=version+1,updated_at=CURRENT_TIMESTAMP,resolved_at=CURRENT_TIMESTAMP
      WHERE id=? AND organization_id=? AND status='pending'
    `).bind(request.id, request.organization_id).run();
    await addEvent(env, request.organization_id, request.id, 'cancelled', claims.sub, { comment });
    await addUserNotification(env, request.organization_id, request.requested_by, request.id, 'cancelled');
    return 'cancelled';
  }

  const step = await env.DB.prepare(`
    SELECT * FROM core_workflow_steps
    WHERE organization_id=? AND request_id=? AND step_no=? LIMIT 1
  `).bind(request.organization_id, request.id, request.current_step).first();
  if (!step || step.status !== 'pending') throw new Error('WORKFLOW_STEP_INVALID');
  const roleMatch = role === step.approver_role || ['admin', 'superadmin'].includes(role);
  if (!roleMatch) throw new Error('FORBIDDEN');
  if (claims.sub === request.requested_by) throw new Error('SEPARATION_OF_DUTIES');

  if (action === 'reject') {
    await env.DB.prepare(`
      UPDATE core_workflow_steps
      SET status='rejected',acted_by=?,acted_at=CURRENT_TIMESTAMP,comment=?
      WHERE organization_id=? AND request_id=? AND step_no=? AND status='pending'
    `).bind(claims.sub, comment || null, request.organization_id, request.id, request.current_step).run();
    await env.DB.prepare(`
      UPDATE core_workflow_requests
      SET status='rejected',version=version+1,updated_at=CURRENT_TIMESTAMP,resolved_at=CURRENT_TIMESTAMP
      WHERE id=? AND organization_id=? AND status='pending'
    `).bind(request.id, request.organization_id).run();
    await archiveApprovalNotifications(env, request.organization_id, request.id, step.approver_role);
    await addEvent(env, request.organization_id, request.id, 'rejected', claims.sub, { step: request.current_step, comment });
    await addUserNotification(env, request.organization_id, request.requested_by, request.id, 'rejected');
    return 'rejected';
  }

  if (action !== 'approve') throw new Error('INVALID_WORKFLOW_ACTION');
  await env.DB.prepare(`
    UPDATE core_workflow_steps
    SET status='approved',acted_by=?,acted_at=CURRENT_TIMESTAMP,comment=?
    WHERE organization_id=? AND request_id=? AND step_no=? AND status='pending'
  `).bind(claims.sub, comment || null, request.organization_id, request.id, request.current_step).run();
  await archiveApprovalNotifications(env, request.organization_id, request.id, step.approver_role);
  await addEvent(env, request.organization_id, request.id, 'step_approved', claims.sub, { step: request.current_step, comment });

  const next = await env.DB.prepare(`
    SELECT step_no,approver_role FROM core_workflow_steps
    WHERE organization_id=? AND request_id=? AND step_no>? AND status='pending'
    ORDER BY step_no LIMIT 1
  `).bind(request.organization_id, request.id, request.current_step).first();
  if (next) {
    await env.DB.prepare(`
      UPDATE core_workflow_requests
      SET current_step=?,version=version+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND organization_id=? AND status='pending'
    `).bind(next.step_no, request.id, request.organization_id).run();
    await addRoleNotification(env, request.organization_id, next.approver_role, request.id, request.workflow_type);
    return 'pending';
  }

  await env.DB.prepare(`
    UPDATE core_workflow_requests
    SET status='approved',version=version+1,updated_at=CURRENT_TIMESTAMP,resolved_at=CURRENT_TIMESTAMP
    WHERE id=? AND organization_id=? AND status='pending'
  `).bind(request.id, request.organization_id).run();
  await applyWorkflowEffect(env, request);
  await addEvent(env, request.organization_id, request.id, 'approved', claims.sub, {});
  await addUserNotification(env, request.organization_id, request.requested_by, request.id, 'approved');
  return 'approved';
}

export async function handleWorkflowRoute(request, env, claims, url = new URL(request.url), requestId = crypto.randomUUID()) {
  const organizationId = claims?.organizationId;
  if (!organizationId) return json({ error: 'ORGANIZATION_REQUIRED', requestId }, 409);
  const role = roleOf(claims);

  if (url.pathname === '/api/workflows' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const workflowType = normalize(body.workflowType).toLowerCase();
    const allowedRoles = CREATE_ROLES[workflowType];
    if (!allowedRoles || !allowedRoles.includes(role)) return json({ error: 'FORBIDDEN', requestId }, 403);
    let projectId = normalize(body.projectId) || null;
    const subjectType = normalize(body.subjectType);
    const subjectId = normalize(body.subjectId);

    if (workflowType === 'visit_exception') {
      if (subjectType !== 'visit' || !subjectId) return json({ error: 'INVALID_VISIT_EXCEPTION', requestId }, 400);
      const visit = await env.DB.prepare(
        'SELECT id,project_id,status FROM core_visits WHERE organization_id=? AND id=? LIMIT 1'
      ).bind(organizationId, subjectId).first();
      if (!visit) return json({ error: 'VISIT_NOT_FOUND', requestId }, 404);
      if (!['completed','cancelled','rejected'].includes(normalize(visit.status).toLowerCase())) {
        return json({ error: 'VISIT_NOT_FINAL', requestId }, 409);
      }
      projectId = normalize(visit.project_id) || null;
      if (!projectAllowed(claims, projectId)) return json({ error: 'PROJECT_ACCESS_DENIED', requestId }, 403);
      const duplicate = await env.DB.prepare(
        "SELECT id FROM core_workflow_requests WHERE organization_id=? AND workflow_type='visit_exception' AND subject_type='visit' AND subject_id=? AND status='pending' LIMIT 1"
      ).bind(organizationId, subjectId).first();
      if (duplicate) return json({ error: 'WORKFLOW_ALREADY_PENDING', workflowId: duplicate.id, requestId }, 409);
    } else if (!projectAllowed(claims, projectId)) {
      return json({ error: 'PROJECT_ACCESS_DENIED', requestId }, 403);
    }

    try {
      const id = await createWorkflowRequestInternal(env, {
        organizationId,
        workflowType,
        subjectType,
        subjectId,
        projectId,
        requestedBy: claims.sub,
        payload: body.payload || {},
      });
      return json({ ok: true, id, status: 'pending', requestId }, 201);
    } catch (error) {
      return json({ error: error?.message || 'WORKFLOW_CREATE_FAILED', requestId }, 400);
    }
  }

  if (url.pathname === '/api/workflows' && request.method === 'GET') {
    const status = normalize(url.searchParams.get('status'));
    const type = normalize(url.searchParams.get('type'));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    const clauses = ['organization_id=?'];
    const binds = [organizationId];
    if (status) { clauses.push('status=?'); binds.push(status); }
    if (type) { clauses.push('workflow_type=?'); binds.push(type); }
    if (!broadRole(role)) {
      if (role === 'manager' || role === 'supervisor') {
        const projects = Array.isArray(claims.projectIds) ? claims.projectIds.slice(0, 100) : [];
        if (projects.length) {
          clauses.push(`(requested_by=? OR project_id IN (${projects.map(() => '?').join(',')}))`);
          binds.push(claims.sub, ...projects);
        } else {
          clauses.push('requested_by=?'); binds.push(claims.sub);
        }
      } else {
        clauses.push('requested_by=?'); binds.push(claims.sub);
      }
    }
    const rows = await allRows(env.DB.prepare(`
      SELECT id,workflow_type,subject_type,subject_id,project_id,requested_by,status,current_step,version,created_at,updated_at,resolved_at
      FROM core_workflow_requests WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC LIMIT ?
    `).bind(...binds, limit));
    return json({ workflows: rows, requestId });
  }

  const detailMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)$/);
  if (detailMatch && request.method === 'GET') {
    const detail = await requestDetail(env, organizationId, decodeURIComponent(detailMatch[1]));
    if (!detail) return json({ error: 'WORKFLOW_NOT_FOUND', requestId }, 404);
    if (!canSeeRequest(claims, detail)) return json({ error: 'FORBIDDEN', requestId }, 403);
    return json({ workflow: detail, requestId });
  }

  const actionMatch = url.pathname.match(/^\/api\/workflows\/([^/]+)\/action$/);
  if (actionMatch && request.method === 'POST') {
    const id = decodeURIComponent(actionMatch[1]);
    const workflow = await loadRequest(env, organizationId, id);
    if (!workflow) return json({ error: 'WORKFLOW_NOT_FOUND', requestId }, 404);
    if (!canSeeRequest(claims, workflow) && !['admin', 'superadmin'].includes(role)) return json({ error: 'FORBIDDEN', requestId }, 403);
    const body = await request.json().catch(() => ({}));
    try {
      const status = await actOnRequest(env, claims, workflow, normalize(body.action).toLowerCase(), normalize(body.comment));
      return json({ ok: true, id, status, requestId });
    } catch (error) {
      const code = error?.message || 'WORKFLOW_ACTION_FAILED';
      const status = ['FORBIDDEN', 'SEPARATION_OF_DUTIES'].includes(code) ? 403 : code === 'WORKFLOW_ALREADY_RESOLVED' ? 409 : 400;
      return json({ error: code, requestId }, status);
    }
  }

  if (url.pathname === '/api/notifications' && request.method === 'GET') {
    const status = normalize(url.searchParams.get('status')) || 'unread';
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
    const rows = await allRows(env.DB.prepare(`
      SELECT id,notification_type,title,body,entity_type,entity_id,status,created_at,read_at
      FROM core_notifications
      WHERE organization_id=? AND status=? AND (user_id=? OR (user_id IS NULL AND target_role=?))
      ORDER BY created_at DESC LIMIT ?
    `).bind(organizationId, status, claims.sub, role, limit));
    return json({ notifications: rows, requestId });
  }

  const notificationMatch = url.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (notificationMatch && request.method === 'POST') {
    const id = decodeURIComponent(notificationMatch[1]);
    const result = await env.DB.prepare(`
      UPDATE core_notifications SET status='read',read_at=CURRENT_TIMESTAMP
      WHERE id=? AND organization_id=? AND status='unread'
        AND (user_id=? OR (user_id IS NULL AND target_role=?))
    `).bind(id, organizationId, claims.sub, role).run();
    if (!Number(result?.meta?.changes || 0)) return json({ error: 'NOTIFICATION_NOT_FOUND', requestId }, 404);
    return json({ ok: true, id, requestId });
  }

  return null;
}

export const __test = { ROLE_STEPS, CREATE_ROLES, projectAllowed };
