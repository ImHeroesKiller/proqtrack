import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimited, normalizeRows, detectDelimiter, templateCsv } from '../src/lib/bulk-upload.js';
import { __test as bulkClient } from '../src/bulk-employees.js';
import { __test as bulkServer } from '../worker/bulk-employees.js';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('bulk CSV parser supports quoted commas semicolon locale and canonical headers', () => {
  assert.equal(detectDelimiter('employee_code;full_name;project_code\nE1;Budi;P1'), ';');
  const matrix = parseDelimited('employee_code,full_name,project_code,email\nE1,"Budi, Santoso",P1,budi@example.com\n');
  const rows = normalizeRows(matrix);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employee_code, 'E1');
  assert.equal(rows[0].full_name, 'Budi, Santoso');
  assert.equal(rows[0]._row_number, 2);
  assert.match(templateCsv(), /employee_code,full_name,email/);
});

test('bulk server normalizes field roles statuses and login intent safely', () => {
  assert.equal(bulkServer.loginRole('SPG'), 'employee');
  assert.equal(bulkServer.loginRole('Supervisor'), 'supervisor');
  assert.equal(bulkServer.loginRole('head'), '');
  assert.equal(bulkServer.employmentStatus('Aktif'), 'active');
  const row = bulkServer.normalizeRow({
    _row_number: 7,
    employee_code: ' EMP-7 ',
    full_name: ' Nadia Permata ',
    project_code: ' MKB-SALES-UAT ',
    role: 'SPG',
    create_login: 'YA',
  });
  assert.equal(row.rowNumber, 7);
  assert.equal(row.employeeCode, 'EMP-7');
  assert.equal(row.role, 'employee');
  assert.equal(row.createLogin, true);
  assert.equal(bulkServer.validInitialPassword('Abcdefghijk7!XYZ'), true);
  assert.equal(bulkServer.validInitialPassword('too-short'), false);
});

test('bulk client detects duplicates across preview chunk boundaries', () => {
  const rows = [
    { _row_number: 2, employee_code: 'EMP-1', email: 'one@example.com' },
    { _row_number: 102, employee_code: 'emp-1', email: 'two@example.com' },
    { _row_number: 202, employee_code: 'EMP-3', email: 'ONE@example.com' },
  ];
  const errors = bulkClient.duplicateErrors(rows);
  assert.match(errors.get(2).join(','), /DUPLICATE_EMPLOYEE_CODE_ROW_102/);
  assert.match(errors.get(102).join(','), /DUPLICATE_EMPLOYEE_CODE_ROW_2/);
  assert.match(errors.get(202).join(','), /DUPLICATE_EMAIL_ROW_2/);
});

test('bulk upload is first-class server route and employee UI exposes it', async () => {
  const [main, hardening, app, wrangler, workflow, migration] = await Promise.all([
    read('worker/main.js'),
    read('worker/hardening.js'),
    read('src/app.js'),
    read('wrangler.jsonc'),
    read('.github/workflows/cloudflare-mvp.yml'),
    read('migrations/0012_bulk_employee_upload.sql'),
  ]);
  assert.match(main, /handleBulkEmployeeRoute/);
  assert.match(main, /pathname\.startsWith\('\/api\/bulk\/employees'\)/);
  assert.match(hardening, /return 'bulk'/);
  assert.match(app, /BulkEmployees\.open\(\)/);
  assert.match(app, /\.\/bulk-employees\.js/);
  assert.match(wrangler, /CORE_BULK_API_ENABLED/);
  assert.match(workflow, /\/api\/bulk\/employees\/preview/);
  assert.match(migration, /core_bulk_import_runs/);
  assert.match(migration, /core_bulk_import_chunks/);
  assert.match(migration, /login_created_json/);
  assert.match(main, /API_BULK_RATE_LIMIT_PER_MINUTE/);
});

test('bulk endpoint stores no plaintext credential fields in audit schema', async () => {
  const [migration, worker] = await Promise.all([
    read('migrations/0012_bulk_employee_upload.sql'),
    read('worker/bulk-employees.js'),
  ]);
  assert.doesNotMatch(migration, /(password_hash|initial_password|password\\s+TEXT)/i);
  assert.doesNotMatch(worker, /detail_json[^\n]*password/i);
  assert.equal(bulkServer.MAX_PREVIEW_ROWS, 100);
  assert.equal(bulkServer.MAX_COMMIT_ROWS, 20);
});
