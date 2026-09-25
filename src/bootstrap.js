// ProQTrack production runtime bootstrap.
// P1 Performance: keep login/app authority on the critical path and defer route-only enhancers.

const boot = {
  version: 'p1-performance-2026-09-25',
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
  const current = String(route || '#/');
  if (PROJECT_ROUTES.has(current)) await loadProjectRuntime();
  if (isReportRoute(current)) await loadReportRuntime();
}

function yieldToMain() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

let idleRuntimeScheduled = false;
function scheduleIdleRuntime() {
  if (idleRuntimeScheduled) return;
  idleRuntimeScheduled = true;
  const run = async () => {
    const modules = [
      ['./operational-mapping.js', 'operational-mapping'],
      ['./dashboard-deep-links.js', 'dashboard-deep-links'],
      ['./client-logo-auto.js', 'client-logo-auto'],
      ['./project-client-logos.js', 'project-client-logos'],
      ['./employee-avatars.js', 'employee-avatars'],
      ['./pwa-install.js', 'pwa-install'],
    ];
    for (const [path, name] of modules) {
      try { await load(path, name, { lazy:true }); } catch (error) {
        console.warn('proqtrack_lazy_module_failed', name, error?.message || error);
      }
      await yieldToMain();
    }
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => run(), { timeout:2500 });
  } else {
    setTimeout(() => run(), 700);
  }
}

// Critical runtime only.
await load('./lib/ui-events.js', 'ui-events');
await load('./data/uat-seed-v1.js', 'uat-seed');
const cloudCutoverModule = await load('./cloud-cutover.js', 'cloud-cutover');
const m4BootstrapModule = await load('./m4-bootstrap.js', 'm4-bootstrap');
await load('./lib/m6-client.js', 'm6-client');
await load('./app.js', 'app');

// cloud-cutover and offline login install only after app.js has created window.FT.
cloudCutoverModule.installCloudCutover?.();
m4BootstrapModule.installOfflineRuntime?.();

window.addEventListener('hashchange', () => {
  ensureRouteRuntime(location.hash).catch(error => {
    console.warn('proqtrack_route_runtime_failed', error?.message || error);
  });
});

await ensureRouteRuntime(location.hash);
scheduleIdleRuntime();

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
