import { authHeaders } from './lib/uploads.js';
import { getDB } from './lib/db.js';
import { bootstrapOperationalData, applyRemoteDataToLocal } from './lib/cloud-data.js';
import { parseBulkMasterFile, masterTemplateCsv, masterEntityConfig } from './lib/bulk-master-upload.js';

const MAX_FILE_ROWS=500;
const PREVIEW_CHUNK=200;
const COMMIT_CHUNK=50;

let currentEntity='';
let currentRows=[];
let currentPreview=[];
let currentFileName='';
let currentImportId='';
let busy=false;

const esc=value=>String(value??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'","&#039;");

function chunks(rows,size){
  const out=[];
  for(let i=0;i<rows.length;i+=size) out.push(rows.slice(i,i+size));
  return out;
}

async function apiJson(path,body,{retries=0}={}){
  const payload=JSON.stringify(body);
  let lastError=null;
  for(let attempt=0;attempt<=retries;attempt+=1){
    try{
      const res=await fetch(path,{
        method:'POST',
        headers:authHeaders({'content-type':'application/json',accept:'application/json'}),
        body:payload,
      });
      const data=await res.json().catch(()=>({}));
      if(res.ok) return data;
      const error=new Error(data.message||data.error||`HTTP ${res.status}`);
      error.code=data.error; error.status=res.status; error.payload=data;
      if(attempt<retries&&(res.status>=500||res.status===429)){
        await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
        lastError=error; continue;
      }
      throw error;
    }catch(error){
      lastError=error;
      if(attempt>=retries || (error?.status && error.status<500 && error.status!==429)) throw error;
      await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
    }
  }
  throw lastError||new Error('NETWORK_ERROR');
}

function download(name,text){
  const blob=new Blob([text],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function previewSummary(rows=currentPreview){
  return {
    total:rows.length,
    valid:rows.filter(r=>r.valid).length,
    errors:rows.filter(r=>!r.valid).length,
    warnings:rows.filter(r=>r.valid&&(r.warnings||[]).length).length,
    inserts:rows.filter(r=>r.valid&&r.action==='create').length,
    updates:rows.filter(r=>r.valid&&r.action==='update').length,
  };
}

function badge(row){
  if(!row.valid) return '<span class="bulk-badge bulk-error">Error</span>';
  if(row.warnings?.length) return '<span class="bulk-badge bulk-warning">Warning</span>';
  return '<span class="bulk-badge bulk-ok">Valid</span>';
}

async function refreshFromCloud(){
  const db=getDB();
  const account=window.FT?.state?.account||{};
  const remote=await bootstrapOperationalData(db,account);
  if(remote?.mode==='cloud'&&remote.data) applyRemoteDataToLocal(db,remote.data);
}

function root(){
  return document.getElementById('bulkMasterPreview');
}

function renderPreview(){
  const el=root();
  if(!el) return;
  if(!currentPreview.length){
    el.innerHTML='<div class="bulk-empty">Pilih file CSV/XLSX untuk memulai.</div>';
    return;
  }
  const sum=previewSummary();
  const visible=currentPreview.slice(0,100);
  const config=masterEntityConfig(currentEntity);
  el.innerHTML=`
    <div class="bulk-summary">
      <div><strong>${sum.total}</strong><span>Rows</span></div>
      <div><strong>${sum.valid}</strong><span>Valid</span></div>
      <div><strong>${sum.inserts}</strong><span>New</span></div>
      <div><strong>${sum.updates}</strong><span>Update</span></div>
      <div><strong>${sum.warnings}</strong><span>Warning</span></div>
      <div class="${sum.errors?'danger':''}"><strong>${sum.errors}</strong><span>Error</span></div>
    </div>
    <div class="bulk-table-wrap">
      <table class="table bulk-table">
        <thead><tr><th>Row</th><th>Key</th><th>Data</th><th>Aksi</th><th>Status</th><th>Catatan</th></tr></thead>
        <tbody>
          ${visible.map(row=>`<tr>
            <td>${row.rowNumber}</td>
            <td><strong>${esc(row.key)}</strong></td>
            <td>${esc(row.label||'—')}</td>
            <td>${row.action==='create'?'New':'Update'}</td>
            <td>${badge(row)}</td>
            <td class="bulk-notes">${[...(row.errors||[]),...(row.warnings||[])].map(esc).join('<br>')||'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${currentPreview.length>visible.length?`<div class="bulk-muted">Menampilkan 100 dari ${currentPreview.length} row. Semua row tetap divalidasi.</div>`:''}
    <div class="bulk-actions">
      <button class="btn btn-secondary" type="button" onclick="BulkMaster.reset()">Ganti File</button>
      <button class="btn btn-primary" type="button" onclick="BulkMaster.commit()" ${sum.errors?'disabled':''}>
        Commit ${sum.valid} ${esc(config?.label||'Data')}
      </button>
    </div>
  `;
}

async function previewRows(rows){
  const out=[];
  for(const group of chunks(rows,PREVIEW_CHUNK)){
    const data=await apiJson(`/api/bulk/master/${encodeURIComponent(currentEntity)}/preview`,{rows:group});
    out.push(...(data.rows||[]));
  }
  return out;
}

export async function handleFile(input){
  const file=input?.files?.[0];
  if(!file||busy) return;
  busy=true;
  try{
    const el=root();
    if(el) el.innerHTML='<div class="bulk-loading">Membaca dan memvalidasi file…</div>';
    currentFileName=file.name;
    currentImportId='';
    currentRows=await parseBulkMasterFile(file,currentEntity);
    if(!currentRows.length) throw new Error('File tidak memiliki data.');
    if(currentRows.length>MAX_FILE_ROWS) throw new Error(`Maksimal ${MAX_FILE_ROWS} row per file.`);
    currentPreview=await previewRows(currentRows);
    renderPreview();
  }catch(error){
    currentRows=[]; currentPreview=[];
    const el=root();
    if(el) el.innerHTML=`<div class="bulk-error-box"><strong>File gagal diproses.</strong><br>${esc(error.message||error)}</div>`;
  }finally{
    busy=false;
  }
}

export async function commit(){
  if(busy||!currentRows.length) return;
  if(currentPreview.some(row=>!row.valid)){
    window.showToast?.('Perbaiki semua error sebelum commit.','error');
    return;
  }
  const config=masterEntityConfig(currentEntity);
  if(!confirm(`Commit ${currentRows.length} ${config?.label||'data'} ke organisasi aktif?`)) return;
  busy=true;
  currentImportId=currentImportId || `BULK-MASTER-${crypto.randomUUID()}`;
  const importId=currentImportId;
  const groups=chunks(currentRows,COMMIT_CHUNK);
  const totals={inserted:0,updated:0};
  try{
    for(let i=0;i<groups.length;i+=1){
      const el=root();
      if(el) el.innerHTML=`<div class="bulk-loading">Commit chunk ${i+1} / ${groups.length}…</div>`;
      const data=await apiJson(`/api/bulk/master/${encodeURIComponent(currentEntity)}/commit`,{
        importId,
        chunkId:String(i+1),
        finalChunk:i===groups.length-1,
        sourceName:currentFileName,
        rows:groups[i],
      },{retries:2});
      if(data.replayed){
        const rowNos=new Set(groups[i].map(row=>Number(row._row_number)));
        const preview=currentPreview.filter(row=>rowNos.has(Number(row.rowNumber)));
        totals.inserted+=preview.filter(row=>row.action==='create').length;
        totals.updated+=preview.filter(row=>row.action==='update').length;
      }else{
        totals.inserted+=Number(data.summary?.inserted||0);
        totals.updated+=Number(data.summary?.updated||0);
      }
    }
    await refreshFromCloud();
    const el=root();
    if(el) el.innerHTML=`
      <div class="bulk-success">
        <div class="bulk-success-mark">✓</div>
        <h3>Bulk upload berhasil</h3>
        <p>${totals.inserted} baru · ${totals.updated} diperbarui.</p>
        <button class="btn btn-secondary" type="button" onclick="FT.closeModal()">Tutup</button>
      </div>`;
    window.showToast?.(`Bulk ${config?.label||'master'} selesai.`,'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }catch(error){
    const detail=error.payload?.rows?.flatMap(row=>row.errors||[]).slice(0,8).join(', ');
    const el=root();
    if(el) el.innerHTML=`<div class="bulk-error-box"><strong>Commit berhenti.</strong><br>${esc(error.message||error)}${detail?`<br><span class="bulk-muted">${esc(detail)}</span>`:''}<br><br>Chunk yang sudah sukses aman dan idempotent. Klik commit ulang setelah masalah diperbaiki.</div>`;
    window.showToast?.('Bulk upload berhenti karena error.','error');
  }finally{
    busy=false;
  }
}

export function downloadTemplate(){
  const config=masterEntityConfig(currentEntity);
  if(!config) return;
  download(config.filename,masterTemplateCsv(currentEntity));
}

export function reset(){
  currentRows=[]; currentPreview=[]; currentFileName=''; currentImportId='';
  const input=document.getElementById('bulkMasterFile');
  if(input) input.value='';
  renderPreview();
}

export function open(entity){
  const account=window.FT?.state?.account;
  const config=masterEntityConfig(entity);
  if(!config){
    window.showToast?.('Jenis bulk upload tidak didukung.','error');
    return;
  }
  if(!account||!['superadmin','head','admin','manager'].includes(String(account.role||'').toLowerCase())){
    window.showToast?.('Akses bulk upload ditolak.','error');
    return;
  }
  if(String(account.role).toLowerCase()==='manager'&&['clients','projects'].includes(entity)){
    window.showToast?.('Bulk Klien/Project hanya untuk Head/Admin/Superadmin.','error');
    return;
  }
  currentEntity=entity; currentRows=[]; currentPreview=[]; currentFileName=''; currentImportId='';
  window.FT.closeModal?.();
  const modal=document.getElementById('modalRoot');
  if(!modal) return;
  modal.innerHTML=`
    <div class="modal-overlay" onclick="if(event.target===this)FT.closeModal()">
      <div class="modal animate-up bulk-modal">
        <div class="modal-handle"></div>
        <div class="modal-header">
          <div>
            <h3>Bulk Upload ${esc(config.label)}</h3>
            <div class="bulk-muted">CSV atau XLSX · maksimal ${MAX_FILE_ROWS} row · preview sebelum commit</div>
          </div>
          <button class="modal-close" onclick="FT.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="bulk-guide">
            <strong>1. Download template</strong>
            <span>Gunakan natural key sesuai template. Jika key sudah ada, row akan di-update, bukan diduplikasi.</span>
            <button class="btn btn-secondary" type="button" onclick="BulkMaster.downloadTemplate()">Download Template CSV</button>
          </div>
          <div class="bulk-guide">
            <strong>2. Upload dan preview</strong>
            <span>File diparsing di browser. Server menerima row JSON untuk validasi tenant, referensi dan scope sebelum commit.</span>
            <input class="input" id="bulkMasterFile" type="file"
              accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onchange="BulkMaster.handleFile(this)">
          </div>
          <div id="bulkMasterPreview"><div class="bulk-empty">Pilih file untuk preview.</div></div>
        </div>
      </div>
    </div>`;
}

function installStyles(){
  if(document.getElementById('bulk-master-css')) return;
  const style=document.createElement('style');
  style.id='bulk-master-css';
  style.textContent=`
    .bulk-modal{width:min(1120px,96vw);max-height:92vh}
    .bulk-guide{display:grid;grid-template-columns:minmax(160px,.6fr) minmax(260px,1.5fr) auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--gray-100)}
    .bulk-muted{font-size:12px;color:var(--gray-400)}
    .bulk-empty,.bulk-loading{padding:36px;text-align:center;color:var(--gray-400)}
    .bulk-summary{display:grid;grid-template-columns:repeat(6,minmax(90px,1fr));gap:8px;margin:16px 0}
    .bulk-summary>div{padding:10px;border:1px solid var(--gray-200);border-radius:12px;background:var(--gray-50);display:grid}
    .bulk-summary strong{font-size:20px}.bulk-summary span{font-size:11px;color:var(--gray-400)}
    .bulk-summary .danger strong{color:#dc2626}
    .bulk-table-wrap{overflow:auto;max-height:44vh;border:1px solid var(--gray-200);border-radius:12px}
    .bulk-table{min-width:860px}.bulk-notes{font-size:11px;max-width:300px}
    .bulk-badge{display:inline-flex;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700}
    .bulk-ok{background:#dcfce7;color:#166534}.bulk-warning{background:#fef3c7;color:#92400e}.bulk-error{background:#fee2e2;color:#991b1b}
    .bulk-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
    .bulk-error-box{margin-top:16px;padding:16px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
    .bulk-success{text-align:center;padding:28px}.bulk-success-mark{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;margin:0 auto 12px;background:#dcfce7;color:#166534;font-size:28px;font-weight:800}
    @media(max-width:800px){.bulk-guide{grid-template-columns:1fr}.bulk-summary{grid-template-columns:repeat(3,1fr)}}
  `;
  document.head.appendChild(style);
}

if(typeof window!=='undefined'){
  installStyles();
  window.BulkMaster={open,handleFile,commit,reset,downloadTemplate};
}

export const __test={MAX_FILE_ROWS,PREVIEW_CHUNK,COMMIT_CHUNK,previewSummary};
