const REPORT_LINKS=[['#/reports','Ringkasan'],['#/reports/attendance','Kehadiran'],['#/reports/employees','Karyawan'],['#/reports/projects','Klien & Project'],['#/reports/field','Aktivitas Lapangan'],['#/reports/stocks','Stok'],['#/reports/prices','Harga'],['#/reports/competitors','Kompetitor'],['#/reports/supervisors','Supervisor'],['#/reports/custom','Custom'],['#/reports/audit','Audit'],['#/reports/templates','Template'],['#/reports/approvals','Approval'],['#/reports/schedules','Terjadwal']];
function stableTabs(){return REPORT_LINKS.map(([route,label])=>`<a href="${route}" class="${location.hash===route?'active':''}" ${location.hash===route?'aria-current="page"':''}>${label}</a>`).join('')}
function apply(){if(!location.hash.startsWith('#/reports'))return;document.querySelectorAll('.rpt-nav').forEach(nav=>{const expected=REPORT_LINKS.length;const current=nav.querySelectorAll('a').length;const hasTemplate=nav.querySelector('[href="#/reports/templates"]');if(current!==expected||!hasTemplate)nav.innerHTML=stableTabs();else nav.querySelectorAll('a').forEach(a=>{const active=a.getAttribute('href')===location.hash;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')})})}
function schedule(){setTimeout(apply,80);setTimeout(apply,220)}
window.addEventListener('hashchange',schedule);
window.addEventListener('proqtrack:db-updated',schedule);
document.addEventListener('click',event=>{const link=event.target.closest('.rpt-nav a');if(link)schedule()},{capture:true});
schedule();
export {};