/**
 * The shared platform API (sign-in, settings, contacts, people, teams,
 * alerts, devices, files and the Super Admin console) and the React Query
 * keys that cache it. Task endpoints live in src/product/api.js.
 *
 * Platform objects carry `id` (see backend/API.md §2).
 */
import { api, sendForm, upload } from './api';

export const platformKeys = {
  notifications: ['notifications'],
  unread: ['notifications', 'unread'],
  settings: ['me', 'settings'],
  contacts: ['contacts'],
  teams: ['teams'],
  team: (id) => ['teams', 'one', id],
  lookup: (pin) => ['people', 'lookup', pin],
  console: ['platform'],
  overview: ['platform', 'overview'],
  users: (q, status) => ['platform', 'users', q || '', status || ''],
  user: (id) => ['platform', 'user', id],
  adminTeams: (q) => ['platform', 'teams', q || ''],
  sessions: (window) => ['platform', 'sessions', window || 'online'],
  appVersions: ['platform', 'app-versions'],
  activity: (filters) => ['platform', 'activity', 'list', filters || {}],
  activityStats: ['platform', 'activity', 'stats'],
  activityEntry: (id) => ['platform', 'activity', 'one', id],
  release: ['app-release'],
};

// ---------------------------------------------------------------- auth

export const authApi = {
  login: (identifier, password) => api.post('/api/auth/login', { identifier, password }, { auth: false }),
  /** body: { name, identifier, password } */
  signup: (body) => api.post('/api/auth/signup', body, { auth: false }),
  me: () => api.get('/api/auth/me'),
  forgotPassword: (identifier) => api.post('/api/auth/forgot-password', { identifier }, { auth: false }),
  resetPassword: (resetToken, newPassword) => api.post('/api/auth/reset-password', { token: resetToken, newPassword }, { auth: false }),
  changePassword: (body) => api.post('/api/auth/change-password', body),
  updateProfile: (body) => api.patch('/api/auth/profile', body),
  deleteAccount: (password) => api.post('/api/auth/delete-account', { password }),
  /** End this device's session on the server (sign-out; best effort). */
  logout: () => api.post('/api/auth/logout', {}, { timeout: 8000 }),
};

// ---------------------------------------------------------------- my settings

export const settingsApi = {
  get: () => api.get('/api/me/settings').then((r) => r.settings),
  /** Any subset of Settings. */
  update: (body) => api.patch('/api/me/settings', body).then((r) => r.settings),
};

// ---------------------------------------------------------------- my profile photo

export const photoApi = {
  /**
   * A square JPEG ({ uri }) as my profile photo, reporting progress (0..1).
   * @returns {Promise<object>} the updated me (with `photoUrl`)
   */
  set: (file, onProgress) => {
    const form = new FormData();
    form.append('photo', { uri: file.uri, name: file.name || 'photo.jpg', type: file.type || 'image/jpeg' });
    return sendForm('PUT', '/api/me/photo', form, { onProgress }).then((r) => r.user);
  },
  /** Back to initials. @returns {Promise<object>} the updated me */
  remove: () => api.del('/api/me/photo').then((r) => r.user),
};

// ---------------------------------------------------------------- contacts (by Task Pin)

export const contactsApi = {
  /** @returns {Promise<{ contacts, incoming, outgoing }>} */
  list: () => api.get('/api/contacts'),
  /** @returns {Promise<{ status: 'requested' | 'accepted', request?, contact? }>} */
  add: (pin) => api.post('/api/contacts', { pin }),
  accept: (id) => api.post(`/api/contacts/${id}/accept`).then((r) => r.contact),
  decline: (id) => api.post(`/api/contacts/${id}/decline`),
  /** Remove a contact, or cancel my own outgoing request. */
  remove: (id) => api.del(`/api/contacts/${id}`),
};

// ---------------------------------------------------------------- people

export const peopleApi = {
  /** @returns {Promise<{ person, relation: 'self' | 'contact' | 'incoming' | 'outgoing' | 'none' }>} */
  lookup: (pin) => api.get('/api/people/lookup', { query: { pin } }),
  assignable: (q) => api.get('/api/people/assignable', { query: { q } }).then((r) => r.people || []),
};

// ---------------------------------------------------------------- teams

