const DB_KEYS=['proqtrack_db_v6','proqtrack_db_v7'];
const ROUTES=new Set(['#/reports/templates','#/reports/approvals','#/reports/schedules','#/reports/archive']);
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const read=()=>{try{return JSON.parse(localStorage.getItem(DB_KEYS[0])||localStorage.getItem(DB_KEYS[1])||'{}')}catch{return{}}};
const write=db=>{const text=JSON.stringify(db);DB_KEYS.forEach(k=>localStorage.setItem(k,text));window.dispatchEvent(new CustomEvent('proqtrack:db-updated'))};
const account=()=>window.FT?.state?.account||{};
const role=()=>String(account().role||'employee').toLowerCase();
const manager=()=>['manager','admin'].includes(role());
const now=()=>new Date().toISOString();
const uid=p=>`${p}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
const fmt=v=>v?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'-';

function init(){
  const db=read(); let changed=false;
  const arrays=['reportTemplates','reportApprovals','reportSchedules','reportExports','reportJobs','auditLogs'];
  arrays.forEach(k=>{if(!Array.isArray(db[k])){db[k]=[];changed=true}});
  if(!db.reportSettings){db.reportSettings={companyName:'ProQTrack',companyLogo:'./assets/logo-light.svg',documentPrefix:'PQT/RPT',nextNumber:1,defaultApproverRole:'manager',signatureName:'',signatureTitle:'',signatureImage:'',updatedAt:now()};changed=true}
  if(!db.reportTemplates.length){
    db.reportTemplates=[
      {id:'TPL-ATT',name:'Rekap Kehadiran',type:'attendance',layout:'landscape',includeCompanyLogo:true,includeClientLogo:true,requireApproval:true,status:'active',columns:['Tanggal','Karyawan','Project','Status','Masuk','Pulang','Lokasi'],createdAt:now()},
      {id:'TPL-EMP',name:'Laporan Individual Karyawan',type:'individual',layout:'portrait',includeCompanyLogo:true,includeClientLogo:true,requireApproval:true,status:'active',columns:['Profil','Project','Kehadiran','Kunjungan','Foto'],createdAt:now()},
      {id:'TPL-PRJ',name:'Ringkasan Operasional Project',type:'projects',layout:'landscape',includeCompanyLogo:true,includeClientLogo:true,requireApproval:false,status:'active',columns:['Project','Klien','Periode','HC','Visit'],createdAt:now()}
    ]; changed=true;
  }
  if(changed)write(db);
}
function audit(db,action,entityType,entityId,description){db.auditLogs=db.auditLogs||[];db.auditLogs.push({id:uid('AUD'),createdAt:now(),actorId:account().id||null,actorName:account().email||account().name||'-',action,entityType,entityId,description})}
function documentNumber(db){const s=db.reportSettings||{};const year=new Date().getFullYear();return `${s.documentPrefix||'PQT/RPT'}/${String(s.nextNumber||1).padStart(5,'0')}/${year}`}
function tabs(){return `<nav class="rpt-nav" aria-label="Navigasi laporan"><a href="#/reports">Ringkasan</a><a href="#/reports/templates" class="${location.hash==='#/reports/templates'?'active':''}">Template</a><a href="#/reports/approvals" class="${location.hash==='#/reports/approvals'?'active':''}">Approval</a><a href="#/reports/schedules" class="${location.hash==='#/reports/schedules'?'active':''}">Terjadwal</a><a href="#/reports/exports">Riwayat Ekspor</a></nav>`}
function table(headers,rows){return rows.length?`<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'<div class="rpt-empty">Belum ada data.</div>'}
function page(title,subtitle,body){return `<div class="rpt-wrap">${tabs()}<div class="rpt-page-title"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div><span class="rpt-badge">Fase 4</span></div>${body}</div>`}

