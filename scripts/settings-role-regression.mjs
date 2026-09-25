import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { settingsTabsFor } from '../src/lib/settings-ui.js';

const BASE = process.env.PROQTRACK_BASE_URL || 'https://proqtrack.arywibowo.workers.dev';
const runKey = `${process.env.GITHUB_RUN_ID || 'local'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`;
const ids = {
  org:`ORG-UAT-SETTINGS-${runKey}`,
  client:`CL-UAT-SETTINGS-${runKey}`,
  project:`PRJ-UAT-SETTINGS-${runKey}`,
  employee:`EMP-UAT-SETTINGS-${runKey}`,
  assignment:`ASG-UAT-SETTINGS-${runKey}`,
};

const sqlq = value => String(value).replaceAll("'", "''");
const makePassword = () => randomBytes(24).toString('hex');
const hashPassword = plain => {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(Buffer.from(plain),salt,100000,32,'sha256');
  return `pbkdf2$sha256$100000$${salt.toString('base64url')}$${derived.toString('base64url')}`;
};

const actors = {
  superadmin:{id:`USR-UAT-SETTINGS-SA-${runKey}`,email:`uat.settings.sa.${runKey}@proqtrack.id`,role:'superadmin',pass:makePassword()},
  head:{id:`USR-UAT-SETTINGS-HEAD-${runKey}`,email:`uat.settings.head.${runKey}@proqtrack.id`,role:'head',pass:makePassword()},
  admin:{id:`USR-UAT-SETTINGS-ADMIN-${runKey}`,email:`uat.settings.admin.${runKey}@proqtrack.id`,role:'admin',pass:makePassword()},
  manager:{id:`USR-UAT-SETTINGS-MANAGER-${runKey}`,email:`uat.settings.manager.${runKey}@proqtrack.id`,role:'manager',pass:makePassword()},
  supervisor:{id:`USR-UAT-SETTINGS-SUPERVISOR-${runKey}`,email:`uat.settings.supervisor.${runKey}@proqtrack.id`,role:'supervisor',pass:makePassword()},
  employee:{id:`USR-UAT-SETTINGS-EMPLOYEE-${runKey}`,email:`uat.settings.employee.${runKey}@proqtrack.id`,role:'employee',pass:makePassword(),employeeId:ids.employee},
};
for (const actor of Object.values(actors)) actor.hash = hashPassword(actor.pass);

function d1(sql) {
  const out = execFileSync('npx',['wrangler','d1','execute','DB','--remote','--json','--command',sql],{
    encoding:'utf8',
    stdio:['ignore','pipe','pipe'],
  });
  const start = out.indexOf('[');
  return start >= 0 ? JSON.parse(out.slice(start)) : [];
}

function d1Row(sql) {
  const result = d1(sql);
  const entry = Array.isArray(result) ? result.find(item => Array.isArray(item?.results)) : result;
  return entry?.results?.[0] || null;
}

