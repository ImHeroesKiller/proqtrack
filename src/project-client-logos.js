import { getDB } from './lib/db.js';

function readDB(){
  return getDB();
}
function initials(value){return String(value||'PR').split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,2).join('').toUpperCase();}
function logoOf(client){return client?.logoUrl||client?.logo||'';}
function makeLogo(client,label){
  const holder=document.createElement('span');
  holder.className='pm-project-client-logo';
  holder.setAttribute('aria-label',client?.name?`Logo ${client.name}`:`Ikon ${label}`);
  const src=logoOf(client);
  if(!src){holder.textContent=initials(client?.name||label);return holder;}
  const img=document.createElement('img');
  img.src=src;
  img.alt=client?.name?`Logo ${client.name}`:'';
  img.loading='lazy';
  img.referrerPolicy='no-referrer';
  img.addEventListener('error',()=>{holder.textContent=initials(client?.name||label);holder.dataset.logoFailed='1';},{once:true});
  holder.appendChild(img);
  return holder;
}
function ensureStyles(){
  if(document.getElementById('project-client-logo-css'))return;
  const style=document.createElement('style');
  style.id='project-client-logo-css';
  style.textContent=`
    .pm-project-title{display:flex;align-items:center;gap:10px;min-width:0}
    .pm-project-title-copy{min-width:0}
    .pm-project-client-logo{width:38px;height:38px;flex:0 0 38px;border-radius:11px;border:1px solid #e5e7eb;background:#fff;display:grid;place-items:center;overflow:hidden;padding:3px;font-size:11px;font-weight:800;color:#475569}
    .pm-project-client-logo img{display:block;width:100%;height:100%;object-fit:contain;border-radius:7px}
    .phase0-project-icon.pm-logo-ready{background:#fff!important;border:1px solid #e5e7eb;overflow:hidden;padding:4px}
    .phase0-project-icon.pm-logo-ready img{width:100%;height:100%;object-fit:contain;border-radius:8px}
  `;
  document.head.appendChild(style);
}
function decorateProjectRows(){
  const db=readDB();
  const projects=new Map((db.projects||[]).map(p=>[p.id,p]));
  const clients=new Map((db.clients||[]).map(c=>[c.id,c]));
  document.querySelectorAll('#projectRows tr').forEach(row=>{
    if(row.dataset.projectLogoReady==='1')return;
    const detailButton=row.querySelector('button[onclick*="PM.viewProject"]');
    const match=detailButton?.getAttribute('onclick')?.match(/PM\.viewProject\('([^']+)'\)/);
    const project=projects.get(match?.[1]);
    const cell=row.cells?.[0];
    if(!project||!cell)return;
    const client=clients.get(project.clientId);
    const copy=document.createElement('div');
    copy.className='pm-project-title-copy';
    while(cell.firstChild)copy.appendChild(cell.firstChild);
    const wrap=document.createElement('div');
    wrap.className='pm-project-title';
    wrap.append(makeLogo(client,project.name),copy);
    cell.appendChild(wrap);
    row.dataset.projectLogoReady='1';
  });
  document.querySelectorAll('#assignmentRows tr').forEach(row=>{
    if(row.dataset.projectLogoReady==='1')return;
    const projectId=row.dataset.project;
    const project=projects.get(projectId);
    const cell=row.cells?.[0];
    if(!project||!cell)return;
    const client=clients.get(project.clientId);
    const copy=document.createElement('div');copy.className='pm-project-title-copy';
    while(cell.firstChild)copy.appendChild(cell.firstChild);
    const wrap=document.createElement('div');wrap.className='pm-project-title';wrap.append(makeLogo(client,project.name),copy);
    cell.appendChild(wrap);row.dataset.projectLogoReady='1';
  });
}
function decorateDashboardProjects(){
  const db=readDB();
  const clients=new Map((db.clients||[]).map(c=>[c.id,c]));
  const projects=new Map((db.projects||[]).map(p=>[p.name,p]));
  document.querySelectorAll('.phase0-project-card').forEach(card=>{
    const icon=card.querySelector('.phase0-project-icon');
    const name=card.querySelector('strong')?.textContent?.trim();
    if(!icon||icon.dataset.projectLogoReady==='1')return;
    const project=projects.get(name);const client=clients.get(project?.clientId);const src=logoOf(client);
    if(!src)return;
    const img=document.createElement('img');img.src=src;img.alt=client?.name?`Logo ${client.name}`:'';img.referrerPolicy='no-referrer';img.loading='lazy';
    img.addEventListener('error',()=>{icon.classList.remove('pm-logo-ready');icon.textContent=initials(client?.name||name);},{once:true});
    icon.replaceChildren(img);icon.classList.add('pm-logo-ready');icon.dataset.projectLogoReady='1';
  });
}
function paint(){
  if(!['#/projects','#/my-projects','#/assignments','#/'].includes(location.hash))return;
  ensureStyles();decorateProjectRows();decorateDashboardProjects();
}
function schedule(){requestAnimationFrame(()=>requestAnimationFrame(paint));}
window.addEventListener('hashchange',schedule);
window.addEventListener('proqtrack:db-updated',schedule);
document.addEventListener('click',event=>{if(event.target.closest('a[href="#/projects"],a[href="#/my-projects"],a[href="#/assignments"]'))schedule();});
schedule();
export {};
