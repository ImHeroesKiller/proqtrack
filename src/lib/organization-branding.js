const DEFAULT_THEME = '#ef5000';

export function normalizeThemeColor(value, fallback = DEFAULT_THEME) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function rgb(hex) {
  const color = normalizeThemeColor(hex);
  return {
    r: parseInt(color.slice(1,3),16),
    g: parseInt(color.slice(3,5),16),
    b: parseInt(color.slice(5,7),16),
  };
}

function mix(hex, target, amount) {
  const source = rgb(hex);
  const ratio = Math.min(1,Math.max(0,Number(amount || 0)));
  const channel = key => Math.round(source[key] * (1-ratio) + target[key] * ratio);
  return `#${['r','g','b'].map(key => channel(key).toString(16).padStart(2,'0')).join('')}`;
}

export function organizationTheme(org = {}) {
  const brand = normalizeThemeColor(org.themeColor || DEFAULT_THEME);
  const { r,g,b } = rgb(brand);
  return {
    brand,
    dark: mix(brand,{r:0,g:0,b:0},.20),
    deeper: mix(brand,{r:0,g:0,b:0},.34),
    bright: mix(brand,{r:255,g:255,b:255},.16),
    mid: mix(brand,{r:255,g:255,b:255},.55),
    soft: mix(brand,{r:255,g:255,b:255},.90),
    rgb: `${r}, ${g}, ${b}`,
  };
}

export function applyOrganizationBranding(org = null) {
  const root = document.documentElement;
  const theme = organizationTheme(org || {});
  const branded = !!org?.id;

  root.dataset.orgBranding = branded ? '1' : '0';
  const timezone = String(org?.timezone || 'Asia/Jakarta');
  root.dataset.orgTimezone = timezone;
  window.__PROQTRACK_TIMEZONE__ = timezone;
  root.style.setProperty('--brand',theme.brand);
  root.style.setProperty('--brand-dark',theme.dark);
  root.style.setProperty('--brand-deeper',theme.deeper);
  root.style.setProperty('--brand-bright',theme.bright);
  root.style.setProperty('--brand-mid',theme.mid);
  root.style.setProperty('--brand-soft',theme.soft);
  root.style.setProperty('--brand-light',`rgba(${theme.rgb}, .10)`);
  root.style.setProperty('--brand-rgb',theme.rgb);
  root.style.setProperty('--brand-shadow',`rgba(${theme.rgb}, .24)`);
  root.style.setProperty('--brand-glow',`rgba(${theme.rgb}, .16)`);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme.brand;

  const name = String(org?.name || '').trim();
  document.title = name
    ? `${name} — ProQTrack`
    : 'ProQTrack — Field Team Monitoring';

  const tenantIcon = /^data:image\/(?:jpeg|png|webp);base64,/i.test(String(org?.logo || ''))
    ? String(org.logo)
    : './assets/icon-proqtrack.svg';
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = tenantIcon;
  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (appleIcon) appleIcon.href = tenantIcon;

  window.dispatchEvent(new CustomEvent('proqtrack:branding-applied', {
    detail: {
      organizationId:org?.id || null,
      name:name || 'ProQTrack',
      logo:org?.logo || '',
      themeColor:theme.brand,
    },
  }));
  return theme;
}

export { DEFAULT_THEME };
