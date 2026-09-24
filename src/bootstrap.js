// ProQTrack production runtime bootstrap.
// Keep this file as the single explicit entry graph for browser runtime modules.
// Branding stays in assets/logo.js; application/runtime side effects live here.

const boot = {
  version: 'p3-runtime-2026-09-23',
  stage: 'loading',
  modules: [],
  checks: {},
  missing: [],
  startedAt: new Date().toISOString(),
};

window.__PROQTRACK_BOOT__ = boot;

async function load(path, name) {
  const module = await import(path);
  boot.modules.push(name);
  return module;
}

// Preserve the proven legacy evaluation order while making it explicit.
// Several modules install their FT hooks on the next task because app.js
// intentionally loads after compatibility/runtime extensions.
await load('./lib/ui-events.js', 'ui-events');
await load('./phase0-data.js', 'phase0-data');
await load('./data/uat-seed-v1.js', 'uat-seed');
await load('./phase0-ui.js', 'phase0-ui');
await load('./types/index.js', 'project-management');
await load('./reports/index-v2.js', 'reports-core');
await load('./types/reports-export.js', 'reports-export');
await load('./reports/phase4-fixed.js', 'reports-phase4');
await load('./reports/phase4-preview.js', 'reports-preview');
await load('./operational-mapping.js', 'operational-mapping');
await load('./report-nav-stability.js', 'report-nav-stability');
await load('./dashboard-deep-links.js', 'dashboard-deep-links');
await load('./client-logo-auto.js', 'client-logo-auto');
await load('./project-client-logos.js', 'project-client-logos');
await load('./employee-avatars.js', 'employee-avatars');
await load('./lib/uploads.js', 'uploads');
await load('./organization.js', 'organization');
const cloudCutoverModule = await load('./cloud-cutover.js', 'cloud-cutover');
const m4BootstrapModule = await load('./m4-bootstrap.js', 'm4-bootstrap');
await load('./lib/m6-client.js', 'm6-client');
await load('./app.js', 'app');

// cloud-cutover is imported before app.js for dependency ordering, but its
// FT hook must be installed only after app.js has created window.FT.
cloudCutoverModule.installCloudCutover?.();
m4BootstrapModule.installOfflineRuntime?.();

// Deferred fallbacks still get one task turn, but readiness no longer depends on them.
await new Promise(resolve => setTimeout(resolve, 0));

const checks = Object.freeze({
  uiEvents: Boolean(window.ProQUIEvents),
  app: Boolean(window.FT?.state && window.FT?.handleLogin),
  cloudCutover: Boolean(window.FT?.__m3CloudCutoverInstalled),
  offlineLogin: Boolean(window.FT?.__m4OfflineLoginInstalled),
  m4Bootstrap: Boolean(window.__PROQTRACK_M4_BOOTSTRAP_LOADED__),
  reportsCore: Boolean(window.Reports),
  reportsPhase4: Boolean(window.ReportPhase4),
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

window.dispatchEvent(new CustomEvent('proqtrack:boot-ready', {
  detail: {
    version: boot.version,
    stage: boot.stage,
    checks,
    missing: [...missing],
  },
}));

export default boot;
