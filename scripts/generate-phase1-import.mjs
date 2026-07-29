#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const input = process.argv[2];
const output = process.argv[3] || 'tmp/phase1-import.sql';
if (!input) {
  console.error('Usage: node scripts/generate-phase1-import.mjs <localstorage-backup.json> [output.sql]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const storage = raw.storage || raw;
const dbText = storage.proqtrack_db_v7 || storage.proqtrack_db_v6;
if (!dbText) throw new Error('Backup tidak memuat proqtrack_db_v7 atau proqtrack_db_v6');
const db = typeof dbText === 'string' ? JSON.parse(dbText) : dbText;
const employees = Array.isArray(db.employees) ? db.employees : [];
const accounts = Array.isArray(db.accounts) ? db.accounts : [];

const q = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const bool = (value) => value ? 1 : 0;
const date = (value, fallback = new Date().toISOString().slice(0, 10)) => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : fallback;
const timestamp = (value) => value ? String(value) : new Date().toISOString();
const slug = (value, fallback = 'unknown') => String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || fallback;
const externalPhoto = (value) => /^https?:\/\//i.test(String(value || '')) ? String(value) : null;
const roleCode = (value) => {
  const role = String(value || '').toLowerCase();
  if (role.includes('super_admin')) return 'super_admin';
  if (role.includes('manager')) return 'manager';
  if (role.includes('supervisor')) return 'supervisor';
  if (role.includes('team') && role.includes('lead')) return 'team_leader';
  if (role.includes('viewer')) return 'viewer';
  return 'employee';
};
const workerType = (employee) => {
  const value = `${employee.workerType || ''} ${employee.role || ''} ${employee.jobRole || ''}`.toLowerCase();
  if (value.includes('manager')) return 'manager';
  if (value.includes('supervisor') || value.includes('team leader')) return 'supervisor';
  if (value.includes('admin')) return 'admin';
  if (value.includes('sales') || value.includes('merchandiser') || value.includes('spg') || value.includes('motorist')) return 'sales';
  return 'non_sales';
};
const positionMeta = (employee) => {
  const name = String(employee.jobTitle || employee.jobRole || employee.role || 'Employee').trim();
  const lower = name.toLowerCase();
  if (lower.includes('director')) return { name, category: 'executive', rank: 100, manage: 1, review: 1, approve: 1 };
  if (lower.includes('manager')) return { name, category: 'manager', rank: 80, manage: 1, review: 1, approve: 1 };
  if (lower.includes('supervisor')) return { name, category: 'supervisor', rank: 70, manage: 1, review: 1, approve: 1 };
  if (lower.includes('team leader') || lower.includes('team lead') || lower.includes('coordinator')) return { name, category: 'team_lead', rank: 60, manage: 1, review: 1, approve: 0 };
  if (lower.includes('sales') || lower.includes('merchandiser') || lower.includes('spg') || lower.includes('motorist')) return { name, category: 'field_worker', rank: 40, manage: 0, review: 0, approve: 0 };
  if (lower.includes('admin') || lower.includes('support')) return { name, category: 'support', rank: 40, manage: 0, review: 0, approve: 0 };
  return { name, category: 'staff', rank: 40, manage: 0, review: 0, approve: 0 };
};

const positions = new Map();
for (const employee of employees) {
  const meta = positionMeta(employee);
  const code = `POS_${slug(meta.name).toUpperCase()}`;
  positions.set(code, { id: code, code, ...meta });
}
const areas = [...new Set(employees.map((e) => String(e.area || '').trim()).filter(Boolean))];
const companyUnitId = 'ORG_PROQTRACK';
const lines = ['PRAGMA foreign_keys = ON;', 'BEGIN TRANSACTION;'];
lines.push(`INSERT OR IGNORE INTO organization_units (id,code,name,unit_type,status) VALUES (${q(companyUnitId)},'PROQTRACK','ProQTrack','company','active');`);
for (const area of areas) {
  const id = `ORG_AREA_${slug(area).toUpperCase()}`;
  lines.push(`INSERT OR IGNORE INTO organization_units (id,parent_unit_id,code,name,unit_type,status) VALUES (${q(id)},${q(companyUnitId)},${q(slug(area).toUpperCase())},${q(area)},'area','active');`);
}
for (const p of positions.values()) {
  lines.push(`INSERT OR IGNORE INTO positions (id,code,name,category,level_rank,can_manage_people,can_review_attendance,can_approve,status) VALUES (${q(p.id)},${q(p.code)},${q(p.name)},${q(p.category)},${p.rank},${p.manage},${p.review},${p.approve},'active');`);
}
for (let i = 0; i < employees.length; i++) {
  const e = employees[i];
  const id = String(e.id || `EMP_IMPORT_${String(i + 1).padStart(4, '0')}`);
  const employeeNumber = String(e.employeeNumber || e.nik || id);
  const status = ['active','inactive','suspended','resigned','terminated','on_leave','draft'].includes(String(e.status)) ? String(e.status) : 'active';
  lines.push(`INSERT OR REPLACE INTO employees (id,employee_number,nik,full_name,preferred_name,email,phone,gender,employment_type,worker_type,join_date,end_date,status,photo_url,photo_updated_at,created_at,updated_at) VALUES (${q(id)},${q(employeeNumber)},${q(e.nik || null)},${q(e.name || e.fullName || id)},${q(e.preferredName || null)},${q(e.email || null)},${q(e.phone || null)},${q(['male','female','other','unspecified'].includes(e.gender) ? e.gender : 'unspecified')},${q(e.employmentType || 'contract')},${q(workerType(e))},${q(date(e.joinDate))},${q(e.endDate || null)},${q(status)},${q(externalPhoto(e.photo || e.photoUrl))},${q(e.photoUpdatedAt || null)},${q(timestamp(e.createdAt))},${q(timestamp(e.updatedAt))});`);
  const p = positionMeta(e);
  const positionId = `POS_${slug(p.name).toUpperCase()}`;
  const areaId = e.area ? `ORG_AREA_${slug(e.area).toUpperCase()}` : companyUnitId;
  lines.push(`INSERT OR REPLACE INTO employee_positions (id,employee_id,position_id,organization_unit_id,is_primary,appointment_type,start_date,status) VALUES (${q(`EP_${id}`)},${q(id)},${q(positionId)},${q(areaId)},1,'substantive',${q(date(e.joinDate))},'active');`);
  lines.push(`INSERT OR REPLACE INTO organization_unit_memberships (id,employee_id,organization_unit_id,position_id,membership_type,start_date,status) VALUES (${q(`OUM_${id}`)},${q(id)},${q(areaId)},${q(positionId)},'primary',${q(date(e.joinDate))},'active');`);
}
for (const e of employees) {
  if (!e.supervisorId || !employees.some((x) => String(x.id) === String(e.supervisorId))) continue;
  const id = String(e.id);
  const scopeId = e.area ? `ORG_AREA_${slug(e.area).toUpperCase()}` : companyUnitId;
  lines.push(`INSERT OR REPLACE INTO employee_reporting_lines (id,employee_id,reports_to_employee_id,relationship_type,scope_type,scope_id,is_primary,start_date,status) VALUES (${q(`ERL_${id}`)},${q(id)},${q(e.supervisorId)},'line_manager','organization_unit',${q(scopeId)},1,${q(date(e.joinDate))},'active');`);
}
for (let i = 0; i < accounts.length; i++) {
  const a = accounts[i];
  const id = String(a.id || `ACC_IMPORT_${String(i + 1).padStart(4, '0')}`);
  const email = String(a.email || '').trim().toLowerCase();
  if (!email) continue;
  const employeeId = a.employeeId && employees.some((e) => String(e.id) === String(a.employeeId)) ? String(a.employeeId) : null;
  const fingerprint = crypto.createHash('sha256').update(`${email}:${a.password || 'missing'}`).digest('hex');
  const importedStatus = String(a.status) === 'inactive' ? 'inactive' : 'invited';
  lines.push(`INSERT OR REPLACE INTO accounts (id,email,password_hash,employee_id,status,must_change_password,failed_login_attempts,last_login_at,created_at,updated_at) VALUES (${q(id)},${q(email)},${q(`legacy-disabled:${fingerprint}`)},${q(employeeId)},${q(importedStatus)},1,0,${q(a.lastLoginAt || null)},${q(timestamp(a.createdAt))},${q(timestamp(a.updatedAt))});`);
  const code = roleCode(a.role);
  lines.push(`INSERT OR REPLACE INTO account_roles (id,account_id,role_id,scope_type,scope_id,status,start_at) VALUES (${q(`AR_${id}_${code}`)},${q(id)},${q(`ROLE_${code.toUpperCase()}`)},${q(code === 'super_admin' ? 'global' : employeeId ? 'self' : 'global')},NULL,'active',${q(timestamp(a.createdAt))});`);
}
lines.push(`INSERT INTO identity_audit_logs (action,entity_type,entity_id,after_json,request_id) VALUES ('phase1.import','migration','localstorage',${q(JSON.stringify({ employees: employees.length, accounts: accounts.length, positions: positions.size, areas: areas.length }))},'phase1-local-import');`);
lines.push('COMMIT;');

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${lines.join('\n')}\n`);
console.log(JSON.stringify({ input, output, employees: employees.length, accounts: accounts.length, positions: positions.size, areas: areas.length, note: 'Akun diimpor sebagai invited dengan password legacy-disabled; password lama tidak diaktifkan.' }, null, 2));