export const teamsApi = {
  /** @returns {Promise<{ teams, invites }>} */
  list: () => api.get('/api/teams'),
  create: (body) => api.post('/api/teams', body).then((r) => r.team),
  get: (id) => api.get(`/api/teams/${id}`).then((r) => r.team),
  update: (id, body) => api.patch(`/api/teams/${id}`, body).then((r) => r.team),
  remove: (id) => api.del(`/api/teams/${id}`),
  invite: (id, pin, role) => api.post(`/api/teams/${id}/members`, { pin, ...(role ? { role } : {}) }).then((r) => r.team),
  accept: (id) => api.post(`/api/teams/${id}/accept`).then((r) => r.team),
  decline: (id) => api.post(`/api/teams/${id}/decline`),
  setRole: (id, userId, role) => api.patch(`/api/teams/${id}/members/${userId}`, { role }).then((r) => r.team),
  /** Remove a member, cancel an invite, or (with my own id) leave. */
  removeMember: (id, userId) => api.del(`/api/teams/${id}/members/${userId}`),
  transfer: (id, userId) => api.post(`/api/teams/${id}/transfer`, { userId }).then((r) => r.team),
};

// ---------------------------------------------------------------- alerts

export const notificationsApi = {
  list: (before) => api.get('/api/notifications', { query: { before } }),
  unreadCount: () => api.get('/api/notifications/unread-count').then((r) => r.unread || 0),
  markRead: (ids) => api.post('/api/notifications/read', { ids }),
  markAllRead: () => api.post('/api/notifications/read', { all: true }),
  clearRead: () => api.del('/api/notifications'),
};

// ---------------------------------------------------------------- devices (push)

export const devicesApi = {
  register: (token, platform) => api.post('/api/devices', { token, platform }),
  // The token goes in the body (API.md); also in the query for servers that drop DELETE bodies.
  unregister: (token) => api.del('/api/devices', { body: { token }, query: { token } }),
};

// ---------------------------------------------------------------- files

export const filesApi = {
  /** @returns {Promise<{ id, name, mime, size, url }>} */
  upload: (file, onProgress) => upload('/api/files', file, { onProgress }).then((r) => r.file),
};

// ---------------------------------------------------------------- the Super Admin console

export const platformApi = {
  /** @returns {Promise<{ users, activeWeek, newWeek, disabled, teams, tasks, online, onlineDevices, signedIn, app }>} */
  overview: () => api.get('/api/platform/overview'),
  users: (q, status) => api.get('/api/platform/users', { query: { q, status } }).then((r) => r.users || []),
  /** @returns {Promise<{ user, teams, contacts, stats, online, sessions, app, notifications, recent, lastLoginAt }>} */
  user: (id) => api.get(`/api/platform/users/${id}`),
  setStatus: (id, status) => api.patch(`/api/platform/users/${id}`, { status }).then((r) => r.user),
  resetPassword: (id, password) => api.post(`/api/platform/users/${id}/password`, { password }),
  /** body: { name, email?, phone?, username?, title?, password? } → { user, temporaryPassword } */
  createUser: (body) => api.post('/api/platform/users', body),
  // The confirmation rides in the body and the query (some servers drop DELETE bodies).
  deleteUser: (id) => api.del(`/api/platform/users/${id}`, { body: { confirm: 'DELETE' }, query: { confirm: 'DELETE' } }),
  signOutEverywhere: (id) => api.post(`/api/platform/users/${id}/sign-out`),
  /** body: { dailyDigest?, dailyDigestAt?, defaultReminders? } → { settings, notifications } */
  updateSettings: (id, body) => api.patch(`/api/platform/users/${id}/settings`, body),
  /** window: online | today | 7d → { window, counts, people, sessions } */
  sessions: (window) => api.get('/api/platform/sessions', { query: { window } }),
  revokeSession: (sid) => api.post(`/api/platform/sessions/${encodeURIComponent(sid)}/revoke`),
  /** @returns {Promise<{ accounts, summary }>} */
  appVersions: () => api.get('/api/platform/app-versions'),
  /** query: { q?, group?, user?, from?, to?, before?, limit? } → { items, next } */
  activity: (query) => api.get('/api/platform/activity', { query }),
  activityStats: () => api.get('/api/platform/activity/stats'),
  /** @returns {Promise<{ entry, related, actor, subject }>} */
  activityEntry: (id) => api.get(`/api/platform/activity/${id}`),
  teams: (q) => api.get('/api/platform/teams', { query: { q } }).then((r) => r.teams || []),
  team: (id) => api.get(`/api/platform/teams/${id}`).then((r) => r.team),
  deleteTeam: (id) => api.del(`/api/platform/teams/${id}`),
};
