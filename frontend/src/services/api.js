import axios from 'axios';

const API_BASE = `${(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')}/api`;

const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 60_000,
});

/** Turns any axios error into a friendly message string. */
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (axios.isCancel?.(err)) return 'Request cancelled.';
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.code === 'ECONNABORTED') return 'The request timed out. Please check your connection and try again.';
  if (err?.message === 'Network Error') return 'Cannot reach the server. Please check your connection.';
  return fallback;
}

const tokenHeaders = (token) => (token ? { 'X-Document-Token': token } : {});
const tokenQuery = (token, extra = {}) => {
  const params = new URLSearchParams(extra);
  if (token) params.set('t', token);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

/* ---------- Admin auth ---------- */
export const login = (username, password) => http.post('/admin/login', { username, password }).then((r) => r.data);
export const logout = () => http.post('/admin/logout').then((r) => r.data);
export const getSession = () => http.get('/admin/me').then((r) => r.data);

/* ---------- Admin documents ---------- */
export const uploadDocument = (file, { onProgress, signal } = {}) => {
  const form = new FormData();
  form.append('file', file);
  return http
    .post('/admin/upload', form, {
      signal,
      timeout: 0,
      onUploadProgress: (e) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
    })
    .then((r) => r.data.document);
};
export const listDocuments = () => http.get('/admin/documents').then((r) => r.data.documents);
export const deleteDocument = (id) => http.delete(`/admin/documents/${encodeURIComponent(id)}`).then((r) => r.data);

/* ---------- Public (share link) ---------- */
export const getDocument = (id, token) =>
  http.get(`/documents/${encodeURIComponent(id)}`, { headers: tokenHeaders(token) }).then((r) => r.data.document);

export const signDocument = (id, token, payload) =>
  http
    .post(`/documents/${encodeURIComponent(id)}/sign`, payload, { headers: tokenHeaders(token) })
    .then((r) => r.data.document);

export const originalPdfUrl = (id, token, { download = false } = {}) =>
  `${API_BASE}/documents/${encodeURIComponent(id)}/pdf${tokenQuery(token, download ? { download: '1' } : {})}`;

export const signedPdfUrl = (id, token, { download = true } = {}) =>
  `${API_BASE}/documents/${encodeURIComponent(id)}/signed-pdf${tokenQuery(token, download ? {} : { download: '0' })}`;

/** Absolute share link for a document (uses the browser origin unless VITE_PUBLIC_APP_URL is set). */
export const shareUrl = (doc) =>
  `${(import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, '')}${doc.sharePath}`;

export default http;
