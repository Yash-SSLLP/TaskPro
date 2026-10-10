/**
 * The API client: which server to talk to, the session token, JSON requests,
 * multipart requests (files and voice notes inside task requests), single
 * file uploads and authenticated downloads.
 *
 * Every failure becomes an ApiError with a message written for people
 * ("Can't reach the server…", or the server's own `{ error }`). Failures that
 * affect the whole session (expired session, a disabled account, "choose a
 * new password first") are also passed to one handler the session store
 * registers, so every screen gets the same behaviour for free.
 *
 * Every request carries `X-App-Lang` (the app's language) and says which app
 * it is, so the Super Admin's console can show who is signed in where, on
 * which version: X-Platform, X-App-Version, X-App-Build, X-Device-Name,
 * X-OS-Version and X-Push-Permission (read once at start-up and whenever the
 * app comes back to the front; never asked for).
 */
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import * as Notifications from 'expo-notifications';
import productConfig from '../product/config';
import { currentLanguage, tr } from '../i18n';
import { IS_WEB, installWeb, prepareForm, webOrigin, webPushPermission } from './web';

// iPhone web build only (a no-op in the phone app): browser uploads.
installWeb();

const URL_KEY = `${productConfig.key}.apiUrl`;
const REQUEST_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 120000;

export class ApiError extends Error {
  constructor(message, { status = 0, code, data } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

// ---------------------------------------------------------------- server address

/** "192.168.1.5:5120" → "http://192.168.1.5:5120" (no trailing slash or /api). */
export function normalizeUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  s = s.replace(/\/+$/, '').replace(/\/api$/i, '');
  return s;
}

export function defaultApiUrl() {
  // The iPhone web build is served BY the website, so it talks to whichever
  // host served it: same origin, no CORS.
  if (webOrigin) return webOrigin;
  return normalizeUrl(Constants.expoConfig?.extra?.apiUrl || 'http://10.0.2.2:5120');
}

let baseUrl = defaultApiUrl();

export const getApiUrl = () => baseUrl;

/** Load a server address saved on the Server settings screen. */
export async function loadApiUrl() {
  try {
    const saved = await AsyncStorage.getItem(URL_KEY);
    if (saved) baseUrl = normalizeUrl(saved);
  } catch {
    /* keep the default */
  }
  return baseUrl;
}

/** Save (or with an empty value, forget) the server address. */
export async function saveApiUrl(url) {
  const clean = normalizeUrl(url);
  if (!clean || clean === defaultApiUrl()) {
    await AsyncStorage.removeItem(URL_KEY);
    baseUrl = defaultApiUrl();
  } else {
    await AsyncStorage.setItem(URL_KEY, clean);
    baseUrl = clean;
  }
  return baseUrl;
}

/**
 * Is there a server for this product at `url`?
 * @returns {Promise<string>} the normalised url; throws an ApiError otherwise
 */
export async function checkServer(url) {
  const clean = normalizeUrl(url);
  if (!clean) throw new ApiError(tr('Enter the server address'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let data = null;
  try {
    const res = await fetch(`${clean}/api/health`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    data = await res.json().catch(() => null);
  } catch {
    throw new ApiError(tr('Could not reach {url}. Check the address and that the phone is on the same network.', { url: clean }));
  } finally {
    clearTimeout(timer);
  }
  if (!data?.ok) throw new ApiError(tr('That address answered, but it is not a working server.'));
  if (data.service !== productConfig.healthService) {
    throw new ApiError(tr('That is a server for another app, not {name}.', { name: productConfig.name }));
  }
  return clean;
}

/** A signed file path from the API ("/api/files/…") → a full URL. */
export function fileUrl(path) {
  if (!path) return null;
  if (/^(https?:|file:|content:|data:)/i.test(path)) return path;
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

// ---------------------------------------------------------------- session token

let token = null;
let failureHandler = null;

export const setToken = (t) => {
  token = t || null;
};
export const getToken = () => token;

/** Headers for something fetched outside this client (a voice note stream). */
export const authHeaders = () => (token ? { Authorization: `Bearer ${token}` } : {});

/** The session store registers this to react to session-wide failures. */
export function setSessionFailureHandler(fn) {
  failureHandler = fn;
}

const SESSION_CODES = new Set(['SESSION_EXPIRED', 'USER_DISABLED', 'PASSWORD_CHANGE_REQUIRED']);

function reportFailure(err, sentToken) {
  // Ignore answers to requests made with an older token (e.g. before a new sign-in).
  if (!sentToken || sentToken !== token || !failureHandler) return;
  if (err.status === 401 || SESSION_CODES.has(err.code)) failureHandler(err);
}

// ---------------------------------------------------------------- requests

function buildUrl(path, query) {
  let url = `${baseUrl}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `${url.includes('?') ? '&' : '?'}${qs}`;
  }
  return url;
}

function statusMessage(status) {
  if (status === 401) return tr('Please sign in again.');
  if (status === 403) return tr("You don't have access to this.");
  if (status === 404) return tr('Not found. It may have been removed.');
  if (status === 413) return tr('That file is too large.');
  if (status === 429) return tr('Too many attempts. Please wait a few minutes and try again.');
  if (status >= 500) return tr('Something went wrong on the server. Please try again.');
  return tr('Something went wrong. Please try again.');
}

const networkMessage = () => tr("Can't reach the server. Check your internet connection and try again.");

// ---------------------------------------------------------------- who is asking

/** Printable ASCII only (header values must be), trimmed and short. */
const headerText = (value, max = 80) =>
  String(value || '')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, max);

/** "Google Pixel 7", "Samsung SM-A515F", "iPhone 15". */
function deviceLabel() {
  if (IS_WEB) return /iPhone|iPod/.test(navigator.userAgent || '') ? 'iPhone (home screen app)' : 'Web app';
  const make = headerText(Device.manufacturer || Device.brand, 30);
  const model = headerText(Device.modelName, 50);
  if (!model) return make;
  if (!make || model.toLowerCase().startsWith(make.toLowerCase())) return model;
  return `${make.charAt(0).toUpperCase()}${make.slice(1)} ${model}`;
}

const CLIENT_HEADERS = Object.fromEntries(
  Object.entries({
    // The iPhone web build is the iPhone app, so the console counts it as one.
    'X-Platform': IS_WEB
      ? /iPhone|iPod/.test(navigator.userAgent || '') ? 'ios' : 'web'
      : ['android', 'ios'].includes(Platform.OS) ? Platform.OS : 'other',
    // The iPhone web build has no native package: it is the build app.json names.
    'X-App-Version': headerText(Application.nativeApplicationVersion || (IS_WEB ? Constants.expoConfig?.version : ''), 40),
    'X-App-Build': headerText(Application.nativeBuildVersion || (IS_WEB ? Constants.expoConfig?.android?.versionCode : ''), 20),
    'X-Device-Name': deviceLabel(),
    'X-OS-Version': headerText([Device.osName, Device.osVersion].filter(Boolean).join(' '), 40),
  }).filter(([, v]) => v)
);

let pushPermission = null;

/** Whether this phone lets the app show notifications ('granted' | 'denied' | 'undetermined'). Never asks. */
export async function refreshPushPermission() {
  if (IS_WEB) {
    pushPermission = webPushPermission();
    return pushPermission;
  }
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (['granted', 'denied', 'undetermined'].includes(status)) pushPermission = status;
  } catch {
    /* not known on this device */
  }
  return pushPermission;
}

refreshPushPermission();
// The person may change it in the phone's settings while the app is in the background.
AppState.addEventListener('change', (state) => {
  if (state === 'active') refreshPushPermission();
});

function baseHeaders(sentToken) {
  const headers = { Accept: 'application/json', 'X-App-Lang': currentLanguage(), ...CLIENT_HEADERS };
  if (pushPermission) headers['X-Push-Permission'] = pushPermission;
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`;
  return headers;
}

function parse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {string} method
 * @param {string} path e.g. "/api/tasks"
 * @param {{ body?: any, query?: object, auth?: boolean, timeout?: number }} opts
 */
export async function request(method, path, { body, query, auth = true, timeout = REQUEST_TIMEOUT_MS } = {}) {
  const sentToken = auth ? token : null;
  const headers = baseHeaders(sentToken);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  let res;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(timedOut ? tr('The server is taking too long to answer. Please try again.') : networkMessage(), {
      code: 'NETWORK',
    });
  } finally {
    clearTimeout(timer);
  }

  const data = parse(await res.text().catch(() => ''));
  if (!res.ok) {
    const err = new ApiError(data?.error || data?.message || statusMessage(res.status), { status: res.status, code: data?.code, data });
    reportFailure(err, sentToken);
    throw err;
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body: body ?? {} }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body: body ?? {} }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body: body ?? {} }),
  del: (path, opts) => request('DELETE', path, opts),
};

// ---------------------------------------------------------------- multipart

/**
 * Send a multipart form (a task with files or a voice note), reporting upload
 * progress (0..1). XHR rather than fetch: fetch has no upload progress.
 * @param {string} method
 * @param {string} path
 * @param {FormData} form
 * @param {{ onProgress?: (p: number) => void, query?: object }} opts
 */
export async function sendForm(method, path, form, { onProgress, query } = {}) {
  const sentToken = token;
  // The iPhone web build turns the picked files into real Blobs first.
  const body = await prepareForm(form);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, buildUrl(path, query));
    const headers = baseHeaders(sentToken);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
      };
    }
    xhr.onload = () => {
      const data = parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      const err = new ApiError(data?.error || data?.message || statusMessage(xhr.status), { status: xhr.status, code: data?.code, data });
      reportFailure(err, sentToken);
      reject(err);
    };
    xhr.onerror = () => reject(new ApiError(networkMessage(), { code: 'NETWORK' }));
    xhr.ontimeout = () => reject(new ApiError(tr('The upload took too long. Please try again.'), { code: 'NETWORK' }));
    xhr.send(body);
  });
}