function templatesPage(){
  const db=read(),s=db.reportSettings||{};
  const settings=`<div class="rpt-builder"><div class="rpt-page-title"><div><h3>Identitas Dokumen</h3><p>Digunakan pada header, nomor dokumen, dan blok tanda tangan.</p></div></div><form class="rpt-filters" onsubmit="ReportPhase4.saveSettings(event)">
    <div><label class="label" for="r4-company">Nama perusahaan</label><input id="r4-company" class="input" name="companyName" value="${esc(s.companyName||'')}"></div>
    <div><label class="label" for="r4-logo">URL/logo perusahaan</label><input id="r4-logo" class="input" name="companyLogo" value="${esc(s.companyLogo||'')}"></div>
    <div><label class="label" for="r4-prefix">Prefix nomor dokumen</label><input id="r4-prefix" class="input" name="documentPrefix" value="${esc(s.documentPrefix||'')}"></div>
    <div><label class="label" for="r4-next">Nomor berikutnya</label><input id="r4-next" class="input" type="number" min="1" name="nextNumber" value="${Number(s.nextNumber||1)}"></div>
    <div><label class="label" for="r4-sign-name">Nama penandatangan</label><input id="r4-sign-name" class="input" name="signatureName" value="${esc(s.signatureName||'')}"></div>
    <div><label class="label" for="r4-sign-title">Jabatan</label><input id="r4-sign-title" class="input" name="signatureTitle" value="${esc(s.signatureTitle||'')}"></div>
    <div><label class="label" for="r4-sign-image">URL gambar tanda tangan</label><input id="r4-sign-image" class="input" name="signatureImage" value="${esc(s.signatureImage||'')}"></div>
    <div class="rpt-actions"><button class="btn btn-primary" type="submit" ${manager()?'':'disabled'}>Simpan Identitas</button></div>
  </form><div class="rpt-warning">Nomor dokumen berikutnya: <strong>${esc(documentNumber(db))}</strong></div></div>`;
  const rows=(db.reportTemplates||[]).map(t=>[esc(t.name),esc(t.type),esc(t.layout||'-'),t.includeCompanyLogo?'Ya':'Tidak',t.includeClientLogo?'Ya':'Tidak',t.requireApproval?'Ya':'Tidak',`<span class="rpt-badge">${esc(t.status||'-')}</span>`,`<button class="btn btn-secondary btn-sm" onclick="ReportPhase4.editTemplate('${esc(t.id)}')" ${manager()?'':'disabled'}>Edit</button>`]);
  return page('Template Dokumen','Atur branding, kolom, layout, logo klien, dan kebutuhan approval.',settings+`<div class="rpt-page-title"><div><h3>Daftar Template</h3><p>Template dapat dikonfigurasi tanpa mengubah kode.</p></div><button class="btn btn-primary btn-sm" onclick="ReportPhase4.newTemplate()" ${manager()?'':'disabled'}>Tambah Template</button></div>`+table(['Nama','Jenis','Layout','Logo Perusahaan','Logo Klien','Approval','Status','Aksi'],rows));
}
function approvalsPage(){
  const db=read(); const rows=(db.reportApprovals||[]).slice().reverse().map(a=>[esc(a.documentNumber),esc(a.title),esc(a.requestedByName||'-'),fmt(a.requestedAt),`<span class="rpt-badge">${esc(a.status)}</span>`,esc(a.approvedByName||'-'),manager()&&a.status==='pending'?`<button class="btn btn-primary btn-sm" onclick="ReportPhase4.approve('${a.id}')">Setujui</button> <button class="btn btn-danger btn-sm" onclick="ReportPhase4.reject('${a.id}')">Tolak</button>`:'-']);
  return page('Approval Laporan','Kontrol tanda tangan dan persetujuan sebelum dokumen dinyatakan final.',`<div class="rpt-page-title"><div><h3>Permintaan Approval</h3><p>Dokumen pending tidak dianggap final.</p></div><button class="btn btn-secondary btn-sm" onclick="ReportPhase4.requestApproval()">Buat Permintaan</button></div>${table(['Nomor','Dokumen','Pemohon','Waktu','Status','Approver','Aksi'],rows)}`);
}
function schedulesPage(){
  const db=read(); const rows=(db.reportSchedules||[]).map(s=>[esc(s.name),esc(s.reportType),esc(s.frequency),esc(s.time||'-'),esc(s.filters?.projectId||'Semua'),fmt(s.nextRunAt),`<span class="rpt-badge">${esc(s.status)}</span>`,`<button class="btn btn-secondary btn-sm" onclick="ReportPhase4.toggleSchedule('${s.id}')" ${manager()?'':'disabled'}>${s.status==='active'?'Jeda':'Aktifkan'}</button>`]);
  const form=`<div class="rpt-builder"><form class="rpt-filters" onsubmit="ReportPhase4.saveSchedule(event)">
    <div><label class="label" for="r4-sch-name">Nama jadwal</label><input id="r4-sch-name" class="input" name="name" required></div>
    <div><label class="label" for="r4-sch-type">Jenis laporan</label><select id="r4-sch-type" class="select" name="reportType"><option value="attendance">Kehadiran</option><option value="projects">Klien & Project</option><option value="field">Aktivitas Lapangan</option><option value="individual">Individual Karyawan</option></select></div>
    <div><label class="label" for="r4-sch-frequency">Frekuensi</label><select id="r4-sch-frequency" class="select" name="frequency"><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option></select></div>
    <div><label class="label" for="r4-sch-time">Jam</label><input id="r4-sch-time" class="input" type="time" name="time" value="08:00"></div>
    <div><label class="label" for="r4-sch-format">Format</label><select id="r4-sch-format" class="select" name="format"><option>pdf</option><option>xlsx</option><option>docx</option><option>zip</option></select></div>
    <div class="rpt-actions"><button class="btn btn-primary" type="submit" ${manager()?'':'disabled'}>Simpan Jadwal</button></div>
  </form><div class="rpt-warning">Pada Fase 4 jadwal disimpan dan ditandai saat jatuh tempo ketika aplikasi aktif. Eksekusi background penuh dipindahkan ke queue pada Fase 5.</div></div>`;
  return page('Laporan Terjadwal','Kelola jadwal pembuatan laporan berulang.',form+table(['Nama','Jenis','Frekuensi','Jam','Project','Jadwal Berikutnya','Status','Aksi'],rows));
}
function archivePage(){
  return page('Arsip Cloud','Unggahan R2 dimatikan sampai login server tersedia.',`<div class="rpt-builder"><p>Arsip Cloudflare R2 tidak ditampilkan. Frontend belum punya token Worker, jadi unggahan akan 401. Gunakan ekspor lokal di Riwayat Ekspor.</p></div>`);
}
function render(){if(!ROUTES.has(location.hash))return false;const root=document.querySelector('.content');if(!root)return false;let html=templatesPage();if(location.hash==='#/reports/approvals')html=approvalsPage();else if(location.hash==='#/reports/schedules')html=schedulesPage();else if(location.hash==='#/reports/archive')html=archivePage();root.innerHTML=html;root.dataset.reportPhase4Route=location.hash;const t=document.querySelector('.topbar-title');if(t)t.textContent='Laporan';const st=document.querySelector('.topbar-subtitle');if(st){st.textContent='Template, approval, jadwal, dan arsip dokumen';st.style.display='block'}return true}
function nextRun(frequency,time){const d=new Date();const [h,m]=String(time||'08:00').split(':').map(Number);d.setHours(h,m,0,0);if(d<=new Date())d.setDate(d.getDate()+1);if(frequency==='weekly')d.setDate(d.getDate()+(7-d.getDay())%7);if(frequency==='monthly'){d.setMonth(d.getMonth()+1,1)}return d.toISOString()}

