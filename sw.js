const CACHE = 'proqtrack-v10';
const PRECACHE_MANIFEST = 'precache-manifest.json';
const FALLBACK_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/logo.js',
  './assets/logo-dark.svg',
  './assets/logo-light.svg',
  './assets/icon-proqtrack.svg',
  './src/app.js',
  './src/cloud-cutover.js',
  './src/m4-bootstrap.js',
  './src/lib/db.js',
  './src/lib/utils.js',
  './src/lib/cloud-data.js',
  './src/lib/offline-store.js',
  './src/lib/offline-engine.js',
  './src/lib/offline-login.js',
  './src/lib/evidence-client.js',
  './src/lib/field-photo-evidence.js',
  './src/lib/m6-client.js',
  './src/lib/uploads.js',
  './src/lib/cloud-accounts.js',
  './src/lib/cloud-organizations.js',
  './src/bulk-employees.js',
  './src/lib/bulk-upload.js',
];

async function precacheApplication() {
  const cache = await caches.open(CACHE);
  let assets = FALLBACK_SHELL;
  try {
    const manifestUrl = new URL(PRECACHE_MANIFEST, self.registration.scope);
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    const generated = Array.isArray(manifest?.assets)
      ? manifest.assets.filter(path => typeof path === 'string' && path.startsWith('./'))
      : [];
    assets = [...new Set([...FALLBACK_SHELL, ...generated])];
  } catch (error) {
    console.warn('pwa_precache_manifest_unavailable', error?.message || error);
  }
  await cache.addAll(assets);
}

self.addEventListener('install', event => {
  event.waitUntil(precacheApplication().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isPrivateApi(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/api/');
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put('./index.html', response.clone());
    }
    return response;
  } catch {
    return (await caches.match('./index.html')) || Response.error();
  }
}

async function staticResponse(request) {
  const cached = await caches.match(request);
  const network = fetch(request).then(async response => {
    if (response.ok && response.type !== 'opaque') {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  return (await network) || Response.error();
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (isPrivateApi(url)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event.request));
    return;
  }
  event.respondWith(staticResponse(event.request));
});
