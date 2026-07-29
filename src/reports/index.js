const DB_KEY = 'proqtrack_db_v6';
const DB_V7_KEY = 'proqtrack_db_v7';
const REPORT_ROUTES = new Set([
  '#/reports', '#/reports/attendance', '#/reports/employees', '#/reports/projects',
  '#/reports/field', '#/reports/supervisors', '#/reports/audit'
]);

const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const readDB = () => { try { return JSON.parse(localStorage.getItem(DB_KEY) || localStorage.getItem(DB_V7_KEY) || '{}'); } catch { return {}; } };
const writeDB = db => { const text = JSON.stringify(db); localStorage.setItem(DB_KEY, text); localStorage.setItem(DB_V7_KEY, text); window.dispatchEvent(new CustomEvent('proqtrack:db-updated')); };
const account = () => window.FT?.state?.account || null;
const role = () => String(account()?.role || 'employee').toLowerCase();
const employeeId = () => account()?.employeeId || null;
const fmtDate = v => v ? new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(v)) : '-';
const today = () => new Date().toISOString().slice(0,10);
const monthStart = () => `${today().slice(0,7)}-01`;
const val = (o, keys, fallback='') => keys.map(k => o?.[k]).find(v => v !== undefined && v !== null && v !== '') ?? fallback;
const dateOf = o => String(val(o,['date','attendanceDate','visitDate','createdAt','checkInAt','timestamp','updatedAt'],'')).slice(0,10);
const statusOf = o => String(val(o,['status','attendanceStatus','visitStatus'],'-'));

function ensureSchema(){
  const db = readDB();
  let changed = false;
  for (const [key, initial] of Object.entries({reportTemplates:[],reportJobs:[],reportExports:[],reportFilters:[],auditLogs:[]})) {
    if (!Array.isArray(db[key])) { db[key] = initial; changed = true; }
  }
  if (!db.reportTemplates.length) {
    db.reportTemplates = [
      {id:'RPT-TPL-ATT',name:'Rekap Absensi',type:'attendance',status:'active'},
      {id:'RPT-TPL-EMP',name:'Data Karyawan',type:'employees',status:'active'},
      {id:'RPT-TPL-PRJ',name:'Ringkasan Klien & Project',type:'projects',status:'active'},
      {id:'RPT-TPL-FLD',name:'Aktivitas Lapangan',type:'field',status:'active'}
    ]; changed = true;
  }
  if (changed) writeDB(db);
}

function scoped(db){
  const r = role();
  if (r === 'manager' || r === 'admin') return {employeeIds:null, projectIds:null};
  const myId = employeeId();
  const assignments = db.projectAssignments || [];
  if (r === 'supervisor') {
    const ownProjects = assignments.filter(a => a.employeeId === myId && a.status === 'active').map(a => a.projectId);
    const ids = new Set([myId]);
    assignments.filter(a => ownProjects.includes(a.projectId) && a.status === 'active' && (!a.supervisorId || a.supervisorId === myId || a.employeeId === myId)).forEach(a => ids.add(a.employeeId));
    return {employeeIds:ids, projectIds:new Set(ownProjects)};
  }
  const ownProjects = assignments.filter(a => a.employeeId === myId && a.status === 'active').map(a => a.projectId);
  return {employeeIds:new Set([myId]), projectIds:new Set(ownProjects)};
}

function dataContext(filters={}){
  const db = readDB();
  const scope = scoped(db);
  const employees = (db.employees || []).filter(e => !scope.employeeIds || scope.employeeIds.has(e.id));
  const projects = (db.projects || []).filter(p => !scope.projectIds || scope.projectIds.has(p.id));
  const projectIds = new Set(projects.map(p=>p.id));
  const employeeIds = new Set(employees.map(e=>e.id));
  const start = filters.start || '';
  const end = filters.end || '';
  const inPeriod = row => { const d = dateOf(row); return (!start || !d || d >= start) && (!end || !d || d <= end); };
  const byEmployee = row => !filters.employeeId || val(row,['employeeId','userId']) === filters.employeeId;
  const byProject = row => !filters.projectId || val(row,['projectId']) === filters.projectId;
  const baseScoped = row => {
    const eid = val(row,['employeeId','userId']); const pid = val(row,['projectId']);
    return (!eid || employeeIds.has(eid)) && (!pid || projectIds.has(pid));
  };
  return {
    db, employees, projects,
    clients:(db.clients||[]).filter(c => !filters.clientId || c.id === filters.clientId),
    attendance:(db.attendance||[]).filter(r=>baseScoped(r)&&byEmployee(r)&&byProject(r)&&inPeriod(r)),
    visits:(db.visits||[]).filter(r=>baseScoped(r)&&byEmployee(r)&&byProject(r)&&inPeriod(r)),
    photos:(db.fieldPhotos||db.photos||[]).filter(r=>baseScoped(r)&&byEmployee(r)&&byProject(r)&&inPeriod(r)),
    leaves:(db.leaves||[]).filter(r=>baseScoped(r)&&byEmployee(r)&&inPeriod(r)),
    assignments:(db.projectAssignments||[]).filter(a=>(!scope.projectIds||scope.projectIds.has(a.projectId))&&(!scope.employeeIds||scope.employeeIds.has(a.employeeId)))
  };
}

