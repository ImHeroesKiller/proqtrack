import { authHeaders, getApiToken } from './uploads.js';

function assertSession() {
  if (!getApiToken()) throw new Error('Sesi berakhir. Silakan login kembali.');
}

async function api(path, options = {}) {
  assertSession();
  const headers = authHeaders({
    accept: 'application/json',
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(options.headers || {}),
  });
  const response = await fetch(path, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data?.error;
    error.payload = data;
    throw error;
  }
  return data;
}

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function downloadReport(id) {
  assertSession();
  const response = await fetch(`/api/reports/${encodeURIComponent(id)}/download`, {
    headers: authHeaders({ accept: '*/*' }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match?.[1] || `proqtrack-report-${id}`;
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { filename, size: blob.size };
}

export const M6 = Object.freeze({
  analytics: {
    overview: params => api(`/api/analytics/overview${queryString(params)}`),
    query: (entity, params) => api(`/api/query/${encodeURIComponent(entity)}${queryString(params)}`),
  },
  reports: {
    create: input => api('/api/reports', { method: 'POST', body: JSON.stringify(input || {}) }),
    list: params => api(`/api/reports${queryString(params)}`),
    get: id => api(`/api/reports/${encodeURIComponent(id)}`),
    cancel: id => api(`/api/reports/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
    retry: id => api(`/api/reports/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
    download: downloadReport,
  },
  schedules: {
    create: input => api('/api/report-schedules', { method: 'POST', body: JSON.stringify(input || {}) }),
    list: () => api('/api/report-schedules'),
    setStatus: (id, status) => api(`/api/report-schedules/${encodeURIComponent(id)}/status`, {
      method: 'POST', body: JSON.stringify({ status }),
    }),
  },
  workflows: {
    create: input => api('/api/workflows', { method: 'POST', body: JSON.stringify(input || {}) }),
    list: params => api(`/api/workflows${queryString(params)}`),
    get: id => api(`/api/workflows/${encodeURIComponent(id)}`),
    action: (id, action, comment = '') => api(`/api/workflows/${encodeURIComponent(id)}/action`, {
      method: 'POST', body: JSON.stringify({ action, comment }),
    }),
  },
  notifications: {
    list: params => api(`/api/notifications${queryString(params)}`),
    read: id => api(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' }),
  },
});

if (typeof window !== 'undefined') {
  window.ProQTrackM6 = M6;
  if (typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('proqtrack:m6-ready'));
}
