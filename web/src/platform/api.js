/**
 * Talking to the API: JSON requests, multipart uploads and file downloads.
 *
 * Every failure becomes an ApiError whose message can be shown to the person
 * as-is (`error`, or an HRMS-style `message`). A few answers are handled here
 * for the whole app: an ended session signs out, a disabled account signs out
 * with a notice, and "choose a new password first" flips the session into the
 * forced-password screen.
 */
import { useSession } from './session';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(status, message, code, data = null) {
    super(message);
    this.status = status;
    this.code = code;
    /** The whole JSON body, for answers that carry more than a sentence (e.g. a nudge's `nextAt`). */
    this.data = data;
  }
}

/** Absolute URL for an API path (file links in responses are relative). */
export const apiUrl = (path) => (/^(https?:|blob:|data:)/i.test(path || '') ? path : `${BASE}${path}`);

function handleGlobal(err) {
  const s = useSession.getState();
  if (!s.token) return;
  if (err.code === 'SESSION_EXPIRED' || (err.status === 401 && err.code !== 'BAD_CREDENTIALS')) {
    s.signOut('Your session ended. Please sign in again.');
  } else if (err.code === 'USER_DISABLED') {
    s.signOut(err.message);
  } else if (err.code === 'PASSWORD_CHANGE_REQUIRED' && s.user && !s.user.mustChangePassword) {
    s.updateUser({ ...s.user, mustChangePassword: true });
  }
}

async function toError(res) {
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  const fallback = res.status >= 500 ? 'Something went wrong. Please try again.' : 'Request failed';
  return new ApiError(res.status, data?.error || data?.message || fallback, data?.code, data);
}

async function request(method, path, body, { raw = false } = {}) {
  const token = useSession.getState().token;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection.");
  }
  if (!res.ok) {
    const err = await toError(res);
    handleGlobal(err);
    throw err;
  }
  if (raw) return res;
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Build a query string, skipping empty values. */
export function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * A task-shaped body as a request body (the HRMS rule): plain JSON when there
 * is nothing to upload; multipart the moment there is a recording or a file,
 * with arrays and objects JSON-encoded, the recording under `voice` (and its
 * length under `voiceDurationMs`) and every file under `files`.
 */
export function toBody(body = {}, { voice, files } = {}) {
  const hasUpload = Boolean(voice) || Boolean(files?.length);
  if (!hasUpload) return body;
  const fd = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    if (value instanceof Date) fd.append(key, value.toISOString());
    else if (typeof value === 'object') fd.append(key, JSON.stringify(value));
    else fd.append(key, String(value));
  }
  if (voice) {
    fd.append('voice', voice.blob, voice.name || 'voice-note.webm');
    if (voice.durationMs) fd.set('voiceDurationMs', String(Math.round(voice.durationMs)));
  }
  for (const f of files || []) fd.append('files', f, f.name);
  return fd;
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body = {}) => request('PATCH', path, body),
  del: (path, body) => request('DELETE', path, body),

  /** POST/PATCH a task-shaped body that may carry a voice note and files. */
  send: (method, path, body, upload) => request(method, path, toBody(body, upload)),

  /** Upload one file; resolves to { id, name, mime, size, url }. */
  async upload(file) {
    const form = new FormData();
    form.append('file', file, file.name);
    const data = await request('POST', '/api/files', form);
    return data.file;
  },

  /** Download a file (report, export) with the session and save it. */
  async download(path, fallbackName = 'download') {
    const res = await request('GET', path, undefined, { raw: true });
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    saveBlob(blob, match ? decodeURIComponent(match[1]) : fallbackName);
  },

  /** Fetch a protected file with the session and hand back an object URL (audio, images). */
  async blobUrl(path) {
    const res = await request('GET', path, undefined, { raw: true });
    return URL.createObjectURL(await res.blob());
  },
};

/**
 * Open a file: a signed `url` (no header needed) opens straight away; a
 * session-only path is fetched first and opened as a blob.
 */
export async function openFile({ url, path }) {
  if (url) {
    window.open(apiUrl(url), '_blank', 'noopener');
    return;
  }
  const win = window.open('', '_blank');
  try {
    const blobUrl = await api.blobUrl(path);
    if (win) win.location.href = blobUrl;
    else window.open(blobUrl, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (err) {
    win?.close();
    throw err;
  }
}