const employeeName = (ctx,id) => ctx.employees.find(e=>e.id===id)?.name || id || '-';
const projectName = (ctx,id) => ctx.projects.find(p=>p.id===id)?.name || id || '-';
const clientName = (ctx,id) => ctx.db.clients?.find(c=>c.id===id)?.name || id || '-';

function injectStyles(){
  if (document.getElementById('reports-css')) return;
  const s=document.createElement('style'); s.id='reports-css'; s.textContent=`
  .rpt-wrap{display:grid;gap:16px}.rpt-hero{background:linear-gradient(135deg,#fff7ed,#fff);border:1px solid #fed7aa;border-radius:16px;padding:20px;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.rpt-hero h2{font-size:22px;margin:0 0 5px}.rpt-hero p{color:var(--gray-500);margin:0}.rpt-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.rpt-card{background:#fff;border:1px solid var(--gray-200);border-radius:14px;padding:16px}.rpt-card strong{display:block;font-size:24px;color:var(--gray-900)}.rpt-card span{font-size:12px;color:var(--gray-500)}.rpt-builder{background:#fff;border:1px solid var(--gray-200);border-radius:14px;padding:16px}.rpt-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.rpt-actions{display:flex;gap:8px;align-items:end}.rpt-table-wrap{overflow:auto;border:1px solid var(--gray-200);border-radius:12px}.rpt-table{width:100%;border-collapse:collapse;min-width:760px;background:#fff}.rpt-table th,.rpt-table td{padding:10px 12px;border-bottom:1px solid var(--gray-100);text-align:left;font-size:12px}.rpt-table th{background:var(--gray-50);color:var(--gray-600);font-weight:700;position:sticky;top:0}.rpt-nav{display:flex;gap:8px;flex-wrap:wrap}.rpt-nav a{padding:8px 11px;border:1px solid var(--gray-200);border-radius:8px;text-decoration:none;color:var(--gray-600);background:#fff;font-size:12px}.rpt-nav a.active{background:var(--brand-light);color:var(--brand-dark);border-color:#fed7aa}.rpt-empty{padding:36px;text-align:center;color:var(--gray-400)}.rpt-badge{display:inline-flex;padding:3px 8px;border-radius:999px;background:var(--gray-100);font-size:11px}.rpt-list{display:grid;gap:9px}.rpt-list-item{display:flex;justify-content:space-between;gap:10px;padding:11px;border:1px solid var(--gray-100);border-radius:10px}.rpt-warning{padding:10px 12px;border-radius:10px;background:#fffbeb;color:#92400e;font-size:12px}.rpt-page-title{display:flex;justify-content:space-between;align-items:center;gap:12px}.rpt-page-title h3{font-size:18px}.rpt-seg{display:flex;gap:6px;flex-wrap:wrap}.rpt-seg button{border:1px solid var(--gray-200);background:#fff;padding:7px 10px;border-radius:8px;cursor:pointer}.rpt-seg button.active{background:var(--brand);color:#fff;border-color:var(--brand)}
  @media(max-width:1000px){.rpt-grid,.rpt-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.rpt-grid,.rpt-filters{grid-template-columns:1fr}.rpt-hero{flex-direction:column}.rpt-actions{align-items:stretch;flex-direction:column}.rpt-actions .btn{width:100%}}
  `; document.head.appendChild(s);
}

function ensureNav(){
  if (!account()) return;
  const nav=document.querySelector('.sidebar-nav'); if(!nav || nav.querySelector('[data-reports-nav]')) return;
  const wrap=document.createElement('div'); wrap.dataset.reportsNav='1';
  wrap.innerHTML=`<div class="nav-section-label">Analitik</div><a class="nav-item ${location.hash.startsWith('#/reports')?'active':''}" href="#/reports"><span class="nav-icon">▧</span><span>Laporan</span></a>`;
  nav.appendChild(wrap);
}