window.ReportPhase4={
  saveSettings(e){e.preventDefault();if(!manager())return;const db=read(),f=Object.fromEntries(new FormData(e.target).entries());db.reportSettings={...db.reportSettings,...f,nextNumber:Math.max(1,Number(f.nextNumber||1)),updatedAt:now(),updatedBy:account().id||null};audit(db,'update','report_settings','primary','Memperbarui identitas dan penomoran dokumen');write(db);window.showToast?.('Identitas dokumen disimpan','success');render()},
  newTemplate(){if(!manager())return;const name=prompt('Nama template');if(!name)return;const db=read();db.reportTemplates.push({id:uid('TPL'),name,type:'custom',layout:'portrait',includeCompanyLogo:true,includeClientLogo:false,requireApproval:false,status:'active',columns:[],createdAt:now()});audit(db,'create','report_template',db.reportTemplates.at(-1).id,`Membuat template ${name}`);write(db);render()},
  editTemplate(id){if(!manager())return;const db=read(),t=db.reportTemplates.find(x=>x.id===id);if(!t)return;const name=prompt('Nama template',t.name);if(!name)return;const columns=prompt('Kolom, pisahkan koma',(t.columns||[]).join(', '));t.name=name;t.columns=String(columns||'').split(',').map(x=>x.trim()).filter(Boolean);t.layout=t.layout==='portrait'?'landscape':'portrait';t.updatedAt=now();audit(db,'update','report_template',id,`Memperbarui template ${name}`);write(db);render()},
  requestApproval(){const title=prompt('Judul dokumen yang diajukan');if(!title)return;const db=read(),number=documentNumber(db),item={id:uid('APR'),documentNumber:number,title,status:'pending',requestedAt:now(),requestedBy:account().id||null,requestedByName:account().email||account().name||'-'};db.reportApprovals.push(item);db.reportSettings.nextNumber=Number(db.reportSettings.nextNumber||1)+1;audit(db,'request_approval','report',item.id,`Mengajukan ${number}`);write(db);render()},
  approve(id){if(!manager())return;const db=read(),a=db.reportApprovals.find(x=>x.id===id);if(!a)return;a.status='approved';a.approvedAt=now();a.approvedBy=account().id||null;a.approvedByName=account().email||account().name||'-';audit(db,'approve','report',id,`Menyetujui ${a.documentNumber}`);write(db);render()},
  reject(id){if(!manager())return;const reason=prompt('Alasan penolakan')||'Tidak disetujui';const db=read(),a=db.reportApprovals.find(x=>x.id===id);if(!a)return;a.status='rejected';a.rejectedAt=now();a.rejectedByName=account().email||account().name||'-';a.reason=reason;audit(db,'reject','report',id,reason);write(db);render()},
  saveSchedule(e){e.preventDefault();if(!manager())return;const f=Object.fromEntries(new FormData(e.target).entries()),db=read(),item={id:uid('SCH'),name:f.name,reportType:f.reportType,frequency:f.frequency,time:f.time,format:f.format,status:'active',filters:{},nextRunAt:nextRun(f.frequency,f.time),createdAt:now(),createdBy:account().id||null};db.reportSchedules.push(item);audit(db,'create','report_schedule',item.id,`Membuat jadwal ${item.name}`);write(db);render()},
  toggleSchedule(id){if(!manager())return;const db=read(),s=db.reportSchedules.find(x=>x.id===id);if(!s)return;s.status=s.status==='active'?'paused':'active';s.updatedAt=now();audit(db,'update','report_schedule',id,`${s.status} ${s.name}`);write(db);render()},
  async uploadR2(e){e.preventDefault();const form=e.target,file=form.file.files[0],statusEl=document.getElementById('r4-r2-status');if(!file)return;statusEl.textContent='Mengunggah...';try{const params=new URLSearchParams({name:file.name,projectId:form.projectId.value||'general',ownerId:account().id||'anonymous',category:'report'});const res=await fetch(`/api/files?${params}`,{method:'POST',headers:{'content-type':file.type||'application/octet-stream','content-length':String(file.size)},body:file});const data=await res.json();if(!res.ok)throw new Error(data.message||data.error||`HTTP ${res.status}`);const db=read();db.reportExports.push({id:uid('RPE'),title:'Arsip Laporan',format:file.name.split('.').pop(),fileName:file.name,rowCount:0,status:'completed',storageStatus:'stored',r2Key:data.key,createdAt:now(),createdBy:account().id||null,createdByName:account().email||account().name||'-'});audit(db,'archive','report_export',data.key,`Menyimpan ${file.name} ke R2`);write(db);statusEl.textContent=`Tersimpan di R2: ${data.key}`;render()}catch(err){statusEl.textContent=`Upload gagal: ${err.message||err}`;window.showToast?.(`Upload R2 gagal: ${err.message||err}`,'error')}}
};

