// Web only (metro.config.js): `expo-file-system/legacy` for the iPhone web build.
//
// A browser page has no app cache folder, so files the app "writes to disk"
// live in memory instead, keyed by the same kind of path the screens already
// build (`${cacheDirectory}report.pdf`). That keeps every download, export
// and upload call site unchanged: downloadAsync fetches WITH its headers and
// stores the Blob, writeAsStringAsync turns base64/text into a Blob, and the
// share/view shims and the upload patch read the Blob back with getBlob().
// Nothing survives a reload — the same as a cache the OS may clear.

export const cacheDirectory = 'webfs://cache/';
export const documentDirectory = 'webfs://documents/';
export const bundleDirectory = 'webfs://bundle/';
export const EncodingType = { UTF8: 'utf8', Base64: 'base64' };
export const FileSystemSessionType = { BACKGROUND: 0, FOREGROUND: 1 };
export const FileSystemUploadType = { BINARY_CONTENT: 0, MULTIPART: 1 };

const files = new Map(); // uri -> { blob, mtime }

const isVirtual = (uri) => typeof uri === 'string' && uri.startsWith('webfs://');

function base64ToBytes(b64) {
  const bin = atob(String(b64).replace(/^data:[^,]*,/, '').replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function mimeFromName(uri) {
  const ext = String(uri).split('?')[0].split('.').pop().toLowerCase();
  return {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', heic: 'image/heic', csv: 'text/csv', txt: 'text/plain', json: 'application/json',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip: 'application/zip', ics: 'text/calendar', html: 'text/html',
  }[ext] || '';
}

/**
 * The Blob behind any URI the app may hold: a virtual cache file, or a
 * data:/blob:/http(s) URI handed back by the camera, image or document picker.
 * @param {string} uri
 * @returns {Promise<Blob>}
 */
export async function getBlob(uri) {
  if (isVirtual(uri)) {
    const f = files.get(uri);
    if (!f) throw new Error('That file is no longer available. Please try again.');
    return f.blob;
  }
  const res = await fetch(uri);
  return res.blob();
}

/** Store a Blob under a virtual path (used by the viewer and uploads). */
export function putBlob(uri, blob) {
  files.set(uri, { blob, mtime: Date.now() });
}

export async function downloadAsync(url, fileUri, options = {}) {
  const res = await fetch(url, { headers: options.headers || {} });
  const blob = await res.blob();
  const headers = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  // Name-based type when the server sent none, so a viewer knows what it holds.
  const typed = blob.type ? blob : new Blob([blob], { type: mimeFromName(fileUri) });
  files.set(fileUri, { blob: typed, mtime: Date.now() });
  return { uri: fileUri, status: res.status, headers, mimeType: typed.type || null, md5: undefined };
}

export function createDownloadResumable(url, fileUri, options = {}, callback) {
  return {
    downloadAsync: async () => {
      const r = await downloadAsync(url, fileUri, options);
      callback?.({ totalBytesWritten: 1, totalBytesExpectedToWrite: 1 });
      return r;
    },
    pauseAsync: async () => ({}),
    resumeAsync: async () => downloadAsync(url, fileUri, options),
    cancelAsync: async () => {},
    savable: () => ({ url, fileUri, options }),
  };
}

export async function writeAsStringAsync(fileUri, contents, options = {}) {
  const enc = options.encoding || 'utf8';
  const type = mimeFromName(fileUri);
  const blob = enc === 'base64'
    ? new Blob([base64ToBytes(contents)], { type })
    : new Blob([String(contents)], { type: type || 'text/plain' });
  files.set(fileUri, { blob, mtime: Date.now() });
}

export async function readAsStringAsync(fileUri, options = {}) {
  const blob = await getBlob(fileUri);
  if ((options.encoding || 'utf8') === 'base64') return blobToBase64(blob);
  return blob.text();
}

export async function getInfoAsync(fileUri) {
  if (isVirtual(fileUri)) {
    if (fileUri.endsWith('/')) return { exists: true, isDirectory: true, uri: fileUri, size: 0, modificationTime: Date.now() / 1000 };
    const f = files.get(fileUri);
    if (!f) return { exists: false, isDirectory: false, uri: fileUri };
    return { exists: true, isDirectory: false, uri: fileUri, size: f.blob.size, modificationTime: f.mtime / 1000 };
  }
  try {
    const blob = await getBlob(fileUri);
    return { exists: true, isDirectory: false, uri: fileUri, size: blob.size, modificationTime: Date.now() / 1000 };
  } catch {
    return { exists: false, isDirectory: false, uri: fileUri };
  }
}

export async function deleteAsync(fileUri) {
  if (fileUri.endsWith('/')) {
    [...files.keys()].filter((k) => k.startsWith(fileUri)).forEach((k) => files.delete(k));
  } else {
    files.delete(fileUri);
  }
}

export async function moveAsync({ from, to }) {
  const blob = await getBlob(from);
  files.set(to, { blob, mtime: Date.now() });
  if (isVirtual(from)) files.delete(from);
}

export async function copyAsync({ from, to }) {
  const blob = await getBlob(from);
  files.set(to, { blob, mtime: Date.now() });
}

export async function makeDirectoryAsync() {}

export async function readDirectoryAsync(dirUri) {
  const dir = dirUri.endsWith('/') ? dirUri : `${dirUri}/`;
  return [...files.keys()]
    .filter((k) => k.startsWith(dir) && !k.slice(dir.length).includes('/'))
    .map((k) => k.slice(dir.length));
}

/** A URL a browser element can load the file from. */
export async function getContentUriAsync(fileUri) {
  if (!isVirtual(fileUri)) return fileUri;
  return URL.createObjectURL(await getBlob(fileUri));
}

export async function getFreeDiskStorageAsync() { return 1024 * 1024 * 1024; }
export async function getTotalDiskCapacityAsync() { return 1024 * 1024 * 1024; }

export async function uploadAsync(url, fileUri, options = {}) {
  const blob = await getBlob(fileUri);
  let body = blob;
  if (options.uploadType === FileSystemUploadType.MULTIPART) {
    body = new FormData();
    Object.entries(options.parameters || {}).forEach(([k, v]) => body.append(k, v));
    body.append(options.fieldName || 'file', blob, fileUri.split('/').pop());
  }
  const res = await fetch(url, { method: options.httpMethod || 'POST', headers: options.headers || {}, body });
  const headers = {};
  res.headers.forEach((v, k) => { headers[k] = v; });
  return { status: res.status, headers, body: await res.text() };
}

export const StorageAccessFramework = {
  requestDirectoryPermissionsAsync: async () => ({ granted: false }),
};
