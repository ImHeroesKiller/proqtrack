import { execFileSync } from 'node:child_process';
import { randomBytes, pbkdf2Sync } from 'node:crypto';

const BASE = process.env.PROQTRACK_BASE_URL || 'https://proqtrack.arywibowo.workers.dev';
const runKey = ${process.env.GITHUB_RUN_ID || 'local'}-${process.env.GITHUB_RUN_ATTEMPT || '1'};
const ids = {
  org:`ORG-UAT-AL-${runKey}`, client:`CL-UAT-AL-${runKey}`,
  manual:`PRJ-UAT-AL-MANUAL-${runKey}`, visit:`PRJ-UAT-AL-VISIT-${runKey}`,
  outlet:`OUT-UAT-AL-${runKey}`,
  manager:`USR-UAT-AL-MANAGER-${runKey}`, supervisor:`USR-UAT-AL-SUPERVISOR-${runKey}`,
  manualUser:`USR-UAT-AL-EMP-MANUAL-${runKey}`, visitUser:`USR-UAT-AL-EMP-VISIT-${runKey}`,
  manualEmp:`EMP-UAT-AL-MANUAL-${runKey}`, visitEmp:`EMP-UAT-AL-VISIT-${runKey}`, otherEmp:`EMP-UAT-AL-OTHER-${runKey}`,
  manualAtt:`UAT-AL-ATT-MANUAL-${runKey}`, visitDirect:`UAT-AL-ATT-VISIT-DIRECT-${runKey}`,
  visitId:`UAT-AL-VISIT-${runKey}`,
  leaveWithdraw:`UAT-AL-LEAVE-WITHDRAW-${runKey}`, leaveApprove:`UAT-AL-LEAVE-APPROVE-${runKey}`,
  leaveConflict:`UAT-AL-LEAVE-CONFLICT-${runKey}`, leaveSelf:`UAT-AL-LEAVE-SELF-${runKey}`,
};
const sqlq = value => String(value).replaceAll("'", "''");
const jakartaDate = offsetDays => {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
};
const today=jakartaDate(0), starts=jakartaDate(-1), ends=jakartaDate(30);
const future1=jakartaDate(2), future2=jakartaDate(3), future3=jakartaDate(5), future4=jakartaDate(7);
const visitStart=`${today}T08:10:00+07:00`, visitEnd=`${today}T17:10:00+07:00`;
const password = () => randomBytes(24).toString('hex');
const hashPassword = plain => {
  const salt=randomBytes(16), derived=pbkdf2Sync(Buffer.from(plain),salt,100000,32,'sha256');
  return `pbkdf2$sha256$100000$${salt.toString('base64url')}$${derived.toString('base64url')}`;
};
const actors = {
  manager:{id:ids.manager,email:`uat.al.manager.${runKey}@proqtrack.id`,role:'manager',pass:password()},
  supervisor:{id:ids.supervisor,email:`uat.al.supervisor.${runKey}@proqtrack.id`,role:'supervisor',pass:password()},
  manual:{id:ids.manualUser,email:`uat.al.manual.${runKey}@proqtrack.id`,role:'employee',pass:password(),employeeId:ids.manualEmp},
  visit:{id:ids.visitUser,email:`uat.al.visit.${runKey}@proqtrack.id`,role:'employee',pass:password(),employeeId:ids.visitEmp},
};
for (const actor of Object.values(actors)) actor.hash=hashPassword(actor.pass);