function setShell(title,subtitle){
  const t=document.querySelector('.topbar-title'); if(t)t.textContent=title;
  const st=document.querySelector('.topbar-subtitle'); if(st){st.textContent=subtitle;st.style.display='block';}
}
function contentRoot(){ return document.querySelector('.content'); }
function navTabs(){
  const tabs=[['#/reports','Ringkasan'],['#/reports/attendance','Kehadiran'],['#/reports/employees','Karyawan'],['#/reports/projects','Klien & Project'],['#/reports/field','Aktivitas Lapangan'],['#/reports/supervisors','Supervisor'],['#/reports/audit','Audit']];
  return `<div class="rpt-nav">${tabs.map(([r,l])=>`<a href="${r}" class="${location.hash===r?'active':''}">${l}</a>`).join('')}</div>`;
}

function options(rows,label,selected=''){ return `<option value="">Semua</option>${rows.map(r=>`<option value="${esc(r.id)}" ${selected===r.id?'selected':''}>${esc(label(r))}</option>`).join('')}`; }
function filtersFromForm(){ const f=document.getElementById('rptFilterForm'); if(!f)return {}; return Object.fromEntries(new FormData(f).entries()); }

function builder(){
  const ctx=dataContext();
  return `<div class="rpt-builder"><div class="rpt-page-title"><div><h3>Report Builder</h3><p style="color:var(--gray-500);font-size:12px">Segmentasi data sebelum dokumen atau datasheet dibuat.</p></div><span class="rpt-badge">Fase 1</span></div><form id="rptFilterForm" class="rpt-filters" style="margin-top:14px" onsubmit="Reports.preview(event)"><div><label class="label">Jenis Laporan</label><select class="select" name="type"><option value="attendance">Kehadiran</option><option value="employees">Karyawan</option><option value="projects">Klien & Project</option><option value="field">Aktivitas Lapangan</option><option value="supervisors">Supervisor</option></select></div><div><label class="label">Klien</label><select class="select" name="clientId" onchange="Reports.syncProjects()">${options(ctx.db.clients||[],x=>x.name)}</select></div><div><label class="label">Project</label><select class="select" name="projectId">${options(ctx.projects,x=>`${x.code||''} — ${x.name}`)}</select></div><div><label class="label">Karyawan</label><select class="select" name="employeeId">${options(ctx.employees,x=>x.name)}</select></div><div><label class="label">Periode Mulai</label><input class="input" type="date" name="start" value="${monthStart()}"></div><div><label class="label">Periode Akhir</label><input class="input" type="date" name="end" value="${today()}"></div><div><label class="label">Status</label><select class="select" name="status"><option value="">Semua</option><option>present</option><option>late</option><option>absent</option><option>leave</option><option>active</option><option>inactive</option></select></div><div class="rpt-actions"><button class="btn btn-primary" type="submit">Tampilkan Preview</button><button class="btn btn-secondary" type="button" onclick="Reports.saveDraft()">Simpan Filter</button></div></form><div id="rptPreview" style="margin-top:16px"><div class="rpt-empty">Pilih filter lalu tampilkan preview.</div></div><div class="rpt-warning" style="margin-top:12px">Export XLSX, PDF, DOCX dan ZIP akan diaktifkan pada Fase 3. Fase ini fokus pada segmentasi, preview, dan validasi data.</div></div>`;
}

function overview(){
  const c=dataContext({start:monthStart(),end:today()});
  const late=c.attendance.filter(x=>/late|terlambat/i.test(statusOf(x))).length;
  return `<div class="rpt-wrap"><div class="rpt-hero"><div><h2>Pusat Laporan ProQTrack</h2><p>Bangun laporan tersegmentasi berdasarkan klien, project, periode, supervisor, dan karyawan.</p></div><span class="rpt-badge">Fase 1 & 2</span></div>${navTabs()}<div class="rpt-grid"><div class="rpt-card"><strong>${c.employees.length}</strong><span>Karyawan dalam cakupan akses</span></div><div class="rpt-card"><strong>${c.projects.filter(x=>x.status==='active').length}</strong><span>Project aktif</span></div><div class="rpt-card"><strong>${c.attendance.length}</strong><span>Record absensi periode ini</span></div><div class="rpt-card"><strong>${late}</strong><span>Keterlambatan periode ini</span></div></div>${builder()}</div>`;
}

