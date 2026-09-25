import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const BASE = process.env.PROQTRACK_BASE_URL || 'https://proqtrack.arywibowo.workers.dev';
const runKey = String(process.env.GITHUB_RUN_ID || Date.now()) + '-' + String(process.env.GITHUB_RUN_ATTEMPT || 1);
const safe = value => String(value).replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,80);
const key = safe(runKey);
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const now = new Date().toISOString();

const ids = {
  org:`ORG-UAT-FINAL-${key}`,
  client:`CL-UAT-FINAL-${key}`,
  project:`PRJ-UAT-FINAL-${key}`,
  supervisorEmp:`EMP-UAT-FINAL-SPV-${key}`,
  employeeEmp:`EMP-UAT-FINAL-EMP-${key}`,
  extraEmp:`EMP-UAT-FINAL-EXTRA-${key}`,
  outlet:`OUT-UAT-FINAL-${key}`,
  proposedOutlet:`OUT-UAT-FINAL-PROP-${key}`,
  proposal:`OPR-UAT-FINAL-${key}`,
  product:`PRD-UAT-FINAL-${key}`,
  survey:`SURV-UAT-FINAL-${key}`,
  visit:`VIS-UAT-FINAL-${key}`,
  cycle:`IC-UAT-FINAL-${key}`,
  response:`RESP-UAT-FINAL-${key}`,
  competitor:`CMP-UAT-FINAL-${key}`,
  competitorProduct:`CPD-UAT-FINAL-${key}`,
};

const password = () => randomBytes(24).toString('hex');
const hashPassword = plain => {
  const salt=randomBytes(16);
  const derived=pbkdf2Sync(Buffer.from(plain),salt,100000,32,'sha256');
  return `pbkdf2$sha256$100000$${salt.toString('base64url')}$${derived.toString('base64url')}`;
};
const actors = {
  head:{id:`USR-UAT-FINAL-HEAD-${key}`,email:`uat.final.head.${key}@proqtrack.id`,role:'head',pass:password()},
  admin:{id:`USR-UAT-FINAL-ADMIN-${key}`,email:`uat.final.admin.${key}@proqtrack.id`,role:'admin',pass:password()},
  manager:{id:`USR-UAT-FINAL-MGR-${key}`,email:`uat.final.manager.${key}@proqtrack.id`,role:'manager',pass:password()},
  supervisor:{id:`USR-UAT-FINAL-SPV-${key}`,email:`uat.final.supervisor.${key}@proqtrack.id`,role:'supervisor',pass:password(),employeeId:ids.supervisorEmp},
  employee:{id:`USR-UAT-FINAL-EMP-${key}`,email:`uat.final.employee.${key}@proqtrack.id`,role:'employee',pass:password(),employeeId:ids.employeeEmp},
};
for (const actor of Object.values(actors)) actor.hash=hashPassword(actor.pass);

const sqlq = value => String(value).replaceAll("'","''");
const expect = (condition,message) => { if(!condition) throw new Error(message); };