function markDueSchedules(){const db=read();let changed=false;for(const s of db.reportSchedules||[]){if(s.status==='active'&&s.nextRunAt&&new Date(s.nextRunAt)<=new Date()){db.reportJobs.push({id:uid('RPJ'),reportType:s.reportType,format:s.format,status:'scheduled_pending',scheduleId:s.id,createdAt:now()});s.lastTriggeredAt=now();s.nextRunAt=nextRun(s.frequency,s.time);changed=true}}if(changed){audit(db,'schedule_trigger','report_job','batch','Menandai laporan terjadwal yang jatuh tempo');write(db)}}
function injectTabs(){document.querySelectorAll('.rpt-nav').forEach(nav=>{if(!nav.querySelector('[href="#/reports/templates"]'))nav.insertAdjacentHTML('beforeend','<a href="#/reports/templates">Template</a><a href="#/reports/approvals">Approval</a><a href="#/reports/schedules">Terjadwal</a>');nav.querySelectorAll('a[href="#/reports/archive"]').forEach(a=>a.remove())})}
function styles(){if(document.getElementById('report-phase4-css'))return;const s=document.createElement('style');s.id='report-phase4-css';s.textContent='.rpt-builder code{font-size:11px}.rpt-actions button:disabled,.btn:disabled{opacity:.5;cursor:not-allowed}';document.head.appendChild(s)}
let queued=false;function sync(){queued=false;styles();if(!render())injectTabs()}new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(sync)}}).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',()=>setTimeout(sync));window.addEventListener('storage',sync);init();markDueSchedules();sync();export {};