function table(headers,rows){ return rows.length?`<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:`<div class="rpt-empty">Tidak ada data sesuai cakupan dan filter.</div>`; }

function attendancePage(filters={start:monthStart(),end:today()}){
  const c=dataContext(filters); const rows=c.attendance.map(a=>[fmtDate(dateOf(a)),esc(employeeName(c,val(a,['employeeId','userId']))),esc(projectName(c,a.projectId)),`<span class="rpt-badge">${esc(statusOf(a))}</span>`,esc(val(a,['checkIn','checkInAt','timeIn'],'-')),esc(val(a,['checkOut','checkOutAt','timeOut'],'-')),esc(val(a,['area','locationName','location'],'-'))]);
  return page('Laporan Kehadiran','Rekap jam masuk, pulang, status, lokasi, dan project.',table(['Tanggal','Karyawan','Project','Status','Masuk','Pulang','Lokasi'],rows));
}
function employeesPage(){
  const c=dataContext(); const rows=c.employees.map(e=>{const ass=c.assignments.filter(a=>a.employeeId===e.id&&a.status==='active');return [esc(e.id),esc(e.name),esc(val(e,['role','jobRole'],'-')),esc(val(e,['area','region'],'-')),`<span class="rpt-badge">${esc(e.status||'-')}</span>`,esc(ass.map(a=>projectName(c,a.projectId)).join(', ')||'-')];});
  return page('Laporan Karyawan','Profil, status, area, dan penempatan project.',table(['ID','Nama','Jabatan','Area','Status','Project Aktif'],rows));
}
function projectsPage(){
  const c=dataContext(); const rows=c.projects.map(p=>{const ass=c.assignments.filter(a=>a.projectId===p.id&&a.status==='active');const visits=c.visits.filter(v=>v.projectId===p.id);return [esc(p.code||p.id),esc(p.name),esc(clientName(c,p.clientId)),`<span class="rpt-badge">${esc(p.status||'-')}</span>`,esc(fmtDate(p.startDate)),esc(fmtDate(p.endDate)),String(ass.length),String(visits.length)];});
  return page('Laporan Klien & Project','Headcount, periode, status, dan aktivitas project.',table(['Kode','Project','Klien','Status','Mulai','Selesai','HC Aktif','Visit'],rows));
}
function fieldPage(filters={start:monthStart(),end:today()}){
  const c=dataContext(filters); const combined=[...c.visits.map(v=>({type:'Kunjungan',...v})),...c.photos.map(p=>({type:'Foto',...p}))].sort((a,b)=>dateOf(b).localeCompare(dateOf(a))); const rows=combined.map(x=>[fmtDate(dateOf(x)),esc(x.type),esc(employeeName(c,val(x,['employeeId','userId']))),esc(projectName(c,x.projectId)),esc(val(x,['outletName','title','category','photoType'],'-')),`<span class="rpt-badge">${esc(statusOf(x))}</span>`]);
  return page('Laporan Aktivitas Lapangan','Kunjungan dan dokumentasi foto dalam satu timeline.',table(['Tanggal','Aktivitas','Karyawan','Project','Detail','Status'],rows));
}
function supervisorsPage(){
  const c=dataContext(); const supervisors=c.employees.filter(e=>/supervisor/i.test(String(e.role||'')) || c.assignments.some(a=>a.employeeId===e.id&&a.roleOnProject==='supervisor')); const rows=supervisors.map(s=>{const team=new Set(c.assignments.filter(a=>a.supervisorId===s.id&&a.status==='active').map(a=>a.employeeId));const prj=new Set(c.assignments.filter(a=>(a.employeeId===s.id||a.supervisorId===s.id)&&a.status==='active').map(a=>a.projectId));const att=c.attendance.filter(a=>team.has(a.employeeId));const present=att.filter(a=>/present|hadir|late|terlambat/i.test(statusOf(a))).length;return [esc(s.name),String(team.size),String(prj.size),String(att.length),att.length?`${Math.round(present/att.length*100)}%`:'-'];});
  return page('Laporan Supervisor','Cakupan tim, project, dan tingkat kehadiran.',table(['Supervisor','Anggota','Project','Record Absensi','Kehadiran'],rows));
}
function auditPage(){
  const db=readDB(); const logs=(db.auditLogs||[]).slice().reverse(); const rows=logs.map(l=>[fmtDate(l.createdAt),esc(l.actorName||l.actorId||'-'),esc(l.action||'-'),esc(l.entityType||'-'),esc(l.entityId||'-'),esc(l.description||'-')]);
  return page('Audit Log','Riwayat perubahan data dan aktivitas pengguna.',table(['Waktu','Pelaku','Aksi','Entitas','ID','Keterangan'],rows)+(!logs.length?'<div class="rpt-warning" style="margin-top:12px">Audit log mulai terisi saat filter laporan disimpan dan akan diperluas pada hardening backend.</div>':'');
}
function page(title,subtitle,body){ return `<div class="rpt-wrap">${navTabs()}<div class="rpt-page-title"><div><h3>${esc(title)}</h3><p style="color:var(--gray-500);font-size:12px">${esc(subtitle)}</p></div><a class="btn btn-secondary btn-sm" href="#/reports">Report Builder</a></div>${body}</div>`; }

function previewRows(type,filters){
  const c=dataContext(filters); const status=filters.status;
  if(type==='attendance'){ let rows=c.attendance; if(status)rows=rows.filter(x=>statusOf(x)===status); return table(['Tanggal','Karyawan','Project','Status'],rows.map(a=>[fmtDate(dateOf(a)),esc(employeeName(c,a.employeeId)),esc(projectName(c,a.projectId)),esc(statusOf(a))])); }
  if(type==='employees'){ let rows=c.employees; if(status)rows=rows.filter(x=>x.status===status); return table(['ID','Nama','Role','Area','Status'],rows.map(e=>[esc(e.id),esc(e.name),esc(e.role||'-'),esc(e.area||'-'),esc(e.status||'-')])); }
  if(type==='projects'){ let rows=c.projects.filter(p=>!filters.clientId||p.clientId===filters.clientId); if(status)rows=rows.filter(x=>x.status===status); return table(['Kode','Project','Klien','Status'],rows.map(p=>[esc(p.code||p.id),esc(p.name),esc(clientName(c,p.clientId)),esc(p.status||'-')])); }
  if(type==='field') return table(['Tanggal','Jenis','Karyawan','Project'],[...c.visits.map(v=>[fmtDate(dateOf(v)),'Kunjungan',esc(employeeName(c,v.employeeId)),esc(projectName(c,v.projectId))]),...c.photos.map(p=>[fmtDate(dateOf(p)),'Foto',esc(employeeName(c,p.employeeId)),esc(projectName(c,p.projectId))])]);
  return supervisorsPage();
}

window.Reports={
  preview(e){e.preventDefault();const filters=filtersFromForm();document.getElementById('rptPreview').innerHTML=previewRows(filters.type,filters);},
  syncProjects(){const f=document.getElementById('rptFilterForm');if(!f)return;const db=readDB(),clientId=f.clientId.value,ctx=dataContext();const projects=ctx.projects.filter(p=>!clientId||p.clientId===clientId);f.projectId.innerHTML=options(projects,x=>`${x.code||''} — ${x.name}`);},
  saveDraft(){const filters=filtersFromForm(),db=readDB();db.reportFilters=db.reportFilters||[];const item={id:`RPF-${Date.now()}`,name:`${filters.type} ${filters.start||''}–${filters.end||''}`,filters,createdAt:new Date().toISOString(),createdBy:account()?.id||null};db.reportFilters.push(item);db.auditLogs=db.auditLogs||[];db.auditLogs.push({id:`AUD-${Date.now()}`,createdAt:new Date().toISOString(),actorId:account()?.id,actorName:account()?.email||account()?.name,action:'create',entityType:'report_filter',entityId:item.id,description:'Menyimpan filter laporan'});writeDB(db);window.showToast?.('Filter laporan disimpan','success');}
};

function renderRoute(){
  if(!REPORT_ROUTES.has(location.hash))return false;
  const root=contentRoot(); if(!root)return false;
  let html=''; let title='Laporan'; let subtitle='Analitik dan segmentasi data operasional';
  if(location.hash==='#/reports')html=overview();
  else if(location.hash==='#/reports/attendance')html=attendancePage();
  else if(location.hash==='#/reports/employees')html=employeesPage();
  else if(location.hash==='#/reports/projects')html=projectsPage();
  else if(location.hash==='#/reports/field')html=fieldPage();
  else if(location.hash==='#/reports/supervisors')html=supervisorsPage();
  else html=auditPage();
  root.innerHTML=html; root.dataset.reportsRoute=location.hash; setShell(title,subtitle); return true;
}
let queued=false;
function sync(){queued=false;injectStyles();ensureNav();renderRoute();document.querySelectorAll('[data-reports-nav] .nav-item').forEach(x=>x.classList.toggle('active',location.hash.startsWith('#/reports')));}
new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(sync);}}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>setTimeout(sync));
window.addEventListener('storage',sync);
ensureSchema();sync();
export {};
