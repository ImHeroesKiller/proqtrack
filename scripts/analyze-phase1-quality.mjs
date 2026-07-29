#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
const outputDir = process.argv[3] || 'tmp/phase1-quality';
if (!input) {
  console.error('Usage: node scripts/analyze-phase1-quality.mjs <localstorage-backup.json> [output-dir]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const storage = raw.storage || raw;
const dbText = storage.proqtrack_db_v7 || storage.proqtrack_db_v6;
if (!dbText) throw new Error('Backup tidak memuat proqtrack_db_v7 atau proqtrack_db_v6');
const db = typeof dbText === 'string' ? JSON.parse(dbText) : dbText;
const employees = Array.isArray(db.employees) ? db.employees : [];
const accounts = Array.isArray(db.accounts) ? db.accounts : [];

const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
const byId = new Map(employees.map((e) => [String(e.id), e]));
const groups = (keyFn) => {
  const map = new Map();
  for (const e of employees) {
    const key = keyFn(e);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return [...map.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, ids: rows.map((r) => r.id), names: [...new Set(rows.map((r) => r.name || r.fullName))] }));
};

const duplicates = {
  exactName: groups((e) => norm(e.name || e.fullName)),
  email: groups((e) => norm(e.email)),
  phone: groups((e) => norm(e.phone).replace(/\D/g, '')),
  nik: groups((e) => norm(e.nik)),
  employeeNumber: groups((e) => norm(e.employeeNumber)),
  strongIdentity: groups((e) => {
    const name = norm(e.name || e.fullName);
    const email = norm(e.email);
    const phone = norm(e.phone).replace(/\D/g, '');
    return name && (email || phone) ? `${name}|${email}|${phone}` : '';
  }),
};

const danglingSupervisors = employees.filter((e) => e.supervisorId && !byId.has(String(e.supervisorId))).map((e) => ({ employeeId: e.id, employeeName: e.name || e.fullName, supervisorId: e.supervisorId }));
const selfReporting = employees.filter((e) => e.supervisorId && String(e.supervisorId) === String(e.id)).map((e) => ({ employeeId: e.id, employeeName: e.name || e.fullName }));

const cycles = [];
for (const employee of employees) {
  const seen = new Map();
  const chain = [];
  let current = employee;
  while (current?.supervisorId && byId.has(String(current.supervisorId))) {
    const id = String(current.id);
    if (seen.has(id)) {
      const cycle = chain.slice(seen.get(id));
      const signature = [...cycle].sort().join('|');
      if (!cycles.some((c) => c.signature === signature)) cycles.push({ signature, employeeIds: cycle });
      break;
    }
    seen.set(id, chain.length);
    chain.push(id);
    current = byId.get(String(current.supervisorId));
  }
}

const positionSummary = {};
for (const e of employees) {
  const value = String(e.jobTitle || e.jobRole || e.role || 'Employee').trim();
  positionSummary[value] = (positionSummary[value] || 0) + 1;
}
const areaSummary = {};
for (const e of employees) {
  const value = String(e.area || 'Tanpa Area').trim();
  areaSummary[value] = (areaSummary[value] || 0) + 1;
}
const accountScopeRisks = accounts.filter((a) => {
  const role = norm(a.role);
  return ['manager','supervisor','team leader','team_leader'].includes(role) && !a.employeeId;
}).map((a) => ({ accountId: a.id, email: a.email, role: a.role, reason: 'Role pengelola tidak terhubung ke employee sehingga scope organisasi tidak dapat diturunkan otomatis.' }));

const report = {
  generatedAt: new Date().toISOString(),
  source: input,
  summary: {
    employees: employees.length,
    accounts: accounts.length,
    reportingLinesDeclared: employees.filter((e) => e.supervisorId).length,
    danglingSupervisors: danglingSupervisors.length,
    selfReporting: selfReporting.length,
    cycles: cycles.length,
    strongDuplicateGroups: duplicates.strongIdentity.length,
    exactNameDuplicateGroups: duplicates.exactName.length,
    accountScopeRisks: accountScopeRisks.length,
  },
  duplicates,
  hierarchy: { danglingSupervisors, selfReporting, cycles },
  accountScopeRisks,
  positionSummary,
  areaSummary,
  recommendation: [
    'Jangan menggabungkan employee hanya karena nama sama.',
    'Auto-merge hanya layak untuk strongIdentity dan tetap memerlukan review manual.',
    'Supervisor yang hilang, self-reporting, dan circular hierarchy harus bernilai nol sebelum remote migration.',
    'Role manager/supervisor/team leader wajib memiliki employeeId atau explicit global scope yang disetujui.'
  ]
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
const md = `# ProQTrack Phase 1.3 Data Quality Report\n\nGenerated: ${report.generatedAt}\n\n## Summary\n\n${Object.entries(report.summary).map(([k,v]) => `- ${k}: ${v}`).join('\n')}\n\n## Position Summary\n\n${Object.entries(positionSummary).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`- ${k}: ${v}`).join('\n')}\n\n## Area Summary\n\n${Object.entries(areaSummary).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`- ${k}: ${v}`).join('\n')}\n\n## Gate\n\nRemote migration BLOCKED when danglingSupervisors, selfReporting, cycles, or accountScopeRisks are above zero. Exact-name duplicates are warnings only.\n`;
fs.writeFileSync(path.join(outputDir, 'report.md'), md);
console.log(JSON.stringify({ outputDir, ...report.summary }, null, 2));

if (danglingSupervisors.length || selfReporting.length || cycles.length || accountScopeRisks.length) process.exitCode = 2;
