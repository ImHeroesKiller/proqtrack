import '../assets/logo.js';

function applyBrand() {
  const tenantBranded = document.documentElement.dataset.orgBranding === '1';
  if (tenantBranded) return;
  document.querySelectorAll('.login-logo,.sidebar-logo').forEach(el => {
    el.querySelectorAll('img,iframe').forEach(node => node.remove());
    if (el.textContent.trim()) el.textContent = '';
    el.setAttribute('aria-label', 'ProQTrack');
  });
  document.querySelectorAll('.login-card h1').forEach(h => {
    h.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;';
  });
  document.querySelectorAll('.sidebar-logo-text').forEach(t => { t.style.display = 'none'; });
}

let brandQueued = false;
function scheduleBrand() {
  if (brandQueued) return;
  brandQueued = true;
  requestAnimationFrame(() => {
    brandQueued = false;
    applyBrand();
  });
}

const observer = new MutationObserver(scheduleBrand);
observer.observe(document.documentElement, { childList: true, subtree: true });
applyBrand();

try {
  await import('./bootstrap.js');
} finally {
  observer.disconnect();
}

scheduleBrand();
window.addEventListener('hashchange', scheduleBrand);
window.addEventListener('proqtrack:organization-updated', scheduleBrand);
