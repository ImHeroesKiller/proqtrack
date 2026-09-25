let leafletPromise = null;

function ensureStylesheet() {
  if (document.getElementById('proqtrack-leaflet-css')) return;
  const link = document.createElement('link');
  link.id = 'proqtrack-leaflet-css';
  link.rel = 'stylesheet';
  link.href = './assets/vendor/leaflet/leaflet.css';
  document.head.appendChild(link);
}

export function ensureLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('LEAFLET_BROWSER_REQUIRED'));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    ensureStylesheet();
    const existing = document.getElementById('proqtrack-leaflet-js');
    const script = existing || document.createElement('script');
    const finish = () => window.L ? resolve(window.L) : reject(new Error('LEAFLET_NOT_AVAILABLE'));
    if (existing) {
      existing.addEventListener('load', finish, { once:true });
      existing.addEventListener('error', () => reject(new Error('LEAFLET_LOAD_FAILED')), { once:true });
      return;
    }
    script.id = 'proqtrack-leaflet-js';
    script.src = './assets/vendor/leaflet/leaflet.js';
    script.async = true;
    script.addEventListener('load', finish, { once:true });
    script.addEventListener('error', () => {
      leafletPromise = null;
      reject(new Error('LEAFLET_LOAD_FAILED'));
    }, { once:true });
    document.head.appendChild(script);
  });

  return leafletPromise;
}

export function preloadLeaflet() {
  const run = () => ensureLeaflet().catch(() => {});
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout:2500 });
  else setTimeout(run, 800);
}
