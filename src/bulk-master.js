import { authHeaders } from './lib/uploads.js';
import { getDB } from './lib/db.js';
import { bootstrapOperationalData, applyRemoteDataToLocal, cloudDataStatus } from './lib/cloud-data.js';
import { parseBulkMatrix, normalizeRowsForSchema, templateCsvForHeaders } from './lib/bulk-upload.js';

const MAX_FILE_ROWS = 1000;
const PREVIEW_CHUNK = 100;
const COMMIT_CHUNK = 50;

const SCHEMAS = Object.freeze({
  clients: {
    label:'Client',
    headers:['code','name','legal_name','industry','npwp','status','address','city','province','website','pic_name','pic_role','pic_phone','pic_email','cooperation_start','cooperation_end','notes'],
    required:['code','name'],
    key:row=>String(row.code||'').toLowerCase(),
  },
  projects: {
    label:'Project',
    headers:['code','name','client_code','status','start_date','end_date','target_visits','target_outlets','notes'],
    required:['code','name','client_code'],
    aliases:{client_code:['client','client id','client_id','kode klien','kode_client']},
    key:row=>String(row.code||'').toLowerCase(),
  },
  outlets: {
    label:'Outlet',
    headers:['code','name','project_code','address','latitude','longitude','geofence_radius_m','type','channel','ownership','area','phone','owner','visit_frequency','status','notes'],
    required:['code','name','project_code','latitude','longitude'],
    aliases:{project_code:['project','project id','project_id','kode project'],latitude:['lat'],longitude:['lng','lon']},
    key:row=>String(row.code||'').toLowerCase(),
  },
  products: {
    label:'Product',
    headers:['sku','name','project_code','brand','category','unit','price','cost','margin','status'],
    required:['sku','name','project_code'],
    aliases:{project_code:['project','project id','project_id','kode project']},
    key:row=>String(row.sku||'').toLowerCase(),
  },
  competitors: {
    label:'Competitor',
    headers:['code','name','category','color','status','notes'],
    required:['code','name'],
    key:row=>String(row.code||'').toLowerCase(),
  },
  competitorProducts: {
    label:'Competitor Product',
    headers:['competitor_code','sku','name','unit','typical_price','status'],
    required:['competitor_code','sku','name'],
    aliases:{competitor_code:['competitor','competitor id','competitor_id','kode kompetitor'],typical_price:['price','typicalPrice']},
    key:row=>`${String(row.competitor_code||'').toLowerCase()}::${String(row.sku||'').toLowerCase()}`,
  },
  attendancePoints: {
    label:'Attendance Point',
    headers:['code','name','type','address','outlet_code','latitude','longitude','radius_m','status'],
    required:['code','name'],
    aliases:{outlet_code:['outlet','outlet id','outlet_id','kode outlet'],latitude:['lat'],longitude:['lng','lon'],radius_m:['radius','radiusM']},
    key:row=>String(row.code||'').toLowerCase(),
  },
});

let state = {
  entity:'',
  rows:[],
  preview:[],
  fileName:'',
  busy:false,
};

