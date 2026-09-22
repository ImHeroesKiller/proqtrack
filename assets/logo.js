// ProQTrack local brand asset registration. Production runtime bootstrap lives in src/bootstrap.js.
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
