/**
 * Every call the task module makes, in one place, and the React Query keys
 * that cache them.
 *
 * Task endpoints keep the HRMS Tasks API shapes (`_id`, routes, query params,
 * multipart field names); see backend/API.md §3 for the differences. The
 * function names follow the HRMS mobile client so the two read alike.
 *
 * FILES AND VOICE NOTES ride inside the task requests as multipart: `voice`
 * (+ `voiceDurationMs`) for a recording, `files` for attachments, and every
 * array or object field JSON-encoded. A file name with spaces or brackets
 * makes React Native write a `filename*=` header some servers drop, so part
 * names are made safe here, in one place.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl, getApiUrl, sendForm } from '../platform/api';
import { platformKeys } from '../platform/endpoints';
import { useInApp } from '../platform/hooks';

export const taskKeys = {
  all: ['tasks'],
  list: (params) => ['tasks', 'list', params],
  detail: (id) => ['tasks', 'detail', id],
  recurring: (scope) => ['tasks', 'recurring', scope || 'mine'],
  schedule: (id) => ['tasks', 'schedule', id],
  dashboard: (params) => ['tasks', 'dashboard', params],
  overdue: (params) => ['tasks', 'overdue', params],
  meta: ['taskMeta'],
  categories: ['taskCategories'],
};

// ---------------------------------------------------------------- multipart

const safePartName = (name, fallback) => {
  const raw = String(name || fallback || 'file');
  const dot = raw.lastIndexOf('.');
  const base = (dot > 0 ? raw.slice(0, dot) : raw).replace(/[^\w.-]+/g, '_').slice(0, 80) || 'file';
  const ext = dot > 0 ? raw.slice(dot + 1).replace(/[^\w]+/g, '').slice(0, 8) : '';
  return ext ? `${base}.${ext}` : base;
};

/** 'audio/mp4' from 'note.m4a' when a picker gives no type. */
const TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  mp4: 'video/mp4',
};
export const mimeFromName = (name) => TYPES[(/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase()] || 'application/octet-stream';

/**
 * Plain JSON when there is nothing to upload; multipart the moment there is a
 * recording or a file.
 * @param {object} body
 * @param {{ voice?: { uri, durationMs, name?, type? }, files?: Array<{ uri, name, mime?, type? }> }} upload
 */
function build(body = {}, { voice, files } = {}) {
  const hasUpload = Boolean(voice) || Boolean(files?.length);
  if (!hasUpload) return { json: body };
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    if (value === null) form.append(key, '');
    else if (value instanceof Date) form.append(key, value.toISOString());
    else if (typeof value === 'object') form.append(key, JSON.stringify(value));
    else form.append(key, String(value));
  }
  if (voice) {
    const name = safePartName(voice.name || 'voice-note.m4a', 'voice-note.m4a');
    form.append('voice', { uri: voice.uri, name, type: voice.type || mimeFromName(name) || 'audio/mp4' });
    if (voice.durationMs) form.append('voiceDurationMs', String(Math.round(voice.durationMs)));
  }
  (files || []).forEach((f, i) => {
    if (!f) return;
    const name = safePartName(f.name, `file-${i + 1}`);
    form.append('files', { uri: f.uri, name, type: f.mime || f.type || mimeFromName(name) });
  });
  return { form };
}

function send(method, path, body, upload, opts) {
  const { json, form } = build(body, upload);
  if (form) return sendForm(method, path, form, opts);
  if (method === 'POST') return api.post(path, json);
  if (method === 'PATCH') return api.patch(path, json);
  return api.put(path, json);
}

const T = '/api/tasks';

// ---------------------------------------------------------------- reading

export const listTasks = (params = {}) => api.get(T, { query: params });
export const taskCounters = (params = {}) => api.get(`${T}/counters`, { query: params });
/** @returns {Promise<{ task, children, updates, can }>} */
export const getTask = (id) => api.get(`${T}/${id}`);
export const taskFeed = (id, params = {}) => api.get(`${T}/${id}/updates`, { query: params });
export const taskChildren = (id) => api.get(`${T}/${id}/children`);
export const taskMeta = () => api.get(`${T}/meta`);
export const dashboard = (params = {}) => api.get(`${T}/dashboard`, { query: params });
export const overdueReport = (params = {}) => api.get(`${T}/dashboard/overdue`, { query: params });

// ---------------------------------------------------------------- writing

/** Empty `assignees` means "mine": the server assigns it to its setter. */
export const createTask = (body, upload) => send('POST', T, body, upload);
export const updateTask = (id, body, upload) => send('PATCH', `${T}/${id}`, body, upload);

/** The one endpoint that moves anything else (cancel, reopen, complete…). */
export const changeStatus = (id, to, { note, mentions, voice, files } = {}) =>
  send('POST', `${T}/${id}/status`, { to, note, mentions }, { voice, files });

/** A plain remark: text, files and/or a voice note. */
export const addUpdate = (id, { note, mentions, voice, files } = {}) =>
  send('POST', `${T}/${id}/updates`, { note, mentions }, { voice, files });

/** Archive it; `purge` deletes it for good (Super Admin). */
export const deleteTask = (id, { purge } = {}) => api.del(`${T}/${id}`, { query: purge ? { purge: 1 } : undefined });

export const acceptTask = (id, note) => api.post(`${T}/${id}/accept`, note ? { note } : {});
/** The reason is required. */
export const declineTask = (id, reason) => api.post(`${T}/${id}/decline`, { reason });
/** Once per task per cooldown; a 429 carries `nextAt`. */
export const nudgeTask = (id, note) => api.post(`${T}/${id}/nudge`, note ? { note } : {});
export const delegateTask = (id, to, note) => api.post(`${T}/${id}/delegate`, { to, note });