/**
 * Upload one file as multipart form data, reporting progress (0..1).
 * @param {string} path e.g. "/api/files"
 * @param {{ uri: string, name: string, type: string }} file
 * @param {{ field?: string, onProgress?: (p: number) => void }} opts
 */
export function upload(path, file, { field = 'file', onProgress } = {}) {
  const form = new FormData();
  form.append(field, { uri: file.uri, name: file.name, type: file.type });
  return sendForm('POST', path, form, { onProgress });
}

const safeFileName = (name) => String(name || 'file').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'file';

/**
 * Download an authenticated file into the cache folder.
 * @returns {Promise<string>} the local file uri
 */
export async function downloadFile(path, fileName, { query } = {}) {
  const sentToken = token;
  const target = `${FileSystem.cacheDirectory}${safeFileName(fileName)}`;
  let result;
  try {
    result = await FileSystem.downloadAsync(buildUrl(path, query), target, { headers: baseHeaders(sentToken) });
  } catch {
    throw new ApiError(networkMessage(), { code: 'NETWORK' });
  }
  if (result.status >= 200 && result.status < 300) return result.uri;

  // The body of a failed download is the JSON error.
  let data = null;
  try {
    data = JSON.parse(await FileSystem.readAsStringAsync(result.uri));
  } catch {
    data = null;
  }
  FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
  const err = new ApiError(data?.error || statusMessage(result.status), { status: result.status, code: data?.code, data });
  reportFailure(err, sentToken);
  throw err;
}

/** Download a URL (signed, or with the session header when `auth`) to share or open it. */
export async function downloadPublic(url, fileName, { auth = false } = {}) {
  const target = `${FileSystem.cacheDirectory}${safeFileName(fileName)}`;
  let result;
  try {
    result = await FileSystem.downloadAsync(url, target, auth ? { headers: baseHeaders(token) } : undefined);
  } catch {
    throw new ApiError(networkMessage(), { code: 'NETWORK' });
  }
  if (result.status < 200 || result.status >= 300) throw new ApiError(statusMessage(result.status), { status: result.status });
  return result.uri;
}
