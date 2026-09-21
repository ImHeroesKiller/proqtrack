import { authHeaders } from './lib/uploads.js';
import { getDB } from './lib/db.js';
import { bootstrapOperationalData, applyRemoteDataToLocal } from './lib/cloud-data.js';
import { parseBulkEmployeeFile, templateCsv } from './lib/bulk-upload.js';

const MAX_FILE_ROWS = 500;
const PREVIEW_CHUNK = 100;
const COMMIT_CHUNK = 20;
let currentRows = [];
let currentPreview = [];
let currentFileName = '';
let generatedCredentials = [];
let passwordByRow = new Map();
let busy = false;

const esc = value => String(value ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'","&#039;");

async function apiJson(path, body, { retries = 0 } = {}) {
  const payload = JSON.stringify(body);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: authHeaders({ 'content-type': 'application/json', accept: 'application/json' }),
        body: payload,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      const error = new Error(data.message || data.error || `HTTP ${res.status}`);
      error.code = data.error;
      error.status = res.status;
      error.payload = data;
      if (attempt < retries && (res.status >= 500 || res.status === 429)) {
        const waitMs = res.status === 429
          ? Math.min(5000, Math.max(500, Number(res.headers.get('retry-after') || 1) * 1000))
          : 350 * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        lastError = error;
        continue;
      }
      throw error;
    } catch (error) {
      lastError = error;
      if (attempt >= retries || error?.status && error.status < 500 && error.status !== 429) throw error;
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError || new Error('NETWORK_ERROR');
}

function duplicateErrors(rows) {
  const byCode = new Map();
  const byEmail = new Map();
  const errors = new Map();
  const add = (rowNumber, code) => {
    if (!errors.has(rowNumber)) errors.set(rowNumber, []);
    errors.get(rowNumber).push(code);
  };
  for (const row of rows) {
    const rowNumber = Number(row._row_number);
    const code = String(row.employee_code || '').trim().toLowerCase();
    const email = String(row.email || '').trim().toLowerCase();
    if (code) {
      if (byCode.has(code)) {
        add(rowNumber, `DUPLICATE_EMPLOYEE_CODE_ROW_${byCode.get(code)}`);
        add(byCode.get(code), `DUPLICATE_EMPLOYEE_CODE_ROW_${rowNumber}`);
      } else byCode.set(code, rowNumber);
    }
    if (email) {
      if (byEmail.has(email)) {
        add(rowNumber, `DUPLICATE_EMAIL_ROW_${byEmail.get(email)}`);
        add(byEmail.get(email), `DUPLICATE_EMAIL_ROW_${rowNumber}`);
      } else byEmail.set(email, rowNumber);
    }
  }
  return errors;
}

function chunks(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function download(name, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function strongInitialPassword(length = 20) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  const chars = ['A','a','7','!'];
  for (let i = chars.length; i < length; i += 1) chars.push(alphabet[bytes[i] % alphabet.length]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = bytes[i % bytes.length] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}

function statusBadge(row) {
  if (!row.valid) return '<span class="bulk-badge bulk-error">Error</span>';
  if (row.warnings?.length) return '<span class="bulk-badge bulk-warning">Warning</span>';
  return '<span class="bulk-badge bulk-ok">Valid</span>';
}

function summary(rows) {
  return {
    total: rows.length,
    valid: rows.filter(row => row.valid).length,
    errors: rows.filter(row => !row.valid).length,
    warnings: rows.filter(row => row.valid && row.warnings?.length).length,
    inserts: rows.filter(row => row.valid && row.action === 'create').length,
    updates: rows.filter(row => row.valid && row.action === 'update').length,
    logins: rows.filter(row => row.valid && ['create','link'].includes(row.loginAction)).length,
  };
}

function renderPreview() {
  const root = document.getElementById('bulkEmployeePreview');
  if (!root) return;
  if (!currentPreview.length) {
    root.innerHTML = '<div class="bulk-empty">Pilih file CSV/XLSX untuk memulai.</div>';
    return;
  }
  const s = summary(currentPreview);
  const visible = currentPreview.slice(0, 100);
  root.innerHTML = `
    <div class="bulk-summary">
      <div><strong>${s.total}</strong><span>Rows</span></div>
      <div><strong>${s.valid}</strong><span>Valid</span></div>
      <div><strong>${s.inserts}</strong><span>New</span></div>
      <div><strong>${s.updates}</strong><span>Update</span></div>
      <div><strong>${s.logins}</strong><span>Login</span></div>
      <div class="${s.errors ? 'danger' : ''}"><strong>${s.errors}</strong><span>Error</span></div>
    </div>
    <div class="bulk-table-wrap"><table class="table bulk-table">
      <thead><tr><th>Row</th><th>Kode</th><th>Nama</th><th>Project</th><th>Aksi</th><th>Login</th><th>Status</th><th>Catatan</th></tr></thead>
      <tbody>
      ${visible.map(row => `<tr>
        <td>${row.rowNumber}</td>
        <td><strong>${esc(row.employeeCode)}</strong></td>
        <td>${esc(row.fullName)}<div class="bulk-muted">${esc(row.email)}</div></td>
        <td>${esc(row.projectCode)}</td>
        <td>${row.action === 'create' ? 'New' : 'Update'}</td>
        <td>${esc(row.loginAction)}</td>
        <td>${statusBadge(row)}</td>
        <td class="bulk-notes">${[...(row.errors||[]), ...(row.warnings||[])].map(esc).join('<br>') || '—'}</td>
      </tr>`).join('')}
      </tbody>
    </table></div>
    ${currentPreview.length > visible.length ? `<div class="bulk-muted">Menampilkan 100 dari ${currentPreview.length} row. Semua row tetap divalidasi.</div>` : ''}
    <div class="bulk-actions">
      <button class="btn btn-secondary" type="button" onclick="BulkEmployees.reset()">Ganti File</button>
      <button class="btn btn-primary" type="button" onclick="BulkEmployees.commit()" ${s.errors ? 'disabled' : ''}>Commit ${s.valid} Karyawan</button>
    </div>
  `;
}

async function previewRows(rows) {
  const result = [];
  for (const chunk of chunks(rows, PREVIEW_CHUNK)) {
    const data = await apiJson('/api/bulk/employees/preview', { rows: chunk });
    result.push(...(data.rows || []));
  }
  const duplicates = duplicateErrors(rows);
  return result.map(row => {
    const extra = duplicates.get(Number(row.rowNumber)) || [];
    if (!extra.length) return row;
    return { ...row, valid: false, errors: [...new Set([...(row.errors || []), ...extra])] };
  });
}

async function refreshFromCloud() {
  const db = getDB();
  const account = window.FT?.state?.account || {};
  const remote = await bootstrapOperationalData(db, account);
  if (remote?.mode === 'cloud' && remote.data) applyRemoteDataToLocal(db, remote.data);
}

function renderSuccess(summaryTotal) {
  const root = document.getElementById('bulkEmployeePreview');
  if (!root) return;
  root.innerHTML = `
    <div class="bulk-success">
      <div class="bulk-success-mark">✓</div>
      <h3>Bulk upload berhasil</h3>
      <p>${summaryTotal.inserted} karyawan baru · ${summaryTotal.updated} diperbarui · ${summaryTotal.loginCreated} login baru · ${summaryTotal.loginLinked} login ditautkan.</p>
      ${generatedCredentials.length ? `
        <div class="bulk-credential-warning"><strong>Simpan initial password sekarang.</strong> Password plaintext tidak disimpan di D1 dan hanya ditampilkan dari response commit ini.</div>
        <button class="btn btn-primary" type="button" onclick="BulkEmployees.downloadCredentials()">Download Login Credentials</button>
      ` : ''}
      <button class="btn btn-secondary" type="button" onclick="FT.closeModal()">Tutup</button>
    </div>
  `;
}

export async function handleFile(input) {
  const file = input?.files?.[0];
  if (!file || busy) return;
  busy = true;
  generatedCredentials = [];
  passwordByRow = new Map();
  const root = document.getElementById('bulkEmployeePreview');
  try {
    if (root) root.innerHTML = '<div class="bulk-loading">Membaca dan memvalidasi file…</div>';
    currentFileName = file.name;
    currentRows = await parseBulkEmployeeFile(file);
    if (!currentRows.length) throw new Error('File tidak memiliki data.');
    if (currentRows.length > MAX_FILE_ROWS) throw new Error(`Maksimal ${MAX_FILE_ROWS} karyawan per file.`);
    currentPreview = await previewRows(currentRows);
    renderPreview();
  } catch (error) {
    currentRows = [];
    currentPreview = [];
    if (root) root.innerHTML = `<div class="bulk-error-box"><strong>File gagal diproses.</strong><br>${esc(error.message || error)}</div>`;
  } finally {
    busy = false;
  }
}

export async function commit() {
  if (busy || !currentRows.length) return;
  if (currentPreview.some(row => !row.valid)) {
    window.showToast?.('Perbaiki semua error sebelum commit.', 'error');
    return;
  }
  if (!confirm(`Commit ${currentRows.length} karyawan ke organisasi aktif?`)) return;

  busy = true;
  generatedCredentials = [];
  passwordByRow = new Map();
  for (const row of currentPreview) {
    if (row.valid && row.loginAction === 'create') {
      passwordByRow.set(Number(row.rowNumber), strongInitialPassword());
    }
  }
  const importId = `BULK-${crypto.randomUUID()}`;
  const groups = chunks(currentRows, COMMIT_CHUNK);
  const totals = { inserted:0, updated:0, loginCreated:0, loginLinked:0 };
  const previewByRow = new Map(currentPreview.map(row => [Number(row.rowNumber), row]));
  const credentialKeys = new Set();
  const root = document.getElementById('bulkEmployeePreview');

  try {
    for (let i = 0; i < groups.length; i += 1) {
      if (root) root.innerHTML = `<div class="bulk-loading">Commit chunk ${i + 1} / ${groups.length}…</div>`;
      const data = await apiJson('/api/bulk/employees/commit', {
        importId,
        chunkId: String(i + 1),
        finalChunk: i === groups.length - 1,
        sourceName: currentFileName,
        rows: groups[i].map(row => {
          const initialPassword = passwordByRow.get(Number(row._row_number));
          return initialPassword ? { ...row, initial_password: initialPassword } : row;
        }),
      }, { retries: 2 });
      const chunkPreview = groups[i]
        .map(row => previewByRow.get(Number(row._row_number)))
        .filter(Boolean);
      if (!data.replayed) {
        totals.inserted += Number(data.summary?.inserted || 0);
        totals.updated += Number(data.summary?.updated || 0);
        totals.loginCreated += Number(data.summary?.loginCreated || 0);
        totals.loginLinked += Number(data.summary?.loginLinked || 0);
      } else {
        totals.inserted += chunkPreview.filter(row => row.action === 'create').length;
        totals.updated += chunkPreview.filter(row => row.action === 'update').length;
        totals.loginCreated += chunkPreview.filter(row => row.loginAction === 'create').length;
        totals.loginLinked += chunkPreview.filter(row => row.loginAction === 'link').length;
      }
      for (const credential of data.credentials || []) {
        const key = String(credential.email || credential.employeeCode || credential.rowNumber || '');
        if (!key || credentialKeys.has(key)) continue;
        credentialKeys.add(key);
        generatedCredentials.push(credential);
      }
    }
    await refreshFromCloud();
    renderSuccess(totals);
    window.showToast?.('Bulk upload karyawan selesai.', 'success');
  } catch (error) {
    const detail = error.payload?.rows?.flatMap(row => row.errors || []).slice(0, 8).join(', ');
    if (root) root.innerHTML = `<div class="bulk-error-box"><strong>Commit berhenti.</strong><br>${esc(error.message || error)}${detail ? `<br><span class="bulk-muted">${esc(detail)}</span>` : ''}<br><br>Chunk yang sudah sukses aman dan idempotent. Upload ulang file yang sama untuk melanjutkan/update.${generatedCredentials.length ? '<br><br><button class="btn btn-primary" type="button" onclick="BulkEmployees.downloadCredentials()">Download credential yang sudah berhasil dibuat</button>' : ''}</div>`;
    window.showToast?.('Bulk upload belum selesai.', 'error');
  } finally {
    busy = false;
  }
}

export async function createSingleEmployee(input = {}) {
  const password = String(input.password || '');
  const row = {
    _row_number: 2,
    employee_code: input.employeeCode,
    full_name: input.name,
    email: input.email,
    phone: input.phone,
    role: input.role || 'Field Sales',
    area: input.area || '',
    position: input.position || input.role || 'Field Sales',
    project_code: input.projectId,
    supervisor_email: input.supervisorEmail || '',
    status: input.status || 'active',
    create_login: 'YA',
    salesTargetAmount: Number(input.salesTargetAmount || 0),
    attendancePointId: input.attendancePointId || '',
    photo: input.photo || '',
    joinDate: input.joinDate || new Date().toISOString().slice(0,10),
  };
  const preview = await apiJson('/api/bulk/employees/preview', { rows:[row] });
  const checked = preview.rows?.[0];
  if (!checked?.valid) {
    const error = new Error((checked?.errors || ['VALIDATION_FAILED']).join(', '));
    error.code = checked?.errors?.[0] || 'VALIDATION_FAILED';
    error.payload = preview;
    throw error;
  }
  if (checked.loginAction === 'create' && !password) throw new Error('PASSWORD_REQUIRED');
  const data = await apiJson('/api/bulk/employees/commit', {
    importId: `SINGLE-${crypto.randomUUID()}`,
    chunkId: '1',
    finalChunk: true,
    sourceName: 'single-employee-form',
    rows: [{ ...row, ...(checked.loginAction === 'create' ? { initial_password: password } : {}) }],
  }, { retries:2 });
  await refreshFromCloud();
  return data;
}

export async function updateSingleEmployee(input = {}) {
  const row = {
    _row_number: 2,
    employee_code: input.employeeCode,
    full_name: input.name,
    email: input.email,
    phone: input.phone,
    role: input.role || 'Field Sales',
    area: input.area || '',
    position: input.position || input.role || 'Field Sales',
    project_code: input.projectId,
    supervisor_email: input.supervisorEmail || '',
    status: input.status || 'active',
    create_login: 'TIDAK',
    salesTargetAmount: Number(input.salesTargetAmount || 0),
    attendancePointId: input.attendancePointId || '',
    photo: input.photo || '',
    joinDate: input.joinDate || '',
  };
  const preview = await apiJson('/api/bulk/employees/preview', { rows:[row] });
  const checked = preview.rows?.[0];
  if (!checked?.valid) {
    const error = new Error((checked?.errors || ['VALIDATION_FAILED']).join(', '));
    error.code = checked?.errors?.[0] || 'VALIDATION_FAILED';
    error.payload = preview;
    throw error;
  }
  const data = await apiJson('/api/bulk/employees/commit', {
    importId: `SINGLE-UPDATE-${crypto.randomUUID()}`,
    chunkId: '1',
    finalChunk: true,
    sourceName: 'single-employee-edit',
    rows:[row],
  }, { retries:2 });
  await refreshFromCloud();
  return data;
}

export function downloadTemplate() {
  download('ProQTrack_Bulk_Employee_Template.csv', templateCsv());
}

export function downloadCredentials() {
  if (!generatedCredentials.length) return;
  const rows = [
    ['employee_code','full_name','email','initial_password'],
    ...generatedCredentials.map(row => [row.employeeCode,row.fullName,row.email,row.initialPassword]),
  ];
  download('ProQTrack_Bulk_Login_Credentials.csv', '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\n') + '\n');
}

export function reset() {
  currentRows = [];
  currentPreview = [];
  currentFileName = '';
  generatedCredentials = [];
  passwordByRow = new Map();
  const input = document.getElementById('bulkEmployeeFile');
  if (input) input.value = '';
  renderPreview();
}

export function open() {
  const account = window.FT?.state?.account;
  if (!account || !['superadmin','head','admin','manager'].includes(String(account.role || '').toLowerCase())) {
    window.showToast?.('Akses bulk upload ditolak.', 'error');
    return;
  }
  currentRows = [];
  currentPreview = [];
  generatedCredentials = [];
  passwordByRow = new Map();
  window.FT.closeModal?.();
  const root = document.getElementById('modalRoot');
  if (!root) return;
  root.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)FT.closeModal()">
      <div class="modal animate-up bulk-modal">
        <div class="modal-handle"></div>
        <div class="modal-header"><div><h3>Bulk Upload Karyawan</h3><div class="bulk-muted">CSV atau XLSX · sheet pertama · maksimal ${MAX_FILE_ROWS} row</div></div><button class="modal-close" onclick="FT.closeModal()">✕</button></div>
        <div class="modal-body">
          <div class="bulk-guide">
            <strong>1. Download template</strong>
            <span>Isi employee_code, full_name dan project_code. create_login=YA untuk membuat login server.</span>
            <button class="btn btn-secondary" type="button" onclick="BulkEmployees.downloadTemplate()">Download Template CSV</button>
          </div>
          <div class="bulk-guide">
            <strong>2. Upload file</strong>
            <span>XLSX dibaca langsung di browser tanpa mengirim file mentah ke server. Server hanya menerima row JSON yang sudah diparsing untuk validasi.</span>
            <input class="input" id="bulkEmployeeFile" type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange="BulkEmployees.handleFile(this)">
          </div>
          <div id="bulkEmployeePreview"><div class="bulk-empty">Pilih file untuk preview.</div></div>
        </div>
      </div>
    </div>`;
}

function installStyles() {
  if (document.getElementById('bulk-employee-css')) return;
  const style = document.createElement('style');
  style.id = 'bulk-employee-css';
  style.textContent = `
    .bulk-modal{width:min(1120px,96vw);max-height:92vh}
    .bulk-guide{display:grid;grid-template-columns:minmax(160px,.6fr) minmax(260px,1.5fr) auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--gray-100)}
    .bulk-muted{font-size:12px;color:var(--gray-400)}
    .bulk-empty,.bulk-loading{padding:36px;text-align:center;color:var(--gray-400)}
    .bulk-summary{display:grid;grid-template-columns:repeat(6,minmax(90px,1fr));gap:8px;margin:16px 0}
    .bulk-summary>div{padding:10px;border:1px solid var(--gray-200);border-radius:12px;background:var(--gray-50);display:grid}
    .bulk-summary strong{font-size:20px}.bulk-summary span{font-size:11px;color:var(--gray-400)}
    .bulk-summary .danger strong{color:#dc2626}
    .bulk-table-wrap{overflow:auto;max-height:44vh;border:1px solid var(--gray-200);border-radius:12px}
    .bulk-table{min-width:920px}.bulk-notes{font-size:11px;max-width:260px}
    .bulk-badge{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700}
    .bulk-ok{background:#dcfce7;color:#166534}.bulk-warning{background:#fef3c7;color:#92400e}.bulk-error{background:#fee2e2;color:#991b1b}
    .bulk-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
    .bulk-error-box{margin-top:16px;padding:16px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
    .bulk-success{text-align:center;padding:28px}.bulk-success-mark{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;margin:0 auto 12px;background:#dcfce7;color:#166534;font-size:28px;font-weight:800}
    .bulk-credential-warning{max-width:640px;margin:16px auto;padding:12px;border-radius:10px;background:#fff7ed;color:#9a3412}
    .bulk-success .btn{margin:6px}
    @media(max-width:800px){.bulk-guide{grid-template-columns:1fr}.bulk-summary{grid-template-columns:repeat(3,1fr)}}
  `;
  document.head.appendChild(style);
}

if (typeof window !== 'undefined') {
  installStyles();
  window.BulkEmployees = { open, handleFile, commit, reset, downloadTemplate, downloadCredentials, createSingleEmployee, updateSingleEmployee };
}

export const __test = { MAX_FILE_ROWS, PREVIEW_CHUNK, COMMIT_CHUNK, summary, strongInitialPassword, duplicateErrors };
