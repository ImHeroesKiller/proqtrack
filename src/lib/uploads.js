const TOKEN_KEY = 'proqtrack_api_token_v1';
const TOKEN_META = 'proqtrack_api_token_meta_v1';

export function getApiToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function clearApiToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_META);
  } catch { /* ignore */ }
}

export function fileUrl(key) {
  if (!key) return '';
  if (/^https?:\/\//i.test(key) || key.startsWith('/api/files/') || key.startsWith('data:')) return key;
  return `/api/files/${encodeURIComponent(key)}`;
}

export function authHeaders(extra = {}) {
  const token = getApiToken();
  return token ? { authorization: `Bearer ${token}`, ...extra } : { ...extra };
}

function rememberToken(token, exp, role) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(TOKEN_META, JSON.stringify({ exp, role }));
  return token;
}

/**
 * Cloud tokens are issued only by POST /api/auth/login against D1 auth_users.
 * Client-supplied role/sub claims are rejected (410). Local prototype logins
 * therefore keep photos in the browser until a server user exists.
 */
export async function issueUploadSession(account, credentials = {}) {
  if (!account?.id && !credentials.email) return null;
  const email = credentials.email || account?.email;
  const password = credentials.password;
  if (!email || !password) return null;
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') return null;
  if (!res.ok) {
    if ([400, 401, 404, 405, 410, 501, 503].includes(res.status)) return null;
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  if (!data.token) return null;
  return rememberToken(data.token, data.exp, data.account?.role || account?.role);
}

export async function uploadAsset(file, { category = 'attachment', projectId = '', clientId = '', name } = {}) {
  if (!file) throw new Error('File belum dipilih.');
  if (!getApiToken()) throw new Error('Sesi unggah cloud belum tersedia. Login server diperlukan.');
  const params = new URLSearchParams({
    name: name || file.name || 'file',
    category,
    projectId: projectId || 'general',
    clientId: clientId || '',
  });
  const guessed = file.type || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf', zip: 'application/zip', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }[String(file.name||'').split('.').pop()?.toLowerCase()] || 'image/jpeg');
  const res = await fetch(`/api/files?${params}`, {
    method: 'POST',
    headers: authHeaders({
      'content-type': guessed,
      'content-length': String(file.size),
    }),
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return { ...data, url: fileUrl(data.key) };
}

export function assetField({ name = 'assetUrl', current = '', accept = 'image/jpeg,image/png,image/webp', label = 'Unggah file', category = 'attachment', projectId = '' } = {}) {
  const preview = current ? `<img class="r2-preview" alt="Preview" src="${current}">` : '<div class="r2-preview r2-preview-empty">Belum ada file</div>';
  return `<div class="r2-upload" data-r2-category="${category}" data-r2-project="${projectId}">
    <label class="label">${label}</label>
    <div class="r2-upload-row">
      ${preview}
      <div>
        <input class="input" type="file" accept="${accept}" data-r2-input>
        <input type="hidden" name="${name}" value="${current || ''}" data-r2-value>
        <div class="r2-status" data-r2-status></div>
      </div>
    </div>
  </div>`;
}

export function bindAssetFields(root = document) {
  root.querySelectorAll('.r2-upload').forEach(box => {
    if (box.dataset.bound === '1') return;
    const input = box.querySelector('[data-r2-input]');
    const hidden = box.querySelector('[data-r2-value]');
    const status = box.querySelector('[data-r2-status]');
    const preview = box.querySelector('.r2-preview');
    if (!input || !hidden) return;
    box.dataset.bound = '1';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (status) status.textContent = 'Mengunggah ke R2...';
      try {
        const result = await uploadAsset(file, {
          category: box.dataset.r2Category || 'attachment',
          projectId: box.dataset.r2Project || '',
        });
        hidden.value = result.url;
        if (preview) {
          preview.classList.remove('r2-preview-empty');
          if (preview.tagName === 'IMG') preview.src = result.url;
          else preview.innerHTML = `<img alt="Preview" src="${result.url}">`;
        }
        if (status) status.textContent = 'Tersimpan di R2';
        window.showToast?.('File tersimpan di cloud storage', 'success');
      } catch (error) {
        if (status) status.textContent = error.message || String(error);
        window.showToast?.(`Unggah R2 gagal: ${error.message || error}`, 'error');
      }
    });
  });
}

function installStyles() {
  if (typeof document === 'undefined' || document.getElementById('r2-upload-css')) return;
  const style = document.createElement('style');
  style.id = 'r2-upload-css';
  style.textContent = `
    .r2-upload-row{display:grid;grid-template-columns:72px 1fr;gap:12px;align-items:center}
    .r2-preview{width:72px;height:72px;border-radius:12px;border:1px solid var(--gray-200);object-fit:cover;background:#fff;display:grid;place-items:center;overflow:hidden}
    .r2-preview img{width:100%;height:100%;object-fit:cover}
    .r2-preview-empty{font-size:10px;color:var(--gray-400);text-align:center;padding:6px}
    .r2-status{font-size:11px;color:var(--gray-400);margin-top:6px}
  `;
  document.head.appendChild(style);
}

installStyles();
if (typeof window !== 'undefined') {
  window.R2 = { uploadAsset, issueUploadSession, bindAssetFields, fileUrl, clearApiToken, getApiToken };
}
export {};
