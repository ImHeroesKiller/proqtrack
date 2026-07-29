const clamp=(value,min,max,fallback)=>{const number=Number(value);return Number.isFinite(number)?Math.min(max,Math.max(min,Math.trunc(number))):fallback;};
const text=value=>String(value||'').trim();
const privileged=claims=>['super_admin','admin','manager'].includes(String(claims?.role||'').toLowerCase());
const listMeta=(url,total,limit,offset)=>({total:Number(total||0),limit,offset,nextOffset:offset+limit<Number(total||0)?offset+limit:null});

export async function handleIdentityRead({request,env,url,claims,requestId,json,audit}){
  const path=url.pathname;
  if(!path.startsWith('/api/identity/')&&!path.startsWith('/api/organization/')&&!path.startsWith('/api/access/'))return null;
  if(request.method!=='GET')return json({error:'READ_ONLY_ENDPOINT',requestId},405,{'allow':'GET'});
  if(!privileged(claims))return json({error:'FORBIDDEN',requestId},403);

  const limit=clamp(url.searchParams.get('limit'),1,100,25);
  const offset=clamp(url.searchParams.get('offset'),0,1_000_000,0);

  if(path==='/api/identity/employees'){
    const status=text(url.searchParams.get('status'));
    const unitId=text(url.searchParams.get('unitId'));
    const search=text(url.searchParams.get('search')).toLowerCase();
    const conditions=['e.deleted_at IS NULL'];
    const bindings=[];
    if(status){conditions.push('e.status=?');bindings.push(status);}
    if(unitId){conditions.push('oum.organization_unit_id=?');bindings.push(unitId);}
    if(search){conditions.push("(lower(e.full_name) LIKE ? OR lower(COALESCE(e.email,'')) LIKE ? OR lower(e.employee_number) LIKE ?)");const like=`%${search}%`;bindings.push(like,like,like);}
    const where=conditions.join(' AND ');
    const count=await env.DB.prepare(`SELECT COUNT(DISTINCT e.id) AS total FROM employees e LEFT JOIN organization_unit_memberships oum ON oum.employee_id=e.id AND oum.membership_type='primary' AND oum.status='active' AND oum.end_date IS NULL WHERE ${where}`).bind(...bindings).first();
    const rows=await env.DB.prepare(`SELECT e.id,e.employee_number,e.full_name,e.preferred_name,e.email,e.phone,e.worker_type,e.employment_type,e.join_date,e.end_date,e.status,e.photo_url,p.id AS position_id,p.code AS position_code,p.name AS position_name,p.category AS position_category,ou.id AS organization_unit_id,ou.code AS organization_unit_code,ou.name AS organization_unit_name,manager.id AS manager_id,manager.full_name AS manager_name FROM employees e LEFT JOIN employee_positions ep ON ep.employee_id=e.id AND ep.is_primary=1 AND ep.status='active' AND ep.end_date IS NULL LEFT JOIN positions p ON p.id=ep.position_id LEFT JOIN organization_unit_memberships oum ON oum.employee_id=e.id AND oum.membership_type='primary' AND oum.status='active' AND oum.end_date IS NULL LEFT JOIN organization_units ou ON ou.id=oum.organization_unit_id LEFT JOIN employee_reporting_lines erl ON erl.employee_id=e.id AND erl.is_primary=1 AND erl.status='active' AND erl.end_date IS NULL LEFT JOIN employees manager ON manager.id=erl.reports_to_employee_id WHERE ${where} ORDER BY e.full_name,e.id LIMIT ? OFFSET ?`).bind(...bindings,limit,offset).all();
    await audit(env,{requestId,actor:claims,action:'read',resourceType:'employees',detail:JSON.stringify({status,unitId,search,limit,offset})});
    return json({employees:rows.results||[],page:listMeta(url,count?.total,limit,offset),requestId});
  }

  const employeeMatch=path.match(/^\/api\/identity\/employees\/([^/]+)$/);
  if(employeeMatch){
    const id=decodeURIComponent(employeeMatch[1]);
    const employee=await env.DB.prepare(`SELECT e.*,p.id AS position_id,p.code AS position_code,p.name AS position_name,p.category AS position_category,ou.id AS organization_unit_id,ou.code AS organization_unit_code,ou.name AS organization_unit_name,manager.id AS manager_id,manager.full_name AS manager_name FROM employees e LEFT JOIN employee_positions ep ON ep.employee_id=e.id AND ep.is_primary=1 AND ep.status='active' AND ep.end_date IS NULL LEFT JOIN positions p ON p.id=ep.position_id LEFT JOIN organization_unit_memberships oum ON oum.employee_id=e.id AND oum.membership_type='primary' AND oum.status='active' AND oum.end_date IS NULL LEFT JOIN organization_units ou ON ou.id=oum.organization_unit_id LEFT JOIN employee_reporting_lines erl ON erl.employee_id=e.id AND erl.is_primary=1 AND erl.status='active' AND erl.end_date IS NULL LEFT JOIN employees manager ON manager.id=erl.reports_to_employee_id WHERE e.id=? AND e.deleted_at IS NULL`).bind(id).first();
    if(!employee)return json({error:'EMPLOYEE_NOT_FOUND',requestId},404);
    const roles=await env.DB.prepare(`SELECT r.code,r.name,ar.scope_type,ar.scope_id,ar.status,ar.start_at,ar.end_at FROM accounts a JOIN account_roles ar ON ar.account_id=a.id JOIN roles r ON r.id=ar.role_id WHERE a.employee_id=? ORDER BY ar.created_at DESC`).bind(id).all();
    await audit(env,{requestId,actor:claims,action:'read',resourceType:'employee',resourceId:id});
    return json({employee,accountRoles:roles.results||[],requestId});
  }

  if(path==='/api/identity/accounts'){
    const status=text(url.searchParams.get('status'));
    const role=text(url.searchParams.get('role'));
    const conditions=['a.deleted_at IS NULL'];const bindings=[];
    if(status){conditions.push('a.status=?');bindings.push(status);}
    if(role){conditions.push('r.code=?');bindings.push(role);}
    const where=conditions.join(' AND ');
    const count=await env.DB.prepare(`SELECT COUNT(DISTINCT a.id) AS total FROM accounts a LEFT JOIN account_roles ar ON ar.account_id=a.id AND ar.status='active' AND ar.end_at IS NULL LEFT JOIN roles r ON r.id=ar.role_id WHERE ${where}`).bind(...bindings).first();
    const rows=await env.DB.prepare(`SELECT a.id,a.email,a.employee_id,a.status,a.must_change_password,a.failed_login_attempts,a.locked_until,a.last_login_at,a.password_changed_at,a.created_at,a.updated_at,e.full_name AS employee_name,r.code AS role_code,r.name AS role_name,ar.scope_type,ar.scope_id FROM accounts a LEFT JOIN employees e ON e.id=a.employee_id LEFT JOIN account_roles ar ON ar.account_id=a.id AND ar.status='active' AND ar.end_at IS NULL LEFT JOIN roles r ON r.id=ar.role_id WHERE ${where} ORDER BY a.email LIMIT ? OFFSET ?`).bind(...bindings,limit,offset).all();
    await audit(env,{requestId,actor:claims,action:'read',resourceType:'accounts'});
    return json({accounts:rows.results||[],page:listMeta(url,count?.total,limit,offset),requestId});
  }

  if(path==='/api/organization/units'){
    const rows=await env.DB.prepare(`SELECT ou.id,ou.parent_unit_id,ou.code,ou.name,ou.unit_type,ou.status,COUNT(DISTINCT oum.employee_id) AS member_count FROM organization_units ou LEFT JOIN organization_unit_memberships oum ON oum.organization_unit_id=ou.id AND oum.status='active' AND oum.end_date IS NULL WHERE ou.deleted_at IS NULL GROUP BY ou.id ORDER BY CASE ou.unit_type WHEN 'company' THEN 0 WHEN 'division' THEN 1 WHEN 'department' THEN 2 WHEN 'region' THEN 3 WHEN 'area' THEN 4 WHEN 'branch' THEN 5 WHEN 'team' THEN 6 ELSE 7 END,ou.name`).all();
    return json({units:rows.results||[],requestId});
  }

  if(path==='/api/organization/positions'){
    const rows=await env.DB.prepare(`SELECT p.*,COUNT(DISTINCT ep.employee_id) AS employee_count FROM positions p LEFT JOIN employee_positions ep ON ep.position_id=p.id AND ep.status='active' AND ep.end_date IS NULL GROUP BY p.id ORDER BY p.level_rank DESC,p.name`).all();
    return json({positions:rows.results||[],requestId});
  }

  if(path==='/api/organization/reporting-lines'){
    const rows=await env.DB.prepare(`SELECT erl.id,erl.employee_id,e.full_name AS employee_name,erl.reports_to_employee_id,m.full_name AS manager_name,erl.relationship_type,erl.scope_type,erl.scope_id,erl.is_primary,erl.start_date,erl.end_date,erl.status FROM employee_reporting_lines erl JOIN employees e ON e.id=erl.employee_id JOIN employees m ON m.id=erl.reports_to_employee_id WHERE erl.status='active' AND erl.end_date IS NULL ORDER BY m.full_name,e.full_name LIMIT ? OFFSET ?`).bind(limit,offset).all();
    const count=await env.DB.prepare(`SELECT COUNT(*) AS total FROM employee_reporting_lines WHERE status='active' AND end_date IS NULL`).first();
    return json({reportingLines:rows.results||[],page:listMeta(url,count?.total,limit,offset),requestId});
  }

  if(path==='/api/access/roles'){
    const rows=await env.DB.prepare(`SELECT r.id,r.code,r.name,r.description,r.status,COUNT(DISTINCT rp.permission_id) AS permission_count,COUNT(DISTINCT CASE WHEN ar.status='active' AND ar.end_at IS NULL THEN ar.account_id END) AS active_account_count FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN account_roles ar ON ar.role_id=r.id GROUP BY r.id ORDER BY r.name`).all();
    return json({roles:rows.results||[],requestId});
  }

  const roleMatch=path.match(/^\/api\/access\/roles\/([^/]+)$/);
  if(roleMatch){
    const code=decodeURIComponent(roleMatch[1]);
    const role=await env.DB.prepare('SELECT id,code,name,description,status,created_at,updated_at FROM roles WHERE code=?').bind(code).first();
    if(!role)return json({error:'ROLE_NOT_FOUND',requestId},404);
    const permissions=await env.DB.prepare(`SELECT p.id,p.code,p.module,p.action,p.description FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=? ORDER BY p.module,p.action`).bind(role.id).all();
    return json({role,permissions:permissions.results||[],requestId});
  }

  return json({error:'NOT_FOUND',requestId},404);
}
