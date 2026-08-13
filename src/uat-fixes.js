const DB_KEYS=['proqtrack_db_v6','proqtrack_db_v7'];
const SESSION_KEY='proqtrack_active_session_v1';

function readDB(){
  try{return JSON.parse(localStorage.getItem(DB_KEYS[0])||localStorage.getItem(DB_KEYS[1])||'{}')||{};}catch{return{};}
}

function waitForApp(callback,attempt=0){
  if(window.FT?.state){callback();return;}
  if(attempt<100)setTimeout(()=>waitForApp(callback,attempt+1),25);
}

function installSessionContinuity(){
  const originalLogin=window.FT.handleLogin;
  if(typeof originalLogin==='function'&&!originalLogin.__sessionWrapped){
    const wrapped=function(event){
      const result=originalLogin.call(this,event);
      const account=window.FT?.state?.account;
      if(account?.id){
        sessionStorage.setItem(SESSION_KEY,JSON.stringify({accountId:account.id,email:account.email,route:window.FT.state.route||location.hash||'#/',savedAt:new Date().toISOString()}));
        window.R2?.issueUploadSession?.(account).catch(()=>{});
      }
      return result;
    };
    wrapped.__sessionWrapped=true;
    window.FT.handleLogin=wrapped;
  }
  const originalLogout=window.FT.logout;
  if(typeof originalLogout==='function'&&!originalLogout.__sessionWrapped){
    const wrapped=function(...args){sessionStorage.removeItem(SESSION_KEY);return originalLogout.apply(this,args);};
    wrapped.__sessionWrapped=true;
    window.FT.logout=wrapped;
  }
  if(window.FT.state.loggedIn)return;
  let saved=null;
  try{saved=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{}
  if(!saved)return;
  const db=readDB();
  const account=(db.accounts||[]).find(a=>a.id===saved.accountId||a.email===saved.email);
  if(!account||account.status==='inactive'||account.status==='suspended'){sessionStorage.removeItem(SESSION_KEY);return;}
  window.FT.state.loggedIn=true;
  window.FT.state.account=account;
  window.FT.state.user={name:account.name||account.email,role:account.role==='manager'?'Manager':account.role==='supervisor'?'Supervisor':'Field Sales',email:account.email};
  window.FT.state.route=saved.route&&saved.route!=='#/login'?saved.route:(account.role==='manager'?'#/':'#/myday');
  if(location.hash!==window.FT.state.route)location.hash=window.FT.state.route;
  else window.dispatchEvent(new HashChangeEvent('hashchange'));
  window.R2?.issueUploadSession?.(account).catch(()=>{});
}

const CARD_ROUTES={
  'Total Karyawan':'#/employees',
  'Kunjungan Hari Ini':'#/visits',
  'Stok Menipis':'#/stocks',
  'Ijin/Cuti Pending':'#/leaves'
};
function makeDashboardCardsInteractive(root=document){
  root.querySelectorAll('.stat-card').forEach(card=>{
    const label=card.querySelector('.stat-label')?.textContent.trim();
    const route=CARD_ROUTES[label];
    if(!route||card.dataset.dashboardLink==='1')return;
    card.dataset.dashboardLink='1';
    card.dataset.route=route;
    card.setAttribute('role','link');
    card.setAttribute('tabindex','0');
    card.setAttribute('aria-label',`${label}, buka detail`);
    card.style.cursor='pointer';
    card.addEventListener('click',()=>{location.hash=route;});
    card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();location.hash=route;}});
  });
}

function selectByName(form,name){return form?.querySelector(`select[name="${name}"]`);}
function keepValue(select,rows,label){
  if(!select)return;
  const current=select.value;
  const first=select.querySelector('option[value=""]')?.textContent||'Pilih data';
  select.innerHTML=`<option value="">${first}</option>`+rows.map(row=>`<option value="${String(row.id).replace(/"/g,'&quot;')}">${label(row)}</option>`).join('');
  if(rows.some(row=>row.id===current))select.value=current;
}
function installCascadingSelects(form){
  if(!form||form.dataset.cascadingFields==='1')return;
  const project=selectByName(form,'projectId');
  const outlet=selectByName(form,'outletId')||selectByName(form,'storeId');
  const product=selectByName(form,'productId');
  const employee=selectByName(form,'employeeId');
  const competitor=selectByName(form,'competitorId');
  const competitorProduct=selectByName(form,'competitorProductId');
  if(!project&&!outlet&&!product&&!employee&&!competitorProduct)return;
  form.dataset.cascadingFields='1';
  const sync=()=>{
    const db=readDB();
    let projectId=project?.value||'';
    const selectedOutlet=(db.outlets||db.stores||[]).find(o=>o.id===outlet?.value);
    if(!projectId&&selectedOutlet?.projectId){projectId=selectedOutlet.projectId;if(project)project.value=projectId;}
    const selectedProject=(db.projects||[]).find(p=>p.id===projectId);
    if(outlet){
      const rows=(db.outlets||db.stores||[]).filter(o=>!projectId||o.projectId===projectId);
      keepValue(outlet,rows,o=>`${o.name}${o.area?' — '+o.area:''}`);
    }
    if(product){
      const explicitProductIds=new Set([
        ...(selectedProject?.productIds||[]),
        ...(db.projectProducts||[]).filter(x=>x.projectId===projectId&&x.status!=='inactive').map(x=>x.productId)
      ]);
      const rows=(db.products||[]).filter(p=>{
        if(!projectId)return true;
        if(explicitProductIds.size)return explicitProductIds.has(p.id);
        return !p.clientId||p.clientId===selectedProject?.clientId;
      });
      keepValue(product,rows,p=>`${p.name}${p.sku?' — '+p.sku:''}`);
    }
    if(employee){
      const allowed=new Set((db.projectAssignments||[]).filter(a=>a.projectId===projectId&&a.status==='active').map(a=>a.employeeId));
      const rows=(db.employees||[]).filter(e=>!projectId||allowed.has(e.id));
      keepValue(employee,rows,e=>`${e.name}${e.role?' — '+e.role:''}`);
    }
    if(competitorProduct){
      const competitorId=competitor?.value||'';
      const rows=(db.competitorProducts||[]).filter(p=>!competitorId||p.competitorId===competitorId);
      keepValue(competitorProduct,rows,p=>`${p.name}${p.sku?' — '+p.sku:''}`);
    }
    [outlet,product,employee].forEach(el=>{if(el)el.disabled=Boolean(project)&&!projectId;});
    if(competitorProduct)competitorProduct.disabled=Boolean(competitor)&&!competitor?.value;
  };
  project?.addEventListener('change',sync);
  outlet?.addEventListener('change',sync);
  competitor?.addEventListener('change',sync);
  sync();
}
function enhance(root=document){
  makeDashboardCardsInteractive(root);
  root.querySelectorAll('form').forEach(installCascadingSelects);
}

waitForApp(()=>{
  installSessionContinuity();
  enhance();
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance();});}).observe(document.documentElement,{childList:true,subtree:true});
});

export {};
