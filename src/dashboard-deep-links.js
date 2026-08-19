const TITLE_ROUTES={
  'Aktivitas Kunjungan Terkini':'#/visits',
  'Absensi Hari Ini':'#/attendance',
  'Top Performer Hari Ini':'#/employees',
  'Progress Kunjungan':'#/visits',
  'Portofolio Aktif':'#/projects',
  'Active Portfolio':'#/projects'
};
function link(el,route,label){if(!el||el.dataset.deepLink==='1')return;el.dataset.deepLink='1';el.setAttribute('role','link');el.setAttribute('tabindex','0');el.setAttribute('aria-label',`${label}, buka detail`);el.style.cursor='pointer';el.addEventListener('click',event=>{if(event.target.closest('a,button,input,select,textarea'))return;location.hash=route});el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();location.hash=route}})}
function enhance(){if(!(location.hash==='#/'||location.hash==='#'))return;document.querySelectorAll('.card-title').forEach(title=>{const label=title.textContent.trim(),route=TITLE_ROUTES[label];if(route)link(title.closest('.card'),route,label)});const portfolio=document.querySelector('.phase0-portfolio');if(portfolio)link(portfolio,'#/projects','Active Portfolio');document.querySelectorAll('.phase0-project-card').forEach(card=>link(card,'#/projects',card.querySelector('strong')?.textContent||'Project'))}
function schedule(){setTimeout(enhance,100);setTimeout(enhance,260)}window.addEventListener('hashchange',schedule);schedule();export {};