async function api(path,{ method='GET', token='', body } = {}) {
  const response = await fetch(BASE + path,{
    method,
    headers:{
      accept:'application/json',
      ...(token ? { authorization:`Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type':'application/json' } : {}),
    },
    body:body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
  return { status:response.status, data, text };
}

const expect = (condition,message) => {
  if (!condition) throw new Error(message);
};

async function expectApi(path,options,status,label,errorCode='') {
  const response = await api(path,options);
  expect(response.status === status,`${label}: expected HTTP ${status}, got ${response.status}: ${response.text}`);
  if (errorCode) expect(response.data?.error === errorCode,`${label}: expected ${errorCode}, got ${response.text}`);
  return response.data;
}

async function login(name,device='') {
  const actor = actors[name];
  const body = { email:actor.email, password:actor.pass, organizationId:ids.org };
  if (device) Object.assign(body,{
    deviceId:`DEVICE-UAT-SETTINGS-${device}-${runKey}`,
    deviceProof:`PROOF-UAT-SETTINGS-${device}-${runKey}`,
    deviceLabel:`Settings UAT ${device}`,
  });
  const data = await expectApi('/api/auth/login',{ method:'POST', body },200,`login ${name}`);
  expect(data.token,`login ${name}: token missing`);
  expect(data.account?.role === actor.role,`login ${name}: role mismatch`);
  actor.token = data.token;
  return data;
}

async function session(name,token=actors[name].token) {
  const actor = actors[name];
  const data = await expectApi('/api/auth/session',{ token },200,`session ${name}`);
  expect(data.role === actor.role,`session ${name}: role mismatch`);
  expect(data.organizationId === ids.org,`session ${name}: organization mismatch`);
  expect(data.projectIds?.includes(ids.project),`session ${name}: project scope missing`);
  return data;
}

async function bootstrap(name) {
  return expectApi('/api/core/bootstrap',{ token:actors[name].token },200,`bootstrap ${name}`);
}

let mutationSeq = 0;
async function projectSync(name,label,mutate,expectedStatus=200,expectedError='') {
  const data = await bootstrap(name);
  const project = data.data?.projects?.find(row => row.id === ids.project);
  expect(project,`${label}: project missing`);
  const row = mutate({ ...project });
  return expectApi('/api/core/sync',{
    method:'POST',
    token:actors[name].token,
    body:{
      mutationId:`UAT-SETTINGS-${runKey}-${++mutationSeq}`,
      baseRevision:data.revision,
      changes:[{ entity:'projects', op:'upsert', row }],
    },
  },expectedStatus,label,expectedError);
}

function expectedTabs(role) {
  return {
    superadmin:['profil','keamanan','tampilan','organisasi','katalog','absensi','sesi'],
    head:['profil','keamanan','tampilan','organisasi','katalog','absensi','sesi'],
    admin:['profil','keamanan','tampilan','organisasi','katalog','absensi','sesi'],
    manager:['profil','keamanan','tampilan','katalog','sesi'],
    supervisor:['profil','keamanan','tampilan','sesi'],
    employee:['profil','keamanan','tampilan','perangkat','sesi'],
  }[role];
}

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  try {
    const userIds = Object.values(actors).map(actor => `'${sqlq(actor.id)}'`).join(',');
    d1(`
      DELETE FROM core_sync_conflicts WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_sync_revision_guards WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_sync_mutations WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_operational_audit_logs WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_api_idempotency_keys WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM security_audit_logs WHERE actor_id IN (${userIds});
      DELETE FROM core_auth_sessions WHERE user_id IN (${userIds});
      DELETE FROM core_auth_devices WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_employee_project_assignments WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_project_memberships WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_employees WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_projects WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_clients WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_sync_state WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_organization_users WHERE organization_id='${sqlq(ids.org)}';
      DELETE FROM core_organizations WHERE id='${sqlq(ids.org)}';
      DELETE FROM auth_users WHERE id IN (${userIds});
    `);
    cleaned = true;
  } catch (error) {
    console.error('Settings regression cleanup failed:',error?.message || error);
  }
}
process.on('SIGINT',()=>{ cleanup(); process.exit(130); });
process.on('SIGTERM',()=>{ cleanup(); process.exit(143); });


try {
  cleanup();
  cleaned = false;

  const home = await fetch(BASE + '/');
  const html = await home.text();
  expect(home.status === 200,'production shell HTTP failure');
  expect(html.includes('./assets/settings.css'),'production shell missing Settings stylesheet');
  const css = await fetch(BASE + '/assets/settings.css');
  const cssText = await css.text();
  expect(css.status === 200 && cssText.includes('.am-settings'),'Settings stylesheet production asset missing');

  for (const role of Object.keys(actors)) {
    const tabs = settingsTabsFor({ role }).map(([id]) => id);
    expect(JSON.stringify(tabs) === JSON.stringify(expectedTabs(role)),
      `Settings tab matrix mismatch for ${role}: ${tabs.join(',')}`);
  }

  d1(`
    INSERT INTO core_organizations(id,code,name,status,timezone,metadata_json,created_at,updated_at)
    VALUES(
      '${ids.org}','UATSET-${runKey}','Settings Final UAT','active','Asia/Jakarta',
      '{"synthetic":true,"settingsFinalUat":true,"themeColor":"#ef5000"}',
      CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    );
    INSERT INTO core_sync_state(organization_id,revision,cutover_mode,updated_at)
      VALUES('${ids.org}',0,'cloud',CURRENT_TIMESTAMP);
    INSERT INTO core_clients(id,organization_id,code,name,status,metadata_json,created_at,updated_at)
      VALUES('${ids.client}','${ids.org}','UAT-SETTINGS','Settings UAT Client','active','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_projects(id,organization_id,client_id,code,name,status,starts_on,ends_on,metadata_json,created_at,updated_at)
      VALUES(
        '${ids.project}','${ids.org}','${ids.client}','UAT-SETTINGS','Settings UAT Project','active',
        '2026-09-01','2027-09-30',
        '{"synthetic":true,"attendanceSourceMode":"manual","attendanceLateAfter":"09:00","modules":{"newOutlet":true},"storeCatalog":{"allowNewOutlet":true,"notesMode":"freetext","notesOptions":[],"segments":["General"],"types":["Retail"],"ownerships":["Independent"]}}',
        CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      );
    INSERT INTO auth_users(id,email,display_name,password_hash,role,status,project_ids,client_ids,created_at) VALUES
      ('${actors.superadmin.id}','${actors.superadmin.email}','Settings UAT Superadmin','${actors.superadmin.hash}','superadmin','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.head.id}','${actors.head.email}','Settings UAT Head','${actors.head.hash}','head','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.admin.id}','${actors.admin.email}','Settings UAT Admin','${actors.admin.hash}','admin','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.manager.id}','${actors.manager.email}','Settings UAT Manager','${actors.manager.hash}','manager','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.supervisor.id}','${actors.supervisor.email}','Settings UAT Supervisor','${actors.supervisor.hash}','supervisor','active','[]','[]',CURRENT_TIMESTAMP),
      ('${actors.employee.id}','${actors.employee.email}','Settings UAT Employee','${actors.employee.hash}','employee','active','[]','[]',CURRENT_TIMESTAMP);
    INSERT INTO core_organization_users(organization_id,user_id,role,status,created_at,updated_at) VALUES
      ('${ids.org}','${actors.head.id}','head','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${actors.admin.id}','admin','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${actors.manager.id}','manager','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${actors.supervisor.id}','supervisor','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${actors.employee.id}','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_project_memberships(organization_id,project_id,user_id,role,status,created_at,updated_at) VALUES
      ('${ids.org}','${ids.project}','${actors.manager.id}','manager','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.project}','${actors.supervisor.id}','supervisor','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('${ids.org}','${ids.project}','${actors.employee.id}','employee','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO core_employees(
      id,organization_id,auth_user_id,employee_code,full_name,email,phone,employment_status,metadata_json,created_at,updated_at
    ) VALUES(
      '${ids.employee}','${ids.org}','${actors.employee.id}','UAT-SETTINGS-EMP',
      'Settings UAT Employee','${actors.employee.email}','','active',
      '{"synthetic":true,"area":""}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    );
    INSERT INTO core_employee_project_assignments(
      id,organization_id,project_id,employee_id,position_name,status,starts_on,ends_on,metadata_json,created_at,updated_at
    ) VALUES(
      '${ids.assignment}','${ids.org}','${ids.project}','${ids.employee}',
      'Field Sales','active','2026-09-01','2027-09-30','{"synthetic":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
    );
  `);

  await login('superadmin');
  await login('head');
  await login('admin');
  await login('manager');
  await login('supervisor');
  const employeeLogin = await login('employee','A');
  expect(employeeLogin.account?.deviceBound === true,'employee login did not return deviceBound=true');

  for (const role of Object.keys(actors)) {
    const data = await session(role);
    if (role === 'employee') {
      expect(data.deviceBound === true,'employee session deviceBound=false');
      expect(data.deviceLabel === 'Settings UAT A','employee session device label mismatch');
    }
  }

  for (const role of Object.keys(actors)) {
    const actor = actors[role];
    const payload = {
      email:actor.email,
      name:`Settings Final ${role}`,
      ...(role === 'employee'
        ? { phone:'081234567890', area:'Jakarta UAT' }
        : { phone:'', area:'' }),
    };
    const data = await expectApi('/api/auth/profile',{
      method:'PATCH', token:actor.token, body:payload,
    },200,`profile ${role}`);
    expect(data.account?.name === payload.name,`profile ${role}: display name not persisted`);
  }

  const employeeSession = await session('employee');
  expect(employeeSession.phone === '081234567890','employee phone missing after profile save');
  expect(employeeSession.area === 'Jakarta UAT','employee area missing after profile save');


  for (const role of Object.keys(actors)) {
    await expectApi('/api/organization/profile',{ token:actors[role].token },200,`organization profile GET ${role}`);
  }

  for (const role of ['superadmin','head','admin']) {
    const data = await expectApi('/api/organization/profile',{
      method:'PATCH',
      token:actors[role].token,
      body:{
        name:'Settings Final UAT',
        timezone:'Asia/Jakarta',
        notes:`Updated by ${role} during Settings final UAT`,
        themeColor:'#ef5000',
      },
    },200,`organization profile PATCH ${role}`);
    expect(data.organization?.name === 'Settings Final UAT',`organization patch ${role}: name mismatch`);
  }

  for (const role of ['manager','supervisor','employee']) {
    await expectApi('/api/organization/profile',{
      method:'PATCH',
      token:actors[role].token,
      body:{ name:'Forbidden Settings UAT', timezone:'Asia/Jakarta' },
    },403,`organization profile denied ${role}`,'ORGANIZATION_PROFILE_FORBIDDEN');
  }

  const saAccounts = await expectApi('/api/admin/accounts',{ token:actors.superadmin.token },200,'accounts superadmin');
  const headAccounts = await expectApi('/api/admin/accounts',{ token:actors.head.token },200,'accounts head');
  const adminAccounts = await expectApi('/api/admin/accounts',{ token:actors.admin.token },200,'accounts admin');
  for (const role of ['manager','supervisor','employee']) {
    await expectApi('/api/admin/accounts',{ token:actors[role].token },403,`accounts denied ${role}`);
  }

  const saIds = new Set((saAccounts.accounts || []).map(row => row.id));
  expect(
    saIds.has(actors.head.id)
      && saIds.has(actors.admin.id)
      && saIds.has(actors.manager.id)
      && saIds.has(actors.supervisor.id)
      && saIds.has(actors.employee.id),
    'superadmin account scope incomplete',
  );

  const headIds = new Set((headAccounts.accounts || []).map(row => row.id));
  expect(!headIds.has(actors.head.id) && headIds.has(actors.admin.id) && headIds.has(actors.employee.id),
    'head account scope incorrect');

  const adminIds = new Set((adminAccounts.accounts || []).map(row => row.id));
  expect(
    adminIds.has(actors.admin.id)
      && adminIds.has(actors.manager.id)
      && adminIds.has(actors.employee.id)
      && !adminIds.has(actors.head.id),
    'admin account scope incorrect',
  );

  await expectApi(`/api/admin/accounts/${actors.employee.id}`,{
    method:'PATCH',
    token:actors.admin.token,
    body:{ email:`changed.${runKey}@proqtrack.id` },
  },403,'admin global email boundary','ACCOUNT_GLOBAL_EMAIL_EDIT_FORBIDDEN');

  await expectApi(`/api/admin/accounts/${actors.employee.id}`,{
    method:'PATCH',
    token:actors.admin.token,
    body:{ password:actors.employee.pass + '-change' },
  },403,'admin global password boundary','ACCOUNT_GLOBAL_PASSWORD_EDIT_FORBIDDEN');

  await expectApi(`/api/admin/accounts/${actors.manager.id}`,{
    method:'PATCH',
    token:actors.admin.token,
    body:{ role:'head' },
  },403,'admin role escalation boundary','ACCOUNT_ROLE_FORBIDDEN');

  await expectApi(`/api/admin/accounts/${actors.admin.id}`,{
    method:'PATCH',
    token:actors.admin.token,
    body:{ status:'suspended' },
  },403,'admin self disable boundary','SELF_DISABLE_FORBIDDEN');

  await projectSync('manager','manager-catalog-update',project => ({
    ...project,
    modules:{ ...(project.modules || {}), newOutlet:false },
    storeCatalog:{
      ...(project.storeCatalog || {}),
      allowNewOutlet:false,
      segments:['General','Modern Trade'],
    },
  }));

  await projectSync('manager','manager-attendance-policy-denied',project => ({
    ...project,
    attendanceSourceMode:'visit',
  }),403,'CHANGE_FORBIDDEN');

  await projectSync('supervisor','supervisor-project-settings-denied',project => ({
    ...project,
    storeCatalog:{ ...(project.storeCatalog || {}), allowNewOutlet:true },
  }),403,'CHANGE_FORBIDDEN');

  await projectSync('employee','employee-project-settings-denied',project => ({
    ...project,
    storeCatalog:{ ...(project.storeCatalog || {}), allowNewOutlet:true },
  }),403,'CHANGE_FORBIDDEN');

  await projectSync('admin','admin-attendance-cutoff-update',project => ({
    ...project,
    attendanceLateAfter:'09:15',
  }));

  const managerBootstrap = await bootstrap('manager');
  const managerProject = managerBootstrap.data?.projects?.find(row => row.id === ids.project);
  expect(managerProject?.storeCatalog?.allowNewOutlet === false,'manager catalog update not persisted');
  expect(managerProject?.attendanceSourceMode === 'manual','manager changed attendance source unexpectedly');
  expect(managerProject?.attendanceLateAfter === '09:15','admin attendance cutoff update not persisted');

