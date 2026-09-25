// ProQTrack production runtime bootstrap.
// P1 Performance: keep login/app authority on the critical path and defer route-only enhancers.

const boot = {
  version: 'p6-persistent-shell-route-split-2026-09-26',
  stage: 'loading',
  modules: [],
  lazyModules: [],
  checks: {},
  missing: [],
  startedAt: new Date().toISOString(),
};

window.__PROQTRACK_BOOT__ = boot;

const modulePromises = new Map();

async function load(path, name, { lazy = false } = {}) {
  if (modulePromises.has(path)) return modulePromises.get(path);
  const promise = import(path).then(module => {
    const target = lazy ? boot.lazyModules : boot.modules;
    if (!target.includes(name)) target.push(name);
    return module;
  });
  modulePromises.set(path, promise);
  return promise;
}

const PROJECT_ROUTES = new Set([
  '#/clients',
  '#/projects',
  '#/assignments',
  '#/my-projects',
  '#/my-team',
  '#/supervisor-compare',
]);

function isReportRoute(route = location.hash) {
  return String(route || '').startsWith('#/reports');
}

async function loadProjectRuntime() {
  return load('./types/index.js', 'project-management', { lazy:true });
}

async function loadReportRuntime() {
  await load('./reports/index-v2.js', 'reports-core', { lazy:true });
  await load('./types/reports-export.js', 'reports-export', { lazy:true });
  await load('./reports/phase4-fixed.js', 'reports-phase4', { lazy:true });
  await load('./reports/phase4-preview.js', 'reports-preview', { lazy:true });
  await load('./report-nav-stability.js', 'report-nav-stability', { lazy:true });
}

async function ensureRouteRuntime(route = location.hash) {
  if (!window.FT?.state?.loggedIn) return false;
  const current = String(route || '#/');
  const tasks = [];
  if (PROJECT_ROUTES.has(current)) tasks.push(loadProjectRuntime());
  if (isReportRoute(current)) tasks.push(loadReportRuntime());
  if (current === '#/' || current === '#') tasks.push(load('./dashboard-deep-links.js', 'dashboard-deep-links', { lazy:true }));
  if (current === '#/projects') {
    tasks.push(load('./operational-mapping.js', 'operational-mapping', { lazy:true }));
    tasks.push(load('./project-client-logos.js', 'project-client-logos', { lazy:true }));
  }
  if (current === '#/clients' || current === '#/projects') tasks.push(load('./client-logo-auto.js', 'client-logo-auto', { lazy:true }));
  if (current === '#/employees' || current.startsWith('#/employee/')) tasks.push(load('./employee-avatars.js', 'employee-avatars', { lazy:true }));
  if (tasks.length) await Promise.all(tasks);
  return true;
}

function yieldToMain() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

let idleRuntimeScheduled = false;
let authenticatedPaintSeen = false;

function afterAuthenticatedPaint() {
  return new Promise(resolve => {
    if (!window.FT?.state?.loggedIn) return resolve(false);
    // Two animation frames keep route rendering/LCP ahead of optional module
    // fetch/compile work even when hash navigation and login complete together.
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
  });
}

function scheduleIdleRuntime() {
  if (idleRuntimeScheduled) return;
  idleRuntimeScheduled = true;
  const run = async () => {
    await afterAuthenticatedPaint();
    const modules = [
      ['./lib/performance-monitor.js', 'performance-monitor'],
      ['./pwa-install.js', 'pwa-install'],
    ];
    for (const [path, name] of modules) {
      if (!window.FT?.state?.loggedIn || document.visibilityState !== 'visible') break;
      try { await load(path, name, { lazy:true }); } catch (error) {
        console.warn('proqtrack_lazy_module_failed', name, error?.message || error);
      }
      await yieldToMain();
    }
  };
  const start = () => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => run(), { timeout:5000 });
    } else {
      setTimeout(() => run(), 1200);
    }
  };
  if (authenticatedPaintSeen) start();
  else window.addEventListener('proqtrack:render-complete', () => {
    authenticatedPaintSeen = true;
    start();
  }, { once:true });
}

function shouldLoadUatSeed() {
  const host = String(location.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (new URLSearchParams(location.search).get('uatSeed') === '1') return true;
  try { return localStorage.getItem('proqtrack_enable_uat_seed') === '1'; } catch { return false; }
}

// UI delegation must exist before the user can interact with rendered templates.
await load('./lib/ui-events.js', 'ui-events');

// Synthetic UAT seed is never part of the live production critical path.
if (shouldLoadUatSeed()) await load('./data/uat-seed-v1.js', 'uat-seed', { lazy:true });

// These modules are independent at evaluation time. Load them concurrently to
// remove the bootstrap request/compile waterfall, then install bridges after app.js.
const [
  cloudCutoverModule,
  m4BootstrapModule,
] = await Promise.all([
  load('./cloud-cutover.js', 'cloud-cutover'),
  load('./m4-bootstrap.js', 'm4-bootstrap'),
  load('./lib/m6-client.js', 'm6-client'),
  load('./app.js', 'app'),
]);

// cloud-cutover and offline login install only after app.js has created window.FT.
cloudCutoverModule.installCloudCutover?.();
m4BootstrapModule.installOfflineRuntime?.();

window.addEventListener('hashchange', () => {
  ensureRouteRuntime(location.hash).catch(error => {
    console.warn('proqtrack_route_runtime_failed', error?.message || error);
  });
  // Optional runtime is scheduled by render-complete, not hashchange itself,
  // so a soft navigation to #/ never competes with its LCP frame.
  if (window.FT?.state?.loggedIn) scheduleIdleRuntime();
});
window.addEventListener('proqtrack:cloud-status', event => {
  if (window.FT?.state?.loggedIn && ['ready','synced'].includes(event.detail?.status)) {
    scheduleIdleRuntime();
    ensureRouteRuntime(location.hash).catch(() => {});
  }
});

await ensureRouteRuntime(location.hash);
if (window.FT?.state?.loggedIn) scheduleIdleRuntime();

// Deferred fallbacks still get one task turn, but readiness only measures critical runtime.
await yieldToMain();

const checks = Object.freeze({
  uiEvents: Boolean(window.ProQUIEvents),
  app: Boolean(window.FT?.state && window.FT?.handleLogin),
  cloudCutover: Boolean(window.FT?.__m3CloudCutoverInstalled),
  offlineLogin: Boolean(window.FT?.__m4OfflineLoginInstalled),
  m4Bootstrap: Boolean(window.__PROQTRACK_M4_BOOTSTRAP_LOADED__),
  m6Client: Boolean(window.ProQTrackM6),
});

const missing = Object.entries(checks)
  .filter(([, ready]) => !ready)
  .map(([name]) => name);

boot.checks = checks;
boot.missing = missing;
boot.stage = missing.length ? 'degraded' : 'ready';
boot.readyAt = new Date().toISOString();

if (missing.length) {
  console.error('proqtrack_runtime_boot_incomplete', missing);
}

window.ProQTrackRuntime = Object.freeze({
  ensureRouteRuntime,
  loadProjectRuntime,
  loadReportRuntime,
  scheduleIdleRuntime,
});

window.dispatchEvent(new CustomEvent('proqtrack:boot-ready', {
  detail: {
    version: boot.version,
    stage: boot.stage,
    checks,
    missing: [...missing],
  },
}));

export default boot;
