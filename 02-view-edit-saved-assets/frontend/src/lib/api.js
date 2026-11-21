const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/$/, '');
const STORE = 'dw.tokens';

export class ApiError extends Error {
  constructor(status, data) {
    super(firstMessage(data) || `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
  field(name) {
    const v = this.data?.[name];
    return Array.isArray(v) ? v[0] : v;
  }
}

function firstMessage(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.detail) return data.detail;
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
    if (typeof v === 'string') return v;
  }
  return null;
}

export const tokens = {
  get() {
    try { return JSON.parse(localStorage.getItem(STORE)) || null; } catch { return null; }
  },
  set(t) {
    try { t ? localStorage.setItem(STORE, JSON.stringify(t)) : localStorage.removeItem(STORE); } catch { /* storage blocked */ }
  },
};

let refreshing = null;

async function refreshAccess() {
  const t = tokens.get();
  if (!t?.refresh) return false;
  refreshing ||= fetch(`${BASE}/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: t.refresh }),
  })
    .then(async (res) => {
      if (!res.ok) { tokens.set(null); return false; }
      const data = await res.json();
      tokens.set({ access: data.access, refresh: data.refresh || t.refresh });
      return true;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

/**
 * request('/vault/assets/', { method: 'POST', body: {...} })
 * - plain objects are sent as JSON, FormData as multipart
 * - `raw: true` returns the Response's ArrayBuffer (encrypted blobs)
 * - `auth: false` for public token endpoints
 */
export async function request(path, { method = 'GET', body, raw = false, auth = true, retry = true } = {}) {
  const headers = {};
  const t = tokens.get();
  if (auth && t?.access) headers.Authorization = `Bearer ${t.access}`;
  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, { detail: 'network' });
  }
  if (res.status === 401 && auth && retry && t?.refresh) {
    if (await refreshAccess()) return request(path, { method, body, raw, auth, retry: false });
    onUnauthorized();
  }
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    throw new ApiError(res.status, data);
  }
  if (raw) return res.arrayBuffer();
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (p, o) => request(p, o),
  post: (p, body, o) => request(p, { ...o, method: 'POST', body }),
  put: (p, body, o) => request(p, { ...o, method: 'PUT', body }),
  patch: (p, body, o) => request(p, { ...o, method: 'PATCH', body }),
  del: (p, body, o) => request(p, { ...o, method: 'DELETE', body }),
};