function d1(sql) {
  const out=execFileSync('npx',['wrangler','d1','execute','DB','--remote','--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const start=out.indexOf('[');
  if(start<0) throw new Error('D1 JSON output missing');
  return JSON.parse(out.slice(start));
}
function d1Row(sql) {
  const data=d1(sql);
  const entry=Array.isArray(data)?data.find(x=>Array.isArray(x?.results)):data;
  return entry?.results?.[0] || null;
}
async function api(path,{method='GET',token,body}={}) {
  const res=await fetch(BASE+path,{
    method,
    headers:{...(token?{authorization:`Bearer ${token}`}:{}),...(body?{'content-type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined,
  });
  const text=await res.text();
  let data={};
  try { data=JSON.parse(text); } catch { data={raw:text}; }
  return {status:res.status,data,headers:res.headers};
}
async function login(name,{device=false,deviceSuffix='A'}={}) {
  const actor=actors[name];
  const body={email:actor.email,password:actor.pass,organizationId:ids.org};
  if(device) Object.assign(body,{
    deviceId:`DEVICE-UAT-FINAL-${name}-${deviceSuffix}-${key}`,
    deviceProof:`PROOF-UAT-FINAL-${name}-${deviceSuffix}-${key}`,
    deviceLabel:'Final Full Production UAT',
  });
  const r=await api('/api/auth/login',{method:'POST',body});
  expect(r.status===200,`login ${name} HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  actor.token=r.data.token;
  expect(actor.token,`login ${name} token missing`);
}
async function session(name) {
  const actor=actors[name];
  const r=await api('/api/auth/session',{token:actor.token});
  expect(r.status===200,`session ${name} HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  expect(r.data.role===actor.role,`session ${name} role mismatch: ${r.data.role}`);
  expect(r.data.organizationId===ids.org,`session ${name} organization mismatch`);
  if(!['head','admin'].includes(actor.role)) expect(r.data.projectIds?.includes(ids.project),`session ${name} missing project`);
  if(actor.role==='employee') expect(r.data.deviceBound===true,'employee device binding missing');
  return r.data;
}
async function bootstrap(name) {
  const r=await api('/api/core/bootstrap',{token:actors[name].token});
  expect(r.status===200 && r.data.ok===true,`bootstrap ${name} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
let seq=0;
async function sync(name,label,changes,{status=200,error=''}={}) {
  const baseRevision=(await bootstrap(name)).revision;
  const r=await api('/api/core/sync',{
    method:'POST',token:actors[name].token,
    body:{mutationId:`UAT-FINAL-${key}-${++seq}`,baseRevision,changes},
  });
  expect(r.status===status,`${label} expected HTTP ${status} got ${r.status}: ${JSON.stringify(r.data)}`);
  if(status===200) expect(r.data.ok===true,`${label} expected ok=true`);
  if(error) expect(r.data.error===error,`${label} expected ${error} got ${JSON.stringify(r.data)}`);
  return r.data;
}

let cleaned=false;
function cleanup() {
  if(cleaned) return;
  try {
    d1(`
      DELETE FROM core_workflow_requests WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_report_schedules WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM report_generation_jobs WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_sync_conflicts WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_sync_mutations WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_operational_audit_logs WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_api_idempotency_keys WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_outlet_proposals WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_competitor_intel WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_price_observations WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_inventory_cycles WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_stocks WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_survey_responses WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_survey_questions WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_survey_templates WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_product_sales WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_attendance WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_visits WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_project_products WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_products WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_competitor_products WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_competitors WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_project_outlets WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_outlets WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_employee_project_assignments WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_project_memberships WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_employees WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_projects WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_clients WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_auth_devices WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_auth_sessions WHERE user_id IN ('${actors.head.id}','${actors.admin.id}','${actors.manager.id}','${actors.supervisor.id}','${actors.employee.id}');
      DELETE FROM core_sync_state WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_organization_users WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_organizations WHERE id='${sqlq(ids.org)}';
      DELETE FROM auth_users WHERE id IN ('${actors.head.id}','${actors.admin.id}','${actors.manager.id}','${actors.supervisor.id}','${actors.employee.id}');
    `);
    cleaned=true;
  } catch(error) {
    console.error('Final production UAT cleanup failed:',error?.message||error);
  }
}
process.on('SIGINT',()=>{cleanup();process.exit(130)});
process.on('SIGTERM',()=>{cleanup();process.exit(143)});

try {
  cleanup(); cleaned=false;
  d1(`
    INSERT INTO core_organizations(id,code,name,status,timezone,metadata_json,created_at,updated_at)
    VALUES('${ids.org}','UATFINAL-${key}','Final Full Production UAT','active','Asia/Jakarta','{"synthetic":true,"finalFullProductionUat":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_sync_state(organization_id,revision,cutover_mode,updated_at)
    VALUES('${ids.org}',0,'cloud',CURRENT_TIMESTAMP);

    INSERT INTO auth_users(id,email,password_hash,role,status,project_ids,client_ids,created_at) VALUES
      ('${actors.head.id}','${actors.head.email}','${actors.head.hash}','head','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.admin.id}','${actors.admin.email}','${actors.admin.hash}','admin','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.manager.id}','${actors.manager.email}','${actors.manager.hash}','manager','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.supervisor.id}','${actors.supervisor.email}','${actors.supervisor.hash}','supervisor','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.employee.id}','${actors.employee.email}','${actors.employee.hash}','employee','active','[]','[]',CURRENT_TIMESTAMP);

    INSERT INTO core_organization_users(organization_id,user_id,role,status,created_at,updated_at) VALUES
      ('${ids.org}','${actors.head.id}','head','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${actors.admin.id}','admin','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${actors.manager.id}','manager','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${actors.supervisor.id}','supervisor','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${actors.employee.id}','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

    INSERT INTO core_clients(id,organization_id,code,name,status,metadata_json,created_at,updated_at)
    VALUES('${ids.client}','${ids.org}','FINAL','Final UAT Client','active','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

    INSERT INTO core_projects(id,organization_id,client_id,code,name,status,starts_on,ends_on,metadata_json,created_at,updated_at)
    VALUES('${ids.project}','${ids.org}','${ids.client}','FINAL-UAT','Final Production UAT Project','active','2026-09-01','2027-12-31',
      '{"synthetic":true,"attendanceSourceMode":"visit","attendanceLateAfter":"09:00","outletApprovalMode":"auto","modules":{"newOutlet":true},"storeCatalog":{"allowNewOutlet":true}}',
      CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

    INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,created_at,updated_at) VALUES
      ('${ids.org}','${ids.project}','${actors.manager.id}','manager','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.project}','${actors.supervisor.id}','supervisor','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.project}','${actors.employee.id}','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

    INSERT INTO core_employees(id,organization_id,auth_user_id,employee_code,full_name,email,employment_status,metadata_json,created_at,updated_at) VALUES
      ('${ids.supervisorEmp}','${ids.org}','${actors.supervisor.id}','FINAL-SPV','Final UAT Supervisor','${actors.supervisor.email}','active','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.employeeEmp}','${ids.org}','${actors.employee.id}','FINAL-EMP','Final UAT Employee','${actors.employee.email}','active','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.extraEmp}','${ids.org}',NULL,'FINAL-EXTRA','Final UAT Extra Employee',NULL,'active','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

    INSERT INTO core_employee_project_assignments(id,organization_id,project_id,employee_id,supervisor_user_id,position_name,status,starts_on,ends_on,metadata_json,created_at,updated_at) VALUES
      ('ASG-FINAL-SPV-${key}','${ids.org}','${ids.project}','${ids.supervisorEmp}',NULL,'supervisor','active','2026-09-01','2027-12-31','{"synthetic":true,"roleOnProject":"supervisor","allocationPercent":100}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('ASG-FINAL-EMP-${key}','${ids.org}','${ids.project}','${ids.employeeEmp}','${actors.supervisor.id}','sales','active','2026-09-01','2027-12-31','{"synthetic":true,"roleOnProject":"sales","supervisorId":"${ids.supervisorEmp}","allocationPercent":100}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  `);

  await login('head');
  await login('admin');
  await login('manager');
  await login('supervisor');
  await login('employee',{device:true});

  for(const name of Object.keys(actors)) await session(name);

  const cross=await api('/api/auth/login',{method:'POST',body:{
    email:actors.employee.email,password:actors.employee.pass,organizationId:'ORG-DEFAULT',
    deviceId:`DEVICE-UAT-FINAL-employee-A-${key}`,deviceProof:`PROOF-UAT-FINAL-employee-A-${key}`,
  }});
  expect(cross.status===403,`cross-tenant employee login expected 403 got ${cross.status}`);

  const secondDevice=await api('/api/auth/login',{method:'POST',body:{
    email:actors.employee.email,password:actors.employee.pass,organizationId:ids.org,
    deviceId:`DEVICE-UAT-FINAL-employee-B-${key}`,deviceProof:`PROOF-UAT-FINAL-employee-B-${key}`,
  }});
  expect(secondDevice.status===403 && secondDevice.data.error==='DEVICE_ACCESS_DENIED',
    `second device expected DEVICE_ACCESS_DENIED got ${secondDevice.status} ${JSON.stringify(secondDevice.data)}`);

  // Clients + Projects authority.
  const adminBase=await bootstrap('admin');
  const client=adminBase.data.clients.find(row=>row.id===ids.client);
  const project=adminBase.data.projects.find(row=>row.id===ids.project);
  expect(client && project,'admin bootstrap missing client/project');
  await sync('admin','admin-client-update',[{entity:'clients',op:'upsert',row:{...client,name:'Final UAT Client Updated'}}]);
  await sync('admin','admin-project-update',[{entity:'projects',op:'upsert',row:{...project,name:'Final Production UAT Project Updated',outletApprovalMode:'auto'}}]);
  await sync('manager','manager-client-denied',[{entity:'clients',op:'upsert',row:{...client,name:'Forbidden Manager Client'}}],{status:403,error:'CHANGE_FORBIDDEN'});

  // Employees + Assignment. Use canonical project roles enforced by production authority.
  await sync('admin','admin-employee-assignment-update',[
    {entity:'employees',op:'upsert',row:{
      id:ids.extraEmp,employeeCode:'FINAL-EXTRA',name:'Final UAT Extra Employee Updated',status:'active'
    }},
    {entity:'projectAssignments',op:'upsert',row:{
      id:`ASG-FINAL-EMP-${key}`,projectId:ids.project,employeeId:ids.employeeEmp,
      roleOnProject:'sales',supervisorId:ids.supervisorEmp,status:'active',
      startDate:'2026-09-01',endDate:'2027-12-31',allocationPercent:100
    }}
  ]);
  const adminAfterAssignment=await bootstrap('admin');
  expect(adminAfterAssignment.data.employees?.some(row=>row.id===ids.extraEmp && row.name==='Final UAT Extra Employee Updated'),'employee module update did not persist');
  expect(adminAfterAssignment.data.projectAssignments?.some(row=>row.employeeId===ids.employeeEmp && (row.roleOnProject==='sales' || row.positionName==='sales')),'assignment module update did not persist');

  // Outlets + Products.
  await sync('manager','manager-outlet-create',[{entity:'outlets',op:'upsert',row:{
    id:ids.outlet,clientId:ids.client,projectIds:[ids.project],outletNumber:`FINAL-${key}`,name:'Final UAT Outlet',
    address:'Jakarta UAT',lat:-6.214620,lng:106.822900,geofenceRadiusM:100,status:'active'
  }}]);
  await sync('manager','manager-product-create',[{entity:'products',op:'upsert',row:{
    id:ids.product,clientId:ids.client,projectIds:[ids.project],sku:`SKU-FINAL-${key}`,name:'Final UAT Product',
    unit:'pcs',price:10000,status:'active'
  }}]);

  // Competitor authority.
  await sync('manager','manager-competitor-denied',[{entity:'competitors',op:'upsert',row:{
    id:ids.competitor,code:`CMP-${key}`,name:'Forbidden Manager Competitor',status:'active'
  }}],{status:403,error:'CHANGE_FORBIDDEN'});
  await sync('admin','admin-competitor-create',[
    {entity:'competitors',op:'upsert',row:{id:ids.competitor,code:`CMP-${key}`,name:'Final UAT Competitor',status:'active'}},
    {entity:'competitorProducts',op:'upsert',row:{id:ids.competitorProduct,competitorId:ids.competitor,sku:`CPD-${key}`,name:'Final UAT Competitor Product',unit:'pcs',typicalPrice:11000,status:'active'}}
  ]);

  // Outlet auto-approved acquisition by Employee.
  await sync('employee','employee-auto-outlet',[{entity:'outletProposals',op:'upsert',row:{
    id:ids.proposal,projectId:ids.project,outletId:ids.proposedOutlet,name:'Final Auto Outlet',address:'Jakarta Auto UAT',
    lat:-6.214700,lng:106.822950,outletNumber:`AUTO-${key}`,submittedAt:now
  }}]);
  const autoRow=d1Row(`SELECT status,supervisor_status,manager_status,outlet_id FROM core_outlet_proposals WHERE organization_id='${ids.org}' AND id='${ids.proposal}'`);
  expect(autoRow?.status==='approved' && autoRow?.supervisor_status==='approved' && autoRow?.manager_status==='approved','outlet auto approval failed');
  const autoMaster=d1Row(`SELECT id,status FROM core_outlets WHERE organization_id='${ids.org}' AND id='${ids.proposedOutlet}'`);
  expect(autoMaster?.status==='active','auto-approved outlet did not finalize master outlet');

  // Survey template.
  await sync('manager','manager-survey-template',[{entity:'surveyTemplates',op:'upsert',row:{
    id:ids.survey,clientId:ids.client,projectId:ids.project,name:'Final UAT Survey',status:'active',version:1
  }}]);

  // Visit lifecycle + GPS evidence.
  await sync('employee','employee-visit-plan',[{entity:'visits',op:'upsert',row:{
    id:ids.visit,projectId:ids.project,outletId:ids.outlet,employeeId:ids.employeeEmp,status:'planned',scheduledAt:now
  }}]);
  await sync('employee','employee-visit-checkin',[{entity:'visits',op:'upsert',row:{
    id:ids.visit,projectId:ids.project,outletId:ids.outlet,employeeId:ids.employeeEmp,status:'in_progress',
    scheduledAt:now,startedAt:now,checkInLat:-6.214620,checkInLng:106.822900,checkInAccuracyM:10,locationSource:'device_gps'
  }}]);
  await sync('employee','employee-visit-checkout',[{entity:'visits',op:'upsert',row:{
    id:ids.visit,projectId:ids.project,outletId:ids.outlet,employeeId:ids.employeeEmp,status:'completed',
    scheduledAt:now,startedAt:now,completedAt:new Date(Date.now()+60000).toISOString(),
    checkInLat:-6.214620,checkInLng:106.822900,checkOutLat:-6.214620,checkOutLng:106.822900,locationSource:'device_gps'
  }}]);

  // Stock/Sales governance and atomic derived sale.
  await sync('employee','employee-direct-stock-denied',[{entity:'stocks',op:'upsert',row:{
    id:`STK-FORGED-${key}`,projectId:ids.project,outletId:ids.outlet,productId:ids.product,quantity:999,minStock:1,updatedBy:ids.employeeEmp
  }}],{status:409,error:'STOCK_DIRECT_MUTATION_DISABLED'});
  await sync('employee','employee-manual-sale-denied',[{entity:'productSales',op:'upsert',row:{
    id:`SALE-FORGED-${key}`,projectId:ids.project,outletId:ids.outlet,employeeId:ids.employeeEmp,productId:ids.product,
    quantity:1,unitPrice:10000,totalAmount:10000,soldAt:now,idempotencyKey:`forged-${key}`,manualReason:'Employee must not create manual sale'
  }}],{status:403,error:'MANUAL_SALE_GOVERNANCE_REQUIRED'});
  await sync('employee','employee-inventory-finalize',[{entity:'inventoryCycles',op:'upsert',row:{
    id:ids.cycle,projectId:ids.project,outletId:ids.outlet,productId:ids.product,employeeId:ids.employeeEmp,visitId:ids.visit,
    cycleDate:today,status:'finalized',openingQty:0,stockInQty:20,adjustmentQty:0,returnQty:0,damagedQty:0,transferOutQty:0,closingQty:12
  }}]);

  const ledger=d1Row(`SELECT
    (SELECT quantity FROM core_stocks WHERE organization_id='${ids.org}' AND project_id='${ids.project}' AND outlet_id='${ids.outlet}' AND product_id='${ids.product}' LIMIT 1) stock_qty,
    (SELECT quantity FROM core_product_sales WHERE organization_id='${ids.org}' AND id='SALE-CYCLE-${ids.cycle}' LIMIT 1) sale_qty,
    (SELECT json_extract(metadata_json,'$.provenance') FROM core_product_sales WHERE organization_id='${ids.org}' AND id='SALE-CYCLE-${ids.cycle}' LIMIT 1) provenance;`);
  expect(Number(ledger?.stock_qty)===12,`derived stock expected 12 got ${ledger?.stock_qty}`);
  expect(Number(ledger?.sale_qty)===8,`derived sale expected 8 got ${ledger?.sale_qty}`);
  expect(ledger?.provenance==='derived_stock',`derived sale provenance mismatch: ${ledger?.provenance}`);

  // Survey response.
  await sync('employee','employee-survey-response',[{entity:'surveyResponses',op:'upsert',row:{
    id:ids.response,templateId:ids.survey,projectId:ids.project,outletId:ids.outlet,employeeId:ids.employeeEmp,visitId:ids.visit,
    status:'submitted',answers:{availability:true,score:5,notes:'Final production UAT'},submittedAt:now
  }}]);

  // Scoped visibility after field writes.
  const employeeData=await bootstrap('employee');
  expect(employeeData.data.employees?.every(row=>row.id===ids.employeeEmp),'employee bootstrap leaked other employees');
  expect(employeeData.data.visits?.every(row=>row.employeeId===ids.employeeEmp),'employee bootstrap leaked foreign visits');
  expect(employeeData.data.products?.some(row=>row.id===ids.product),'employee product catalog missing');
  expect(employeeData.data.outlets?.some(row=>row.id===ids.outlet),'employee outlet catalog missing');

  const supervisorData=await bootstrap('supervisor');
  expect(supervisorData.data.employees?.some(row=>row.id===ids.employeeEmp),'supervisor cannot see team employee');
  expect(supervisorData.data.visits?.some(row=>row.id===ids.visit),'supervisor cannot see team visit');

  // Analytics scope.
  const employeeAnalytics=await api(`/api/analytics/overview?projectId=${encodeURIComponent(ids.project)}`,{token:actors.employee.token});
  expect(employeeAnalytics.status===403,'employee analytics must be forbidden');
  for(const name of ['supervisor','manager','head','admin']) {
    const analytics=await api(`/api/analytics/overview?projectId=${encodeURIComponent(ids.project)}&from=${today}&to=${today}`,{token:actors[name].token});
    expect(analytics.status===200,`analytics ${name} HTTP ${analytics.status}: ${JSON.stringify(analytics.data)}`);
    expect(Number(analytics.data.kpis?.visits?.total||0)>=1,`analytics ${name} visit missing`);
    expect(Number(analytics.data.kpis?.sales?.transactions||0)>=1,`analytics ${name} sales missing`);
    expect(Number(analytics.data.kpis?.surveys?.responses||0)>=1,`analytics ${name} survey missing`);
  }

  // Reports: employee denied, supervisor can create/list/cancel, manager can schedule.
  const employeeReport=await api('/api/reports',{method:'POST',token:actors.employee.token,body:{
    reportType:'operational_summary',format:'json',projectId:ids.project,name:'Employee forbidden report'
  }});
  expect(employeeReport.status===403,'employee report create must be forbidden');

  const reportCreate=await api('/api/reports',{method:'POST',token:actors.supervisor.token,body:{
    reportType:'operational_summary',format:'json',projectId:ids.project,name:'Final UAT Operational Summary'
  }});
  expect(reportCreate.status===202 && reportCreate.data.id,`supervisor report create failed: ${reportCreate.status} ${JSON.stringify(reportCreate.data)}`);
  const reportList=await api('/api/reports?limit=10',{token:actors.supervisor.token});
  expect(reportList.status===200 && reportList.data.reports?.some(row=>row.id===reportCreate.data.id),'supervisor report list missing created job');
  const reportCancel=await api(`/api/reports/${encodeURIComponent(reportCreate.data.id)}/cancel`,{method:'POST',token:actors.supervisor.token,body:{}});
  expect(reportCancel.status===200 && reportCancel.data.status==='cancelled',`report cancel failed: ${reportCancel.status}`);

  const scheduleCreate=await api('/api/report-schedules',{method:'POST',token:actors.manager.token,body:{
    reportType:'sales',format:'csv',projectId:ids.project,name:'Final UAT Daily Sales',cadence:'daily',runHour:7,timezone:'Asia/Jakarta'
  }});
  expect(scheduleCreate.status===201 && scheduleCreate.data.id,`report schedule create failed: ${scheduleCreate.status} ${JSON.stringify(scheduleCreate.data)}`);
  const schedulePause=await api(`/api/report-schedules/${encodeURIComponent(scheduleCreate.data.id)}/status`,{method:'POST',token:actors.manager.token,body:{status:'paused'}});
  expect(schedulePause.status===200 && schedulePause.data.status==='paused','report schedule pause failed');

  // Account/Settings authority boundary.
  for(const name of ['head','admin']) {
    const accounts=await api('/api/admin/accounts',{token:actors[name].token});
    expect(accounts.status===200,`${name} account management expected 200 got ${accounts.status}`);
  }
  for(const name of ['manager','supervisor','employee']) {
    const accounts=await api('/api/admin/accounts',{token:actors[name].token});
    expect(accounts.status===403,`${name} account management expected 403 got ${accounts.status}`);
  }

  // Final database invariants.
  const final=d1Row(`SELECT
    (SELECT COUNT(*) FROM core_clients WHERE organization_id='${ids.org}' AND id='${ids.client}' AND name='Final UAT Client Updated') client_ok,
    (SELECT COUNT(*) FROM core_projects WHERE organization_id='${ids.org}' AND id='${ids.project}' AND name='Final Production UAT Project Updated') project_ok,
    (SELECT COUNT(*) FROM core_employees WHERE organization_id='${ids.org}' AND id='${ids.extraEmp}' AND full_name='Final UAT Extra Employee Updated') employee_ok,
    (SELECT COUNT(*) FROM core_employee_project_assignments WHERE organization_id='${ids.org}' AND id='ASG-FINAL-EMP-${key}' AND employee_id='${ids.employeeEmp}' AND position_name='sales' AND status='active' AND row_version>=2) assignment_ok,
    (SELECT COUNT(*) FROM core_outlets WHERE organization_id='${ids.org}' AND id IN ('${ids.outlet}','${ids.proposedOutlet}') AND status='active') outlets_ok,
    (SELECT COUNT(*) FROM core_products WHERE organization_id='${ids.org}' AND id='${ids.product}' AND status='active') product_ok,
    (SELECT COUNT(*) FROM core_competitors WHERE organization_id='${ids.org}' AND id='${ids.competitor}') competitor_ok,
    (SELECT COUNT(*) FROM core_visits WHERE organization_id='${ids.org}' AND id='${ids.visit}' AND status='completed') visit_ok,
    (SELECT COUNT(*) FROM core_survey_responses WHERE organization_id='${ids.org}' AND id='${ids.response}' AND status='submitted') survey_ok;`);
  expect(Number(final.client_ok)===1,'client invariant failed');
  expect(Number(final.project_ok)===1,'project invariant failed');
  expect(Number(final.employee_ok)===1,'employee invariant failed');
  expect(Number(final.assignment_ok)===1,'assignment invariant failed');
  expect(Number(final.outlets_ok)===2,'outlet invariant failed');
  expect(Number(final.product_ok)===1,'product invariant failed');
  expect(Number(final.competitor_ok)===1,'competitor invariant failed');
  expect(Number(final.visit_ok)===1,'visit invariant failed');
  expect(Number(final.survey_ok)===1,'survey invariant failed');

  cleanup();
  const residual=d1Row(`SELECT
    (SELECT COUNT(*) FROM core_organizations WHERE id='${ids.org}') organizations,
    (SELECT COUNT(*) FROM auth_users WHERE id IN ('${actors.head.id}','${actors.admin.id}','${actors.manager.id}','${actors.supervisor.id}','${actors.employee.id}')) users,
    (SELECT COUNT(*) FROM core_visits WHERE organization_id='${ids.org}') visits,
    (SELECT COUNT(*) FROM core_product_sales WHERE organization_id='${ids.org}') sales,
    (SELECT COUNT(*) FROM report_generation_jobs WHERE organization_id='${ids.org}') reports;`);
  expect(Object.values(residual||{}).every(v=>Number(v)===0),`cleanup residual ${JSON.stringify(residual)}`);

  console.log('Final full-production UAT PASS: Head/Admin/Manager/Supervisor/Employee; Clients, Projects, Assignments/Employees, Outlets Auto Approved, Products, Competitors, Visits/GPS, Stock Ledger/Derived Sales, Surveys, Analytics, Reports/Schedules, Account boundaries, tenant/device isolation, cleanup');
} catch(error) {
  console.error('Final full-production UAT FAILED:',error?.stack||error);
  process.exitCode=1;
} finally {
  cleanup();
}
