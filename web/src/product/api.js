/**
 * Every call the task module makes, in one place — the HRMS `api/tasks.js`
 * client on KARO's fetch client. Calls that can carry a voice note and
 * files (create, edit, move, remark, submit/approve/reject, recurring) go
 * through `api.send`, which builds the multipart body the HRMS way.
 */
import { api, qs } from '../platform/api';

const T = '/api/tasks';

// ===== Reading =====
export const listTasks = (params = {}) => api.get(`${T}${qs(params)}`);
export const boardTasks = (params = {}) => api.get(`${T}/board${qs(params)}`);
export const taskCounters = (params = {}) => api.get(`${T}/counters${qs(params)}`);
export const exportTasks = (params = {}) => api.download(`${T}/export${qs(params)}`, 'Tasks.xlsx');
export const getTask = (id) => api.get(`${T}/${id}`);
export const taskMeta = () => api.get(`${T}/meta`);
export const dashboard = (params = {}) => api.get(`${T}/dashboard${qs(params)}`);
export const overdueReport = (params = {}) => api.get(`${T}/dashboard/overdue${qs(params)}`);

// ===== Writing =====
/** Empty `assignees` means "mine" — the server assigns it to its setter. */
export const createTask = (body, upload) => api.send('POST', T, body, upload);
export const updateTask = (id, body, upload) => api.send('PATCH', `${T}/${id}`, body, upload);
/** The one endpoint that moves anything. Every move carries a note or a recording. */
export const changeStatus = (id, to, { note, mentions, voice, files } = {}) =>
  api.send('POST', `${T}/${id}/status`, { to, note, mentions }, { voice, files });
export const addUpdate = (id, { note, mentions, voice, files } = {}) =>
  api.send('POST', `${T}/${id}/updates`, { note, mentions }, { voice, files });
/** Archive by default; `purge` really deletes (Super Admin only). */
export const deleteTask = (id, { purge } = {}) => api.del(`${T}/${id}${purge ? '?purge=1' : ''}`);

// ===== The doer's answers =====
export const acceptTask = (id, note) => api.post(`${T}/${id}/accept`, note ? { note } : {});
/** The reason is required. */
export const declineTask = (id, reason) => api.post(`${T}/${id}/decline`, { reason });
/** Once per task per cooldown: a second press is a 429 whose body carries `nextAt`. */
export const nudgeTask = (id, note) => api.post(`${T}/${id}/nudge`, note ? { note } : {});
export const delegateTask = (id, to, note) => api.post(`${T}/${id}/delegate`, { to, note });

export const submitTask = (id, { note, mentions, voice, files } = {}) =>
  api.send('POST', `${T}/${id}/submit`, { note, mentions }, { voice, files });
export const approveTask = (id, { note, voice, files } = {}) => api.send('POST', `${T}/${id}/approve`, { note }, { voice, files });
/** Send back — the note is required. */
export const rejectTask = (id, { note, voice, files } = {}) => api.send('POST', `${T}/${id}/reject`, { note }, { voice, files });

export const setProgress = (id, progress, note) => api.patch(`${T}/${id}/progress`, { progress, note });

export const requestExtension = (id, { toDate, reason }) => api.post(`${T}/${id}/extension`, { toDate, reason });
export const decideExtension = (id, reqId, { approve, note } = {}) => api.post(`${T}/${id}/extension/${reqId}`, { approve, note });

/** `items`: [{ title, description?, assignee?, openTo?, dueDate?, priority? }] */
export const splitTask = (id, items) => api.post(`${T}/${id}/split`, { items });
export const claimTask = (id) => api.post(`${T}/${id}/claim`);
export const transferTask = (id, to, reason) => api.post(`${T}/${id}/transfer`, { to, reason });

// ===== Categories =====
export const listCategories = (params = {}) => api.get(`${T}/categories${qs(params)}`);
export const createCategory = (name, team) => api.post(`${T}/categories`, team ? { name, team } : { name });
export const renameCategory = (id, name) => api.patch(`${T}/categories/${id}`, { name });
export const deleteCategory = (id) => api.del(`${T}/categories/${id}`);

// ===== Templates =====
export const listTemplates = () => api.get(`${T}/templates`);
export const createTemplate = (body) => api.post(`${T}/templates`, body);
export const copyTemplate = (id) => api.post(`${T}/templates/${id}/copy`);
export const templatePrefill = (id) => api.get(`${T}/templates/${id}/prefill`);
export const deleteTemplate = (id) => api.del(`${T}/templates/${id}`);

// ===== Recurring =====
export const listRecurring = (params = {}) => api.get(`${T}/recurring${qs(params)}`);
export const getRecurring = (id) => api.get(`${T}/recurring/${id}`);
export const createRecurring = (body, upload) => api.send('POST', `${T}/recurring`, body, upload);
export const updateRecurring = (id, body, upload) => api.send('PATCH', `${T}/recurring/${id}`, body, upload);
export const deleteRecurring = (id) => api.del(`${T}/recurring/${id}`);
export const runRecurring = (id) => api.post(`${T}/recurring/${id}/run`);

// ===== Files =====
/** Session-streamed paths, used when a file carries no signed `url`. */
export const fileUrl = (taskId, fileId) => `${T}/${taskId}/files/${fileId}`;
export const taskVoiceUrl = (taskId) => `${T}/${taskId}/files/voice`;
export const updateVoiceUrl = (taskId, updateId) => `${T}/${taskId}/updates/${updateId}/voice`;