const esc = value => String(value ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'","&#039;");

const chunks = (rows,size) => {
  const out=[];
  for(let i=0;i<rows.length;i+=size) out.push(rows.slice(i,i+size));
  return out;
};

async function apiJson(path, body, { retries = 0 } = {}) {
  const payload = JSON.stringify(body);
  let lastError;
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
      error.status=res.status; error.code=data.error; error.payload=data;
      if(attempt<retries && (res.status>=500 || res.status===429)){
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

function duplicateErrors(rows,schema){
  const seen=new Map(), errors=new Map();
  const add=(row,code)=>{
    if(!errors.has(row)) errors.set(row,[]);
    errors.get(row).push(code);
  };
  for(const row of rows){
    const key=schema.key?.(row);
    if(!key) continue;
    const n=Number(row._row_number);
    if(seen.has(key)){
      add(n,`DUPLICATE_ROW_${seen.get(key)}`);
      add(seen.get(key),`DUPLICATE_ROW_${n}`);
    } else seen.set(key,n);
  }
  return errors;
}

async function previewAll(entity,rows){
  const result=[];
  for(const group of chunks(rows,PREVIEW_CHUNK)){
    const data=await apiJson('/api/bulk/master/preview',{entity,rows:group});
    result.push(...(data.rows||[]));
  }
  const schema=SCHEMAS[entity];
  const duplicates=duplicateErrors(rows,schema);
  return result.map(row=>{
    const extra=duplicates.get(Number(row.rowNumber))||[];
    if(!extra.length) return row;
    return {...row,valid:false,errors:[...new Set([...(row.errors||[]),...extra])]};
  });
}

async function refreshCloud(){
  const db=getDB();
  const account=window.FT?.state?.account||{};
  const remote=await bootstrapOperationalData(db,account);
  if(remote?.mode!=='cloud' || !remote.data) throw new Error('Data tersimpan, tetapi refresh cloud belum berhasil. Coba lanjutkan kembali.');
  applyRemoteDataToLocal(db,remote.data);
}

function summary(){
  const rows=state.preview;
  return {
    total:rows.length,
    valid:rows.filter(x=>x.valid).length,
    errors:rows.filter(x=>!x.valid).length,
    inserts:rows.filter(x=>x.valid&&x.action==='create').length,
    updates:rows.filter(x=>x.valid&&x.action==='update').length,
  };
}

function renderPreview(){
  const root=document.getElementById('bulkMasterPreview');
  if(!root) return;
  if(!state.preview.length){
    root.innerHTML='<div class="bulk-empty">Pilih file CSV/XLSX untuk preview.</div>';
    return;
  }
  const s=summary();
  root.innerHTML=`
    <div class="bulk-summary">
      <div><strong>${s.total}</strong><span>Rows</span></div>
      <div><strong>${s.valid}</strong><span>Valid</span></div>
      <div><strong>${s.inserts}</strong><span>New</span></div>
      <div><strong>${s.updates}</strong><span>Update</span></div>
      <div class="${s.errors?'danger':''}"><strong>${s.errors}</strong><span>Error</span></div>
    </div>
    <div class="bulk-table-wrap"><table class="table bulk-table">
      <thead><tr><th>Row</th><th>Code/SKU</th><th>Name</th><th>Reference</th><th>Action</th><th>Status</th><th>Notes</th></tr></thead>
      <tbody>
      ${state.preview.slice(0,150).map(row=>`<tr>
        <td>${row.rowNumber}</td>
        <td><strong>${esc(row.display?.code||'—')}</strong></td>
        <td>${esc(row.display?.name||'—')}</td>
        <td class="bulk-muted">${esc(row.display?.reference||'—')}</td>
        <td>${row.action==='create'?'New':'Update'}</td>
        <td>${row.valid?'<span class="bulk-badge bulk-ok">Valid</span>':'<span class="bulk-badge bulk-error">Error</span>'}</td>
        <td class="bulk-notes">${[...(row.errors||[]),...(row.warnings||[])].map(esc).join('<br>')||'—'}</td>
      </tr>`).join('')}
      </tbody>
    </table></div>
    <div class="bulk-actions">
      <button class="btn btn-secondary" data-pqt-onclick="BulkMaster.reset()" type="button">Ganti File</button>
      <button class="btn btn-primary" data-pqt-onclick="BulkMaster.commit()" type="button" ${s.errors?'disabled':''}>Commit ${s.valid} Rows</button>
    </div>
  `;
}

async function handleFile(input){
  const file=input?.files?.[0];
  if(!file||state.busy) return;
  state.busy=true;
  const root=document.getElementById('bulkMasterPreview');
  try{
    if(root) root.innerHTML='<div class="bulk-loading">Membaca dan memvalidasi file…</div>';
    const schema=SCHEMAS[state.entity];
    const matrix=await parseBulkMatrix(file);
    const rows=normalizeRowsForSchema(matrix,schema);
    if(!rows.length) throw new Error('File tidak memiliki data.');
    if(rows.length>MAX_FILE_ROWS) throw new Error(`Maksimal ${MAX_FILE_ROWS} rows per file.`);
    state.fileName=file.name;
    state.importId='';
    state.rows=rows;
    state.preview=await previewAll(state.entity,rows);
    renderPreview();
  }catch(error){
    state.rows=[]; state.preview=[];
    if(root) root.innerHTML=`<div class="bulk-error-box"><strong>File gagal diproses.</strong><br>${esc(error.message||error)}</div>`;
  }finally{state.busy=false;}
}

async function commit(){
  if(state.busy||!state.rows.length) return;
  const cloud = cloudDataStatus();
  if (cloud.syncing || cloud.queued || cloud.error) { window.showToast?.('Tunggu sinkronisasi data selesai sebelum bulk upload.','error'); return; }
  const s=summary();
  if(s.errors){ window.showToast?.('Perbaiki semua error sebelum commit.','error'); return; }
  if(!confirm(`Simpan ${s.valid} ${SCHEMAS[state.entity].label}?`)) return;
  state.busy=true;
  const importId=state.importId ||= `MASTER-${crypto.randomUUID()}`;
  const groups=chunks(state.rows,COMMIT_CHUNK);
  const root=document.getElementById('bulkMasterPreview');
  let inserted=0,updated=0;
  try{
    for(let i=0;i<groups.length;i+=1){
      if(root) root.innerHTML=`<div class="bulk-loading">Commit chunk ${i+1} / ${groups.length}…</div>`;
      const data=await apiJson('/api/bulk/master/commit',{
        entity:state.entity,
        importId,
        chunkId:String(i+1),
        totalChunks:groups.length,
        rows:groups[i],
      },{retries:2});
      inserted+=Number(data.summary?.inserts||0);
      updated+=Number(data.summary?.updates||0);
    }
    await refreshCloud();
    if(root) root.innerHTML=`<div class="bulk-success"><div class="bulk-success-mark">✓</div><h3>Bulk upload berhasil</h3><p>${inserted} baru · ${updated} diperbarui.</p><button class="btn btn-primary" data-pqt-onclick="FT.closeModal()">Tutup</button></div>`;
    window.showToast?.(`Bulk ${SCHEMAS[state.entity].label} selesai.`,'success');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }catch(error){
    if(root) root.innerHTML=`<div class="bulk-error-box"><strong>Commit berhenti.</strong><br>${esc(error.message||error)}<br><br>${inserted} baru · ${updated} diperbarui sebelum proses berhenti. Lanjutkan dengan file yang sama.<br><button class="btn btn-primary" data-pqt-onclick="BulkMaster.commit()">Lanjutkan</button></div>`;
    window.showToast?.('Bulk upload belum selesai.','error');
  }finally{state.busy=false;}
}

function reset(){
  if(state.busy) return;
  state.importId='';
  state.rows=[];state.preview=[];state.fileName='';
  const input=document.getElementById('bulkMasterFile');
  if(input) input.value='';
  renderPreview();
}

function downloadTemplate(){
  const schema=SCHEMAS[state.entity];
  if(!schema) return;
  download(`ProQTrack_Bulk_${state.entity}.csv`,templateCsvForHeaders(schema.headers));
}

function open(entity){
  if(state.busy) return;
  const schema=SCHEMAS[entity];
  if(!schema){ window.showToast?.('Tipe bulk upload belum didukung.','error'); return; }
  const role=String(window.FT?.state?.account?.role||'').toLowerCase();
  if(['competitors','competitorProducts'].includes(entity) && !['superadmin','head','admin'].includes(role)){ window.showToast?.('Katalog kompetitor dikelola Head/Admin/Superadmin.','error'); return; }
  if(!['superadmin','head','admin','manager'].includes(role)){ window.showToast?.('Akses bulk upload ditolak.','error'); return; }
  state={entity,rows:[],preview:[],fileName:'',busy:false};
  const root=document.getElementById('modalRoot');
  if(!root) return;
  root.innerHTML=`
    <div class="modal-overlay" data-pqt-onclick="if(event.target===this)FT.closeModal()">
      <div class="modal animate-up bulk-modal">
        <div class="modal-handle"></div>
        <div class="modal-header"><div><h3>Bulk Upload ${esc(schema.label)}</h3><div class="bulk-muted">CSV/XLSX · sheet pertama · maksimal ${MAX_FILE_ROWS} rows</div></div><button class="modal-close" data-pqt-onclick="FT.closeModal()">✕</button></div>
        <div class="modal-body">
          <div class="bulk-guide">
            <strong>1. Download template</strong>
            <span>Kolom wajib: ${schema.required.map(esc).join(', ')}</span>
            <button class="btn btn-secondary" data-pqt-onclick="BulkMaster.downloadTemplate()" type="button">Download Template</button>
          </div>
          <div class="bulk-guide">
            <strong>2. Upload file</strong>
            <span>Pratinjau diperiksa terhadap data organisasi aktif sebelum disimpan.</span>
            <input class="input" id="bulkMasterFile" type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-pqt-onchange="BulkMaster.handleFile(this)">
          </div>
          <div id="bulkMasterPreview"><div class="bulk-empty">Pilih file untuk preview.</div></div>
        </div>
      </div>
    </div>`;
}

if(typeof window!=='undefined'){
  window.BulkMaster={open,handleFile,commit,reset,downloadTemplate};
}

export const __test={SCHEMAS,MAX_FILE_ROWS,PREVIEW_CHUNK,COMMIT_CHUNK,duplicateErrors};
