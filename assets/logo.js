// ProQTrack local brand assets + Phase 0 UI bootstrap
export const LOGO_DARK = './assets/logo-dark.svg';
export const LOGO_LIGHT = './assets/logo-light.svg';
export const PWA_ICON = './assets/icon-proqtrack.svg';
export const CANVA_LOGO_EMBED = LOGO_LIGHT;

function ensureLink(rel, href, attrs = {}) {
  if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  Object.entries(attrs).forEach(([key, value]) => link.setAttribute(key, value));
  document.head.appendChild(link);
}

ensureLink('stylesheet', './assets/phase0.css');
ensureLink('stylesheet', './assets/phase0-v2.css');
ensureLink('stylesheet', './assets/sidebar-collapse.css');
ensureLink('stylesheet', './assets/field-mobile.css');
ensureLink('stylesheet', './assets/ui-2026.css');
ensureLink('stylesheet', './assets/mobile-sales.css');
ensureLink('manifest', './manifest.webmanifest');
ensureLink('icon', PWA_ICON, { type: 'image/svg+xml' });
ensureLink('apple-touch-icon', PWA_ICON);
document.querySelector('meta[name="theme-color"]')?.remove();
const theme = document.createElement('meta');
theme.name = 'theme-color';
theme.content = '#ef5000';
document.head.appendChild(theme);

await import('../src/phase0-data.js');
await import('../src/data/uat-seed-v1.js');
await import('../src/phase0-ui.js');
await import('../src/types/index.js');
await import('../src/reports/index-v2.js');
await import('../src/types/reports-export.js');
await import('../src/reports/phase4-fixed.js');
await import('../src/reports/phase4-preview.js');
await import('../src/uat-fixes.js');
await import('../src/operational-mapping.js');
await import('../src/report-nav-stability.js');
await import('../src/dashboard-deep-links.js');
await import('../src/client-logo-auto.js');
await import('../src/project-client-logos.js');
await import('../src/employee-avatars.js');
await import('../src/lib/uploads.js');
await import('../src/organization.js');
