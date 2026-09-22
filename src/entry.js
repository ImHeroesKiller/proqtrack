import '../assets/logo.js';

function applyBrand() {
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

const observer = new MutationObserver(applyBrand);
observer.observe(document.documentElement, { childList: true, subtree: true });
applyBrand();

await import('./bootstrap.js');
applyBrand();
