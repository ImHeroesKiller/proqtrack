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