function d1(sql) {
  const out=execFileSync('npx',['wrangler','d1','execute','DB','--remote','--json','--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const start=out.indexOf('[');
  if(start<0) throw new Error('D1 JSON output missing');
  return JSON.parse(out.slice(start));
}
function d1Row(sql) {
  const data=d1(sql), entry=Array.isArray(data)?data.find(x=>Array.isArray(x?.results)):data;
  return entry?.results?.[0] || null;
}
async function api(path,{method='GET',token,body}={}) {
  const res=await fetch(BASE+path,{method,headers:{...(token?{authorization:`Bearer ${token}`}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const text=await res.text(); let data={};
  try{data=JSON.parse(text)}catch{data={raw:text}}
  return {status:res.status,data};
}
const expect=(condition,message)=>{if(!condition) throw new Error(message)};
async function login(name,device=false) {
  const a=actors[name];
  const body={email:a.email,password:a.pass,organizationId:ids.org};
  if(device) Object.assign(body,{deviceId:`DEVICE-UAT-AL-${name}-${runKey}`,deviceProof:`PROOF-UAT-AL-${name}-${runKey}`,deviceLabel:'Attendance Leave Final UAT'});
  const r=await api('/api/auth/login',{method:'POST',body});
  expect(r.status===200,`login ${name} HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  a.token=r.data.token; expect(a.token,`login ${name} token missing`);
}
async function session(name,projects) {
  const r=await api('/api/auth/session',{token:actors[name].token});
  expect(r.status===200,`session ${name} HTTP ${r.status}`);
  expect(r.data.role===actors[name].role,`session ${name} role ${r.data.role}`);
  expect(r.data.organizationId===ids.org,`session ${name} org mismatch`);
  for(const project of projects) expect(r.data.projectIds?.includes(project),`session ${name} missing project ${project}`);
}
async function bootstrap(name) {
  const r=await api('/api/core/bootstrap',{token:actors[name].token});
  expect(r.status===200 && r.data.ok===true,`bootstrap ${name} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
let seq=0;
async function sync(name,label,changes,status=200,error='') {
  const baseRevision=(await bootstrap(name)).revision;
  const r=await api('/api/core/sync',{method:'POST',token:actors[name].token,body:{mutationId:`UAT-AL-${runKey}-${++seq}`,baseRevision,changes}});
  expect(r.status===status,`${label} expected HTTP ${status} got ${r.status}: ${JSON.stringify(r.data)}`);
  if(status===200) expect(r.data.ok===true,`${label} expected ok=true`);
  else expect(r.data.error===error,`${label} expected ${error} got ${JSON.stringify(r.data)}`);
}

let cleaned=false;
function cleanup() {
  if(cleaned) return;
  try {
    d1(`
      DELETE FROM core_sync_conflicts WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_sync_mutations WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_operational_audit_logs WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_api_idempotency_keys WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_leaves WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_attendance WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_visits WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_project_outlets WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_employee_project_assignments WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_project_memberships WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_employees WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_outlets WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_projects WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_clients WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_auth_devices WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_auth_sessions WHERE user_id IN ('${ids.manager}','${ids.supervisor}','${ids.manualUser}','${ids.visitUser}');
      DELETE FROM core_sync_state WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_organization_users WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_organizations WHERE id='${sqlq(ids.org)}';
      DELETE FROM auth_users WHERE id IN ('${ids.manager}','${ids.supervisor}','${ids.manualUser}','${ids.visitUser}');
    `);
    cleaned=true;
  } catch(error) { console.error('UAT cleanup failed',error.message); }
}
process.on('SIGINT',()=>{cleanup();process.exit(130)});
process.on('SIGTERM',()=>{cleanup();process.exit(143)});

try {
  cleanup();
  cleaned=false;
  d1(`
    INSERT INTO core_organizations(id,code,name,status,timezone,metadata_json,created_at,updated_at)
    VALUES('${ids.org}','UATAL-${runKey}','Attendance Leave Final UAT','active','Asia/Jakarta','{"synthetic":true,"attendanceLeaveFinalUat":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_sync_state(organization_id,revision,cutover_mode,updated_at) VALUES('${ids.org}',0,'cloud',CURRENT_TIMESTAMP);
    INSERT INTO auth_users(id,email,password_hash,role,status,project_ids,client_ids,created_at) VALUES
      ('${actors.manager.id}','${actors.manager.email}','${actors.manager.hash}','manager','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.supervisor.id}','${actors.supervisor.email}','${actors.supervisor.hash}','supervisor','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.manual.id}','${actors.manual.email}','${actors.manual.hash}','employee','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.visit.id}','${actors.visit.email}','${actors.visit.hash}','employee','active','[]','[]',CURRENT_TIMESTAMP);
    INSERT INTO core_organization_users(organization_id,user_id,role,status,created_at,updated_at) VALUES
      ('${ids.org}','${ids.manager}','manager','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.supervisor}','supervisor','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.manualUser}','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.visitUser}','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_clients(id,organization_id,code,name,status,metadata_json,created_at,updated_at)
      VALUES('${ids.client}','${ids.org}','UAT-AL','Attendance Leave UAT Client','active','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_projects(id,organization_id,client_id,code,name,status,starts_on,ends_on,metadata_json,created_at,updated_at) VALUES
      ('${ids.manual}','${ids.org}','${ids.client}','UAT-AL-MANUAL','Attendance Manual UAT','active','${starts}','${ends}','{"attendanceSourceMode":"manual","attendanceLateAfter":"09:00","synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.visit}','${ids.org}','${ids.client}','UAT-AL-VISIT','Attendance Visit UAT','active','${starts}','${ends}','{"attendanceSourceMode":"visit","attendanceLateAfter":"09:00","synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,created_at,updated_at) VALUES
      ('${ids.org}','${ids.manual}','${ids.manager}','manager','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.visit}','${ids.manager}','manager','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.manual}','${ids.supervisor}','supervisor','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.visit}','${ids.supervisor}','supervisor','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.manual}','${ids.manualUser}','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.visit}','${ids.visitUser}','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_employees(id,organization_id,auth_user_id,employee_code,full_name,email,employment_status,metadata_json,created_at,updated_at) VALUES
      ('${ids.manualEmp}','${ids.org}','${ids.manualUser}','UAT-AL-MANUAL','UAT Manual Employee','${actors.manual.email}','active','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.visitEmp}','${ids.org}','${ids.visitUser}','UAT-AL-VISIT','UAT Visit Employee','${actors.visit.email}','active','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.otherEmp}','${ids.org}',NULL,'UAT-AL-OTHER','UAT Other Employee',NULL,'active','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_employee_project_assignments(id,organization_id,project_id,employee_id,supervisor_user_id,position_name,status,starts_on,ends_on,metadata_json,created_at,updated_at) VALUES
      ('ASG-UAT-AL-MANUAL-${runKey}','${ids.org}','${ids.manual}','${ids.manualEmp}','${ids.supervisor}','Field Employee','active','${starts}','${ends}','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('ASG-UAT-AL-OTHER-${runKey}','${ids.org}','${ids.manual}','${ids.otherEmp}','${ids.supervisor}','Field Employee','active','${starts}','${ends}','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('ASG-UAT-AL-VISIT-${runKey}','${ids.org}','${ids.visit}','${ids.visitEmp}','${ids.supervisor}','Field Employee','active','${starts}','${ends}','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_outlets(id,organization_id,client_id,code,name,address,latitude,longitude,geofence_radius_m,status,metadata_json,created_at,updated_at)
      VALUES('${ids.outlet}','${ids.org}','${ids.client}','UAT-AL-OUTLET','Attendance Visit UAT Outlet','Jakarta UAT',-6.214620,106.822900,100,'active','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_project_outlets(organization_id,project_id,outlet_id,status,created_at)
      VALUES('${ids.org}','${ids.visit}','${ids.outlet}','active',CURRENT_TIMESTAMP);
  `);

  await login('manager'); await login('supervisor'); await login('manual',true); await login('visit',true);
  await session('manager',[ids.manual,ids.visit]); await session('supervisor',[ids.manual,ids.visit]);
  await session('manual',[ids.manual]); await session('visit',[ids.visit]);

  await sync('manual','manual-checkin',[{entity:'attendance',op:'upsert',row:{id:ids.manualAtt,projectId:ids.manual,employeeId:ids.manualEmp,workDate:today,checkInAt:'08:05'}}]);
  await sync('manual','employee-self-only',[{entity:'attendance',op:'upsert',row:{id:`UAT-AL-ATT-OTHER-${runKey}`,projectId:ids.manual,employeeId:ids.otherEmp,workDate:today,checkInAt:'08:10'}}],403,'ATTENDANCE_SELF_ONLY');
  await sync('manual','manual-checkout',[{entity:'attendance',op:'upsert',row:{id:ids.manualAtt,projectId:ids.manual,employeeId:ids.manualEmp,workDate:today,checkOutAt:'17:15'}}]);
  await sync('manual','employee-correction-denied',[{entity:'attendance',op:'upsert',row:{id:ids.manualAtt,projectId:ids.manual,employeeId:ids.manualEmp,workDate:today,status:'late',checkInAt:'09:10',checkOutAt:'17:15',correctionReason:'Employee correction must be denied'}}],403,'ATTENDANCE_CORRECTION_FORBIDDEN');
  await sync('supervisor','supervisor-correction',[{entity:'attendance',op:'upsert',row:{id:ids.manualAtt,projectId:ids.manual,employeeId:ids.manualEmp,workDate:today,status:'late',checkInAt:'09:10',checkOutAt:'17:15',correctionReason:'Supervisor correction UAT'}}]);
  await sync('manager','manager-correction',[{entity:'attendance',op:'upsert',row:{id:ids.manualAtt,projectId:ids.manual,employeeId:ids.manualEmp,workDate:today,status:'present',checkInAt:'08:05',checkOutAt:'17:15',correctionReason:'Manager final correction UAT'}}]);

  await sync('visit','visit-direct-attendance-denied',[{entity:'attendance',op:'upsert',row:{id:ids.visitDirect,projectId:ids.visit,employeeId:ids.visitEmp,workDate:today,checkInAt:'08:10'}}],409,'ATTENDANCE_VISIT_DERIVED_ONLY');
  await sync('visit','visit-plan',[{entity:'visits',op:'upsert',row:{id:ids.visitId,projectId:ids.visit,outletId:ids.outlet,employeeId:ids.visitEmp,status:'planned',scheduledAt:visitStart}}]);
  await sync('visit','visit-checkin',[{entity:'visits',op:'upsert',row:{id:ids.visitId,projectId:ids.visit,outletId:ids.outlet,employeeId:ids.visitEmp,status:'in_progress',scheduledAt:visitStart,startedAt:visitStart,checkInTime:'08:10',locationSource:'device_gps',checkInLat:-6.214620,checkInLng:106.822900}}]);
  const visitAttendance=d1Row(`SELECT id FROM core_attendance WHERE organization_id='${ids.org}' AND project_id='${ids.visit}' AND employee_id='${ids.visitEmp}' AND work_date='${today}' LIMIT 1;`)?.id;
  expect(visitAttendance,'visit-derived attendance missing after check-in');
  await sync('supervisor','visit-attendance-correction-denied',[{entity:'attendance',op:'upsert',row:{id:visitAttendance,projectId:ids.visit,employeeId:ids.visitEmp,workDate:today,status:'late',checkInAt:'09:10',correctionReason:'Visit attendance correction denied'}}],409,'ATTENDANCE_VISIT_DERIVED_IMMUTABLE');
  await sync('visit','visit-checkout',[{entity:'visits',op:'upsert',row:{id:ids.visitId,projectId:ids.visit,outletId:ids.outlet,employeeId:ids.visitEmp,status:'completed',scheduledAt:visitStart,startedAt:visitStart,checkInTime:'08:10',completedAt:visitEnd,checkOutTime:'17:10',checkOutLat:-6.214620,checkOutLng:106.822900}}]);

  await sync('manual','leave-submit-withdraw',[{entity:'leaves',op:'upsert',row:{id:ids.leaveWithdraw,employeeId:ids.manualEmp,type:'Cuti Tahunan',startDate:future1,endDate:future1,reason:'Initial UAT leave request'}}]);
  await sync('manual','leave-edit',[{entity:'leaves',op:'upsert',row:{id:ids.leaveWithdraw,employeeId:ids.manualEmp,type:'Cuti Tahunan',startDate:future2,endDate:future2,reason:'Edited UAT leave request',status:'pending'}}]);
  await sync('manual','leave-withdraw',[{entity:'leaves',op:'upsert',row:{id:ids.leaveWithdraw,employeeId:ids.manualEmp,status:'rejected',decisionKind:'withdrawn',decisionNote:'Schedule changed during final UAT'}}]);

  await sync('visit','leave-submit-supervisor',[{entity:'leaves',op:'upsert',row:{id:ids.leaveApprove,employeeId:ids.visitEmp,type:'Izin',startDate:future3,endDate:future3,reason:'Supervisor approval UAT'}}]);
  await sync('supervisor','leave-supervisor-approve',[{entity:'leaves',op:'upsert',row:{id:ids.leaveApprove,employeeId:ids.visitEmp,status:'approved',decisionNote:'Approved by supervisor in final UAT'}}]);

  await sync('manual','leave-submit-conflict',[{entity:'leaves',op:'upsert',row:{id:ids.leaveConflict,employeeId:ids.manualEmp,type:'Izin',startDate:today,endDate:today,reason:'Attendance conflict final UAT'}}]);
  await sync('manager','leave-approve-conflict',[{entity:'leaves',op:'upsert',row:{id:ids.leaveConflict,employeeId:ids.manualEmp,status:'approved',decisionNote:'Should fail because attendance exists'}}],409,'LEAVE_ATTENDANCE_CONFLICT');
  await sync('manager','leave-reject-note-required',[{entity:'leaves',op:'upsert',row:{id:ids.leaveConflict,employeeId:ids.manualEmp,status:'rejected',decisionNote:''}}],422,'LEAVE_REJECTION_NOTE_REQUIRED');
  await sync('manager','leave-manager-reject',[{entity:'leaves',op:'upsert',row:{id:ids.leaveConflict,employeeId:ids.manualEmp,status:'rejected',decisionNote:'Rejected after attendance conflict validation'}}]);

  await sync('manual','leave-submit-self',[{entity:'leaves',op:'upsert',row:{id:ids.leaveSelf,employeeId:ids.manualEmp,type:'Cuti Tahunan',startDate:future4,endDate:future4,reason:'Self decision denial UAT'}}]);
  await sync('manual','leave-self-approval-denied',[{entity:'leaves',op:'upsert',row:{id:ids.leaveSelf,employeeId:ids.manualEmp,status:'approved',decisionNote:'Must not self approve'}}],403,'LEAVE_DECISION_FORBIDDEN');

  for(const [name,employee,project] of [['manual',ids.manualEmp,ids.manual],['visit',ids.visitEmp,ids.visit]]) {
    const data=await bootstrap(name), attendance=data.data?.attendance||[], leaves=data.data?.leaves||[], projects=data.data?.projects||[];
    expect(attendance.every(x=>x.employeeId===employee),`employee ${name} saw foreign attendance`);
    expect(leaves.every(x=>x.employeeId===employee),`employee ${name} saw foreign leave`);
    expect(projects.some(x=>x.id===project),`employee ${name} missing project`);
  }
  for(const name of ['supervisor','manager']) {
    const data=await bootstrap(name), attendance=data.data?.attendance||[], leaves=data.data?.leaves||[];
    const ae=new Set(attendance.map(x=>x.employeeId)), le=new Set(leaves.map(x=>x.employeeId));
    expect(ae.has(ids.manualEmp)&&ae.has(ids.visitEmp),`${name} cannot see both attendance sources`);
    expect(le.has(ids.manualEmp)&&le.has(ids.visitEmp),`${name} cannot see both leave scopes`);
    const p=data.data?.projects||[];
    expect(p.find(x=>x.id===ids.manual)?.attendanceSourceMode==='manual',`${name} manual mode missing`);
    expect(p.find(x=>x.id===ids.visit)?.attendanceSourceMode==='visit',`${name} visit mode missing`);
  }

  const final=d1Row(`SELECT
    (SELECT COUNT(*) FROM core_attendance WHERE organization_id='${ids.org}' AND project_id='${ids.manual}' AND employee_id='${ids.manualEmp}' AND work_date='${today}') manual_count,
    (SELECT COUNT(*) FROM core_attendance WHERE organization_id='${ids.org}' AND project_id='${ids.visit}' AND employee_id='${ids.visitEmp}' AND work_date='${today}') visit_count,
    (SELECT json_extract(metadata_json,'$.attendanceSource') FROM core_attendance WHERE organization_id='${ids.org}' AND id='${ids.manualAtt}') manual_source,
    (SELECT json_extract(metadata_json,'$.correctionCount') FROM core_attendance WHERE organization_id='${ids.org}' AND id='${ids.manualAtt}') correction_count,
    (SELECT json_extract(metadata_json,'$.correctedBy') FROM core_attendance WHERE organization_id='${ids.org}' AND id='${ids.manualAtt}') corrected_by,
    (SELECT check_out_at FROM core_attendance WHERE organization_id='${ids.org}' AND project_id='${ids.visit}' AND employee_id='${ids.visitEmp}' AND work_date='${today}') visit_checkout,
    (SELECT status FROM core_leaves WHERE organization_id='${ids.org}' AND id='${ids.leaveWithdraw}') withdraw_status,
    (SELECT json_extract(metadata_json,'$.decisionKind') FROM core_leaves WHERE organization_id='${ids.org}' AND id='${ids.leaveWithdraw}') withdraw_kind,
    (SELECT status FROM core_leaves WHERE organization_id='${ids.org}' AND id='${ids.leaveApprove}') approved_status,
    (SELECT approver_id FROM core_leaves WHERE organization_id='${ids.org}' AND id='${ids.leaveApprove}') approved_by,
    (SELECT status FROM core_leaves WHERE organization_id='${ids.org}' AND id='${ids.leaveConflict}') conflict_status,
    (SELECT approver_id FROM core_leaves WHERE organization_id='${ids.org}' AND id='${ids.leaveConflict}') conflict_by;`);
  expect(Number(final.manual_count)===1&&Number(final.visit_count)===1,'attendance cardinality invariant failed');
  expect(final.manual_source==='manual','manual source invariant failed');
  expect(Number(final.correction_count)===2&&final.corrected_by===ids.manager,'correction audit invariant failed');
  expect(final.visit_checkout,'visit-derived checkout missing');
  expect(final.withdraw_status==='rejected'&&final.withdraw_kind==='withdrawn','withdraw audit invariant failed');
  expect(final.approved_status==='approved'&&final.approved_by===ids.supervisor,'supervisor approval invariant failed');
  expect(final.conflict_status==='rejected'&&final.conflict_by===ids.manager,'manager rejection invariant failed');

  cleanup();
  const residual=d1Row(`SELECT
    (SELECT COUNT(*) FROM core_organizations WHERE id='${ids.org}') organizations,
    (SELECT COUNT(*) FROM auth_users WHERE id IN ('${ids.manager}','${ids.supervisor}','${ids.manualUser}','${ids.visitUser}')) users,
    (SELECT COUNT(*) FROM core_attendance WHERE organization_id='${ids.org}') attendance,
    (SELECT COUNT(*) FROM core_leaves WHERE organization_id='${ids.org}') leaves;`);
  expect(Object.values(residual).every(v=>Number(v)===0),`cleanup residual ${JSON.stringify(residual)}`);
  console.log('Attendance + Leave final production UAT PASS: Manager/Supervisor/Employee, Manual/Visit, lifecycle, correction governance, Leave governance, role isolation, and cleanup');
} catch(error) {
  console.error('Attendance + Leave final production UAT FAILED:',error?.stack||error);
  process.exitCode=1;
} finally {
  cleanup();
}