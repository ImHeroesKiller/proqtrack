// Employees P2 operational refresh
// Employees P3 maintainability refresh
// Outlets P3 maintainability refresh
// Attendance + Leave P0 authority refresh
// Attendance + Leave P1 lifecycle refresh
// Attendance + Leave P2 operational UX refresh
// Attendance + Leave P3 maintainability refresh
// Previous fixed-cache baseline retained only as a regression marker: proqtrack-v12.44
const RELEASE = '__PROQTRACK_RELEASE__';
const CACHE = `proqtrack-shell-${RELEASE}`;
const RUNTIME_CACHE = `proqtrack-runtime-${RELEASE}`;
const CACHE_PREFIXES = ['proqtrack-shell-', 'proqtrack-runtime-'];
const RUNTIME_MAX_ENTRIES = 80;
const PRECACHE_MANIFEST = 'precache-manifest.json';
const FALLBACK_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/logo.js',
  './assets/logo-dark.svg',
  './assets/logo-light.svg',
  './assets/icon-proqtrack.svg',
  './assets/org-theme.css',
  './assets/vendor/leaflet/leaflet.css',
  './assets/vendor/leaflet/leaflet.js',
  './src/entry.js',
  './src/bootstrap.js',
  './src/pwa-install.js',
  './src/lib/ui-events.js',
  './src/lib/document-export.js',
  './src/app.js',
  './src/cloud-cutover.js',
  './src/m4-bootstrap.js',
  './src/lib/db.js',
  './src/lib/utils.js',
  './src/lib/location-evidence.js',
  './src/lib/visit-ui.js',
  './src/lib/client-ui.js',
  './src/lib/project-ui.js',
  './src/lib/assignment-ui.js',
  './src/lib/team-employee-ui.js',
  './src/lib/outlet-ui.js',
  './src/lib/product-ui.js',
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
  './src/bulk-master.js',
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
      .then(keys => Promise.all(
        keys
          .filter(key => CACHE_PREFIXES.some(prefix => key.startsWith(prefix)))
          .filter(key => ![CACHE, RUNTIME_CACHE].includes(key))
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isPrivateApi(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/api/');
}

async function navigationResponse(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('./index.html');
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    return Response.error();
  }
}

function isRuntimeCacheable(url) {
  return /\.(?:js|css|svg|png|jpe?g|webp|ico|json|webmanifest)$/i.test(url.pathname);
}

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - RUNTIME_MAX_ENTRIES;
  if (excess <= 0) return;
  await Promise.all(keys.slice(0, excess).map(request => cache.delete(request)));
}

async function putRuntimeCache(request, response) {
  if (!response?.ok) return;
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(request, response.clone());
  await trimRuntimeCache(cache);
}

async function staticResponse(request) {
  const shell = await caches.open(CACHE);
  const shellHit = await shell.match(request);
  if (shellHit) return shellHit;

  const runtime = await caches.open(RUNTIME_CACHE);
  const runtimeHit = await runtime.match(request);
  if (runtimeHit) return runtimeHit;

  try {
    const response = await fetch(request);
    if (isRuntimeCacheable(new URL(request.url))) {
      await putRuntimeCache(request, response).catch(() => {});
    }
    return response;
  } catch {
    return Response.error();
  }
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

// Settings P0 authority refresh

// Settings P1 operational security refresh

// Settings P2 UX operational refresh

// Settings P3 refactor quality refresh