export const submitTask = (id, { note, voice, files } = {}) => send('POST', `${T}/${id}/submit`, { note }, { voice, files });
export const approveTask = (id, { note, voice, files } = {}) => send('POST', `${T}/${id}/approve`, { note }, { voice, files });
/** Send back; the note is required. */
export const rejectTask = (id, { note, voice, files } = {}) => send('POST', `${T}/${id}/reject`, { note }, { voice, files });

export const setProgress = (id, progress, note) => api.patch(`${T}/${id}/progress`, { progress, note });

export const requestExtension = (id, { toDate, reason }) => api.post(`${T}/${id}/extension`, { toDate, reason });
export const decideExtension = (id, reqId, approve, note) => api.post(`${T}/${id}/extension/${reqId}`, { approve, note });

/** items: [{ title, description?, assignee?, openTo?, dueDate?, priority? }] */
export const splitTask = (id, items) => api.post(`${T}/${id}/split`, { items });
export const claimTask = (id) => api.post(`${T}/${id}/claim`);
export const transferTask = (id, to, reason) => api.post(`${T}/${id}/transfer`, { to, reason });

// ---------------------------------------------------------------- categories

export const listCategories = () => api.get(`${T}/categories`).then((r) => r.categories || []);
export const createCategory = (name, team) => api.post(`${T}/categories`, { name, ...(team ? { team } : {}) }).then((r) => r.category);

// ---------------------------------------------------------------- recurring

/** @returns {Promise<{ schedules, canSeeAll }>} */
export const listRecurring = (params = {}) => api.get(`${T}/recurring`, { query: params });
export const getRecurring = (id) => api.get(`${T}/recurring/${id}`).then((r) => r.schedule);
export const createRecurring = (body, upload) => send('POST', `${T}/recurring`, body, upload);
export const updateRecurring = (id, body, upload) => send('PATCH', `${T}/recurring/${id}`, body, upload);
export const deleteRecurring = (id) => api.del(`${T}/recurring/${id}`);
/** Raise whatever is due now. @returns {Promise<{ raised, tasks }>} */
export const runRecurring = (id) => api.post(`${T}/recurring/${id}/run`);

// ---------------------------------------------------------------- calendar

/**
 * The month board and its reminders (backend/src/product/routes/calendar.js
 * and reminders.js). Every month is cached under ['calendar', 'YYYY-MM'], so
 * a saved or deleted reminder refreshes them all through calendarKeys.all.
 */
export const calendarKeys = {
  all: ['calendar'],
  month: (ym) => ['calendar', ym],
};

/** @returns {Promise<{ year, month, events: Array<{ date, day, type, label, meta }>, aim }>} */
export const calendarMonth = (ym) => api.get('/api/calendar', { query: { month: ym } });

/** body: { title, date: 'YYYY-MM-DD', time?, notes?, priority?, scope?, recipients?, team? } → { reminder, notified } */
export const createReminder = (body) => api.post('/api/reminders', body);
/** The same fields, any of them; one left out keeps its value. → { reminder } */
export const updateReminder = (id, body) => api.put(`/api/reminders/${id}`, body);
/** Gone for everyone it was set for. → { id, deleted } */
export const deleteReminder = (id) => api.del(`/api/reminders/${id}`);

// ---------------------------------------------------------------- files

/**
 * Where to fetch an attachment: its signed `url` when the server sent one
 * (no header needed), else the session-protected stream.
 * @returns {{ uri: string, auth: boolean }}
 */
export function attachmentSource(taskId, file) {
  if (file?.url) return { uri: fileUrl(file.url), auth: false };
  return { uri: `${getApiUrl()}${T}/${taskId}/files/${file?._id || file?.id}`, auth: true };
}

/** The task's own voice note. */
export function taskVoiceSource(task) {
  const v = task?.voiceNote;
  if (v?.url) return { uri: fileUrl(v.url), auth: false };
  return { uri: `${getApiUrl()}${T}/${task?._id}/files/voice`, auth: true };
}

/** A voice note on one row of the history. */
export function updateVoiceSource(taskId, update) {
  const v = update?.voiceNote;
  if (v?.url) return { uri: fileUrl(v.url), auth: false };
  return { uri: `${getApiUrl()}${T}/${taskId}/updates/${update?._id}/voice`, auth: true };
}

// ---------------------------------------------------------------- hooks

/** GET /tasks/meta: people I can assign to, my teams, categories, vocabulary. Cached 5 minutes. */
export function useTaskMeta() {
  const enabled = useInApp();
  return useQuery({ queryKey: taskKeys.meta, queryFn: taskMeta, enabled, staleTime: 5 * 60 * 1000 });
}

/** GET /calendar for one month ('YYYY-MM'): my tasks by day, my reminders, and whom a reminder may go to. */
export function useCalendarMonth(ym) {
  const enabled = useInApp();
  return useQuery({ queryKey: calendarKeys.month(ym), queryFn: () => calendarMonth(ym), enabled });
}

/** After any change to a task: lists, counters, the task itself, alerts. */
export function invalidateTasks(qc) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: taskKeys.all }),
    qc.invalidateQueries({ queryKey: platformKeys.notifications }),
  ]);
}

/** The same, as a hook-made callback. */
export function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => invalidateTasks(qc);
}
