const DB_KEYS=['proqtrack_db_v6','proqtrack_db_v7'];
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
function read(){try{return JSON.parse(localStorage.getItem(DB_KEYS[0])||localStorage.getItem(DB_KEYS[1])||'{}')||{};}catch{return{};}}
function write(db){const text=JSON.stringify(db);DB_KEYS.forEach(k=>localStorage.setItem(k,text));window.dispatchEvent(new CustomEvent('proqtrack:db-updated',{detail:{reason:'client-logo-auto'}}));}
function normalizeWebsite(value){let raw=String(value||'').trim();if(!raw)return'';if(!/^https?:\/\//i.test(raw))raw=`https://${raw}`;try{const url=new URL(raw);if(!['http:','https:'].includes(url.protocol))return'';return url.origin;}catch{return'';}}
function candidateUrls(website){const origin=normalizeWebsite(website);if(!origin)return[];const host=new URL(origin).hostname;return[
  `${origin}/apple-touch-icon.png`,
  `${origin}/apple-touch-icon-precomposed.png`,
  `${origin}/favicon-192x192.png`,
  `${origin}/favicon-96x96.png`,
  `${origin}/favicon-32x32.png`,
  `${origin}/favicon.ico`,
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=256`
];}
function canLoadImage(url,timeout=4500){return new Promise(resolve=>{const img=new Image();let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);img.onload=null;img.onerror=null;resolve(value);};const timer=setTimeout(()=>finish(false),timeout);img.onload=()=>finish(Boolean(img.naturalWidth&&img.naturalHeight));img.onerror=()=>finish(false);img.referrerPolicy='no-referrer';img.src=url;});}
async function resolveLogo(website){for(const url of candidateUrls(website)){if(await canLoadImage(url))return{url,type:url.includes('google.com/s2/favicons')?'favicon_service':url.endsWith('.ico')?'favicon':'site_icon'};}return null;}
function findWebsiteField(form){return form.querySelector('input[name="website"],input[name="websiteUrl"],input[name="url"],input[type="url"]');}
function findNameField(form){return form.querySelector('input[name="name"],input[name="clientName"],input[name="legalName"]');}
function looksLikeClientForm(form){if(!findWebsiteField(form))return false;const text=`${form.id} ${form.className} ${form.textContent}`.toLowerCase();return /client|klien/.test(text)||Boolean(form.querySelector('input[name="picName"],input[name="legalName"],input[name="industry"]'));
}
async function updateSavedClient({website,name,previousWebsite}){
  const normalized=normalizeWebsite(website);if(!normalized)return;
  window.showToast?.('Mengambil logo dari website klien...');
  const result=await resolveLogo(normalized);
  const db=read();const clients=db.clients||[];
  const normalizedHost=new URL(normalized).hostname.replace(/^www\./,'');
  const client=clients.find(c=>{
    const host=normalizeWebsite(c.website);if(host){try{if(new URL(host).hostname.replace(/^www\./,'')===normalizedHost)return true;}catch{}}
    if(previousWebsite&&normalizeWebsite(c.website)===normalizeWebsite(previousWebsite))return true;
    return name&&String(c.name||c.legalName||'').trim().toLowerCase()===String(name).trim().toLowerCase();
  });
  if(!client)return;
  client.website=normalized;
  client.logoFetchStatus=result?'resolved':'not_found';
  client.logoFetchedAt=new Date().toISOString();
  if(result){client.logo=result.url;client.logoUrl=result.url;client.logoSourceUrl=result.url;client.logoSourceType=result.type;client.logoStorage='external';window.showToast?.('Logo klien berhasil diambil otomatis','success');}
  else window.showToast?.('Logo website tidak ditemukan; logo sebelumnya dipertahankan','error');
  write(db);
}
function install(){document.addEventListener('submit',event=>{const form=event.target;if(!(form instanceof HTMLFormElement)||!looksLikeClientForm(form))return;const websiteField=findWebsiteField(form);const website=websiteField?.value||'';if(!website.trim())return;const name=findNameField(form)?.value||'';const previousWebsite=websiteField?.dataset.originalValue||'';setTimeout(()=>updateSavedClient({website,name,previousWebsite}).catch(error=>{console.warn('client_logo_auto_failed',error);window.showToast?.('Data klien tersimpan, tetapi logo gagal diambil','error');}),250);},true);
  const observer=new MutationObserver(()=>document.querySelectorAll('form').forEach(form=>{const field=findWebsiteField(form);if(field&&!field.dataset.originalValue)field.dataset.originalValue=field.value||'';}));observer.observe(document.documentElement,{childList:true,subtree:true});
}
install();
export {};
