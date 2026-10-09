# KARO API contract (v2: Task Pins)

This is the contract between the backend, the web app and the mobile app. **Base URL `/api`.**
- Every request except sign-up, login and password reset sends `Authorization: Bearer <token>`.
- Errors are always `{ error: "message for the person", code?: "MACHINE_CODE" }` with a 4xx/5xx status.

**Two conventions, on purpose:**
- **Platform endpoints** (auth, contacts, teams, people, alerts, devices, files, the Super Admin console) use KARO's style: objects carry `id`.
- **Task endpoints** (`/api/tasks/**`) keep the **HRMS Tasks API shapes**: `_id`, `name`, the same routes, query params and response bodies as `F:\SSLLP\External App\Tasks\backend` (`routes/taskRoutes.js`, `controllers/task*.js`).
  - The HRMS clients (`Tasks/frontend/src/api/tasks.js`, `Tasks/mobile/src/api/tasks.js`) are the reference for how they are called.
  - Only the differences listed in §3 apply.
- **People objects inside task responses** have `_id` **and** `id` (same value), plus `name`, `pin` and `pinDisplay`.

---

## 1. Task Pin

- 8 characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. There is no 0, O, 1 or I.
- Stored without a dash (`7KQ4M9XA`), shown as `pinDisplay` `7KQ4-M9XA`.
- Input is forgiving: case, spaces and dashes are ignored (`7kq4 m9xa` works).
- Given at sign-up and never changes. The Super Admin has no pin.

## 2. Platform endpoints

### Shapes

**Me** (the signed-in person):
```json
{ "id": "…", "pin": "7KQ4M9XA", "pinDisplay": "7KQ4-M9XA", "name": "Asha", "title": "",
  "role": "user" | "superadmin", "status": "active" | "disabled",
  "email": "", "phone": "919876543210", "phoneDisplay": "+91 98765 43210", "username": "",
  "mustChangePassword": false, "lastSeenAt": "…", "createdAt": "…",
  "photoUrl": "/api/files/…?exp=…&sig=…" | null }
```

**Person** (anyone else; never includes logins):
```json
{ "id": "…", "pin": "7KQ4M9XA", "pinDisplay": "7KQ4-M9XA", "name": "Ravi", "title": "Accounts", "status": "active",
  "photoUrl": "/api/files/…?exp=…&sig=…" | null }
```

**Profile photos.** Every person object carries `photoUrl`: Me, Person (contacts, lookup, assignable, teams), the people in `/tasks/meta`, people inside task responses (`assignees[].user`, `createdBy`, `loopUsers`, `openTo`, feed `by`), schedules, dashboard person rows and reminder recipients. It is `null` when the person has no photo; the apps then draw initials.
- It is a signed link like any file link (relative: prefix the API base). No header is needed, so `<img src>` and RN `<Image>` load it directly.
- The link stays the same for a whole day (it is valid for 12 to 36 hours) and is served with `Cache-Control: private, max-age=86400, immutable`, so the apps can cache it. A new photo is a new file, so a new link.
- With a session instead of a signature, `GET /api/files/:id` opens any profile photo for anyone signed in.

**Settings** (per person):
```json
{ "timezone": "Asia/Kolkata", "workdayStart": "09:00",
  "approvalDefault": true,
  "defaultReminders": [ { "channel": "APP", "when": "BEFORE", "amount": 1, "unit": "DAYS" } ],
  "dailyDigest": true, "dailyDigestAt": "18:00",
  "lang": "en" }
```
- `lang` is one of `en` `hi` `kn` `ta` `te` `ml`. The mobile app also sends `X-App-Lang`. Server text stays English; the app translates its own UI.
- `defaultReminders` uses the HRMS reminder-rule shape. It is applied when a new task is created without reminders.

**Session payload** (login, sign-up and `/auth/me` all return this):
```json
{ "token": "…(only when issued/refreshed)", "user": Me, "settings": Settings,
  "product": { "key": "taskpro", "name": "KARO" } }
```

### Auth `/api/auth`

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/signup` | `{ name, identifier, password }` (identifier = email or mobile) | 201 session payload. `user.pin` is the new pin. |
| POST | `/login` | `{ identifier, password }` (email, mobile or username) | session payload. 401 `BAD_CREDENTIALS`, 403 `USER_DISABLED` |
| GET | `/me` | | session payload (plus a fresh `token` at most daily, and whenever the token has no `sid`) |
| POST | `/logout` | | `{ ok }`. Ends this device's session. Both apps call it on sign-out (best effort, never waited on). |
| PATCH | `/profile` | `{ name?, title?, email?, phone? }` | `{ user: Me }` |
| POST | `/change-password` | `{ currentPassword?, newPassword }` | `{ token, user }` |
| POST | `/forgot-password` | `{ identifier }` | `{ ok, emailEnabled, message }` |
| POST | `/delete-account` | `{ password }` | `{ ok, message }`: deletes your own account for good (not the Super Admin). Your profile, logins, pin, contacts, team memberships (owned teams pass to an admin or member), devices, alerts, and tasks nobody else is on are removed; shared tasks stay, showing "Deleted user". |
| POST | `/reset-password` | `{ token, newPassword }` | `{ ok }` |

`403 PASSWORD_CHANGE_REQUIRED` is returned on anything but `/auth/me`, `/auth/change-password`, `/auth/logout`, `/auth/delete-account` and `/devices` while `mustChangePassword` is set, for example after a Super Admin reset.

### Sessions (signed-in devices)

Every token now names its session: the JWT is `{ sub, v, sid }`. A session is one signed-in device (a browser or a phone). Ending a session signs out that device only; bumping `tokenVersion` (password change or reset, disabling, deleting, "sign out everywhere") still ends every session at once.

- Login, sign-up and change-password return a token for the device's session. Change-password keeps **this** device on its session and ends every other one. Reset-password (the emailed link) ends every session and starts none: both apps send the person to sign in afterwards.
- A token from before sessions existed (no `sid`) keeps working. Its session is made on first use, one per token (person + the token's issue time, so a burst of requests makes one), and `GET /auth/me` hands back a fresh token that names it. Nobody is signed out by the change.
- A token whose session was signed out answers **401 `SESSION_EXPIRED`** ("You were signed out. Please sign in again."). Both apps already sign out on that code.
- Sessions are kept after they end, so the console can show them. Everything goes 60 days after its last use (tokens last 30).

**Headers the apps send on every request** (all optional; an older app sends none, and its platform and browser are read from the `User-Agent` once):

| Header | Example |
|---|---|
| `X-Platform` | `web`, `android`, `ios` |
| `X-App-Version` | `1.0.3` (the web sends its package version) |
| `X-App-Build` | `4` (Android `versionCode`) |
| `X-Device-Name` | `Google Pixel 7`, `Chrome on Windows` |
| `X-OS-Version` | `Android 14` |
| `X-Push-Permission` | `granted`, `denied`, `undetermined` (phones; read, never asked for) |

The session's `lastSeenAt` is stamped at most once a minute; device details are updated as soon as they change, and only from requests that carry `X-Platform`.

**Online** = a request in the last 2 minutes (both apps poll at least every minute while open). **Signed in** = a session not signed out and used in the last 30 days.

### Settings and photo `/api/me`

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/settings` | | `{ settings }` |
| PATCH | `/settings` | any subset of Settings | `{ settings }` (400 on bad values) |
| PUT | `/photo` | multipart, field `photo`: a JPEG, PNG or WebP image, at most 2 MB | `{ user: Me }` with the new `photoUrl`. The previous photo file is deleted. |
| DELETE | `/photo` | | `{ user: Me }` with `photoUrl: null`. Harmless when there is no photo. |

- The server checks the file's bytes, not its declared type: anything that is not a JPEG, PNG or WebP image gets 400 "That file is not a photo we can use. Choose a JPEG, PNG or WebP image."
- Over 2 MB: 413 "That photo is too large. Choose one under 2 MB." No file, or a file under another field name: 400.
- The apps send a 512 × 512 JPEG at about 85% quality (a few dozen KB), cropped square on the device.
- Deleting an account deletes the photo too.

### Contacts `/api/contacts`: BBM style, by pin

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/` | | `{ contacts: [{ id, person, since }], incoming: [{ id, person, at }], outgoing: [{ id, person, at }] }`. `id` = the contact link id. |
| POST | `/` | `{ pin }` | 201 `{ status: "requested", request: { id, person, at } }`. If they had already asked you, it is accepted: `{ status: "accepted", contact: { id, person, since } }`. |
| POST | `/:id/accept` | | `{ contact: { id, person, since } }` (recipient only) |
| POST | `/:id/decline` | | `{ ok }` (recipient only; removes the request) |
| DELETE | `/:id` | | `{ ok }`: remove a contact (either side) or cancel your own outgoing request |

**Errors on POST:**
- 404 "No one has that Task Pin"
- 400 "That's your own pin"
- 409 "You're already contacts" / "You've already sent a request"

The other side gets an alert (`kind: "contact"`, link `/contacts`).

### People `/api/people`

| Method | Path | Returns |
|---|---|---|
| GET | `/lookup?pin=…` | `{ person, relation }`. `relation` is `self`, `contact`, `incoming`, `outgoing` or `none`. 404 if no one has that pin. Never finds the Super Admin. |
| GET | `/assignable?q=` | `{ people: [{ ...Person, self, contact, teams: [{ id, name }] }] }`. Order: you first, then team-mates, then contacts, each by name. For the Super Admin it is everyone active, searchable with `q` (limit 200). |

**Who you may assign to** (enforced in every task route): yourself, accepted contacts, and active members of a team you are an active member of. The Super Admin may assign to anyone.

### Teams `/api/teams`

**Team shape:**
```json
{ "id", "name", "description", "owner": Person, "myRole": "owner"|"admin"|"member"|null,
  "memberCount": 3,
  "members": [ { "person": Person, "role": "owner"|"admin"|"member", "status": "active"|"invited",
                 "invitedBy": Person|null, "joinedAt": "…"|null, "invitedAt": "…" } ] }
```
The list endpoint omits `members`.

| Method | Path | Body | Who | Returns |
|---|---|---|---|---|
| GET | `/` | | | `{ teams: [Team without members], invites: [{ team: { id, name }, invitedBy: Person, at }] }` |
| POST | `/` | `{ name, description? }` | anyone | 201 `{ team }`; you are the owner |
| GET | `/:id` | | members, invitees, Super Admin | `{ team }` |
| PATCH | `/:id` | `{ name?, description? }` | owner/admin | `{ team }` |
| DELETE | `/:id` | | owner, Super Admin | `{ ok }`. Its tasks keep `team: null`. |
| POST | `/:id/members` | `{ pin, role?: "admin"|"member" }` | owner/admin (only the owner may invite as admin) | 201 `{ team }`. The person gets an invite alert. 404 bad pin, 409 already in or invited. |
| POST | `/:id/accept` | | the invitee | `{ team }` |
| POST | `/:id/decline` | | the invitee | `{ ok }` |
| PATCH | `/:id/members/:userId` | `{ role: "admin"|"member" }` | owner | `{ team }` |
| DELETE | `/:id/members/:userId` | | owner/admin (not the owner), or yourself (leave). The owner cannot leave. | `{ ok }` |
| POST | `/:id/transfer` | `{ userId }` | owner → an active member | `{ team }`. The old owner becomes admin. |

### Alerts `/api/notifications` (unchanged shape, now per person)

- `GET /?before=` returns `{ unread, notifications: [{ id, title, body, link, kind, read, createdAt }], hasMore }`.
- `GET /unread-count`, `POST /read { ids? | all: true }`, `DELETE /` (clears read alerts).
- `kind` values:
  - `task` for any task event; link `/tasks/<taskId>`
  - `contact` (link `/contacts`) and `team` (link `/teams/<id>`)
  - `reminder` for a calendar reminder; link `/calendar?date=YYYY-MM-DD`
  - `info`
- The web app routes to the same paths. The mobile app maps them to screens.

### Live updates `/api/live`

How an open screen learns that somebody else changed what it shows. There are no sockets (the API runs on Vercel functions), so both apps poll this one cheap call and reload a topic's data only when its number moves.

- `GET /` (signed in) returns `{ v: { tasks, alerts, calendar, people }, unread, at }`, with `Cache-Control: no-store`.
  - Each `v` number only ever goes up. Compare it with the last one you saw; the first answer is only a baseline.
  - `tasks`: a task you can see (or a remark, move or edit on it), or a repeating schedule you set, are on or run the team of, changed. The Super Admin's moves with every task.
  - `alerts`: your bell changed (a new alert, read, cleared).
  - `calendar`: a task on your calendar, or a reminder set by you or aimed at you, changed.
  - `people`: one of your contacts or requests changed, or any team or anyone's public profile (name, title, pin, status, photo).
  - `unread` = your unread alert count (as `GET /api/notifications/unread-count`), so no separate unread poll is needed.
  - `at` = the server's time, for diagnostics.
  - Like the unread count, it first rings any calendar reminders that are due (at most once a minute per server).
- What the apps do: the web polls every 4 s while its tab is visible, the phone every 5 s while in the foreground; both at once on coming back, back off on errors (up to a minute), and pause for 10 minutes on a 404 (an older server).
- How it works (backend/src/platform/live): every write to a watched model bumps per-person counters (`u:<userId>:<topic>`) plus shared ones (`all:tasks` for the Super Admin, `all:people`, `bulk:<topic>` for sweeps such as an account or team being deleted). A request's bumps are written in one `bulkWrite` just before its answer is sent. Writes that touch only bookkeeping (reminder stamps, "last seen", settings, logins) bump nothing.

### Devices `/api/devices` (unchanged)

`POST { token, platform }` and `DELETE { token }`, using Expo push tokens.

### Files `/api/files`

- `POST` multipart `file` returns `{ file: { id, name, mime, size, url } }`. `GET /:id?exp&sig` opens a file through a signed link.
- Task uploads normally go **inside** the multipart task requests (HRMS style, see §3). `/api/files` remains for generic uploads.
- Profile photos are files with `metadata.ref.kind = "avatar"`. They are uploaded only through `PUT /api/me/photo`, never through `POST /api/files`, and cannot be attached to a task.

### Super Admin `/api/platform` (role `superadmin` only)

| Method | Path | Returns |
|---|---|---|
| GET | `/overview` | `{ users, activeWeek, newWeek, disabled, teams, tasks: { total, open, overdue, inReview, completed } }` |
| GET | `/users?q=&status=` | `{ users: [{ ...Me (all fields), stats: { open, given, overdue } }] }`. `q` matches name, pin, email, phone or username. |
| GET | `/users/:id` | `{ user: Me, teams: [{ id, name, role }], contacts: <count>, stats }` |
| PATCH | `/users/:id` | `{ status: "active"|"disabled" }` → `{ user }`. Disabling signs them out. |
| POST | `/users/:id/password` | `{ password }` → `{ ok }`. They must choose a new one at next sign-in. |
| GET | `/teams?q=` | `{ teams: [Team without members, with owner] }` |
| GET | `/teams/:id` | `{ team }` (with members) |
| DELETE | `/teams/:id` | `{ ok }` |

**Console: people, devices, versions and the log.**

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/overview` | | adds `online` (people online now), `onlineDevices`, `signedIn` (people with a live session), `app: { total, app, unknown, web, none, online, builds: [{ platform, appVersion, appBuild, people }] }` (Super Admins not counted) |
| GET | `/users?q=&status=` | | each user also has `online`, `sessions` (live session count), `lastLoginAt` |
| POST | `/users` | `{ name, email?, phone?, username?, title?, password? }` (at least one sign-in identifier) | 201 `{ user: Me, temporaryPassword }`. Made exactly as sign-up makes an account (a Task Pin, the welcome task) with `mustChangePassword: true`. No password = a generated one (`xxxx-xxxx-xxxx`). 409 "An account with this email already exists" (or mobile number / username); 400 for a bad identifier, a password under 8 characters or no identifier at all. |
| GET | `/users/:id` | | adds `online`, `lastLoginAt` (also on `user`), `sessions: [Session]` (live, newest first, ≤20), `app: Session & { state }` (their newest phone, else newest device; `{ state: "none" }` if none), `notifications: { dailyDigest, dailyDigestAt, defaultReminders, approvalDefault, workdayStart, timezone, lang, pushPermission, devices }` (`pushPermission` from their newest phone; `devices` = phones registered for push), `recent: [ActivityRow]` (last 20 done by or to them). A deleted account now answers 404 here and on every `/users/:id/*` route. |
| PATCH | `/users/:id/settings` | any of `{ dailyDigest, dailyDigestAt, defaultReminders }` | `{ settings, notifications }`. Merged like `PATCH /me/settings`; other keys are refused (400). Logged as `admin.settings_changed`. |
| DELETE | `/users/:id` | `{ confirm: "DELETE" }` (or `?confirm=DELETE`) | `{ ok }`. Deletes the account the way self-service does (logins, pin, profile, contacts, team places, devices, alerts, solo tasks; shared work stays as "Deleted user") and ends its sessions. 400 without the confirmation or on yourself; 403 for a Super Admin; 404 if already deleted. |
| POST | `/users/:id/sign-out` | | `{ ok, signedOut: <sessions ended> }`. Signs them out of every device (tokenVersion + every session). Nothing else changes. |
| GET | `/sessions?window=online\|today\|7d` | | `{ window, onlineWindowSeconds: 120, counts: { online, today, week } (people), people, sessions: [Session & { user: Person & { role, self } }] }`, newest first, ≤500. `today` = since midnight in the Super Admin's time zone. |
| POST | `/sessions/:sid/revoke` | | `{ ok }` (also `already: true` when it had ended). Signs that one device out. 400 for the device asking (use `/auth/logout`), 404 unknown. |
| GET | `/app-versions` | | `{ accounts: [Person & { state, platform, appVersion, appBuild, deviceName, osVersion, pushPermission, lastSeenAt, online, sessions, web }], summary }` for every active person. `state`: `app` (a phone that reported its version), `unknown` (an older app that does not say), `web` (web only), `none` (not signed in lately). Whether a build is the latest is for the apps to say: they read `/app/release.json` (same origin as the API on Vercel; the mobile app uses its server address) and compare build numbers (`appBuild` vs `versionCode`). |
| GET | `/activity?q=&group=&user=&from=&to=&before=&limit=` | | `{ items: [ActivityRow], next }`, newest first. `group`: `auth`, `tasks`, `people`, `admin`. `user`: rows done by or to that person. `q`: text in the actor's name, the target, a typed login or a named person. `from`/`to`: `YYYY-MM-DD` (whole days in the Super Admin's time zone) or ISO times. `limit` ≤ 200 (default 50). `next` is the cursor to pass as `before` for the next (older) page, `null` at the end. |
| GET | `/activity/stats` | | `{ today, week, people (distinct people active in 7 days), total }` |
| GET | `/activity/:id` | | `{ entry: ActivityRow, related: [ActivityRow] (≤20 others about the same target), actor: Me & { deleted } \| null, subject: Me & { deleted } \| null }` |

**Session** (as the console shows it):
```json
{ "sid": "…", "platform": "android", "appVersion": "1.0.3", "appBuild": "4", "deviceName": "Google Pixel 7",
  "osVersion": "Android 14", "userAgent": "okhttp/4.12.0", "ip": "…", "pushPermission": "granted",
  "createdAt": "…", "lastSeenAt": "…", "online": true, "current": false, "legacy": false,
  "revokedAt": null, "revokedReason": null }
```

Disabling someone, resetting their password and deleting them also end their sessions; all of it, and team deletion, is logged.

**All tasks.** The Super Admin uses the normal task endpoints:
- `scope=all` lists every task.
- Every `can` flag is true wherever the action makes sense: edit even after acceptance, delete, purge, every status move.
- Creating sends `onBehalfOf: <userId>`. The task is then set by that person, and `onBehalf` records the Super Admin.

### Activity log

One row per thing that happened, kept 180 days:

```json
{ "id": "…", "at": "…", "action": "task.accepted", "group": "auth|tasks|people|admin",
  "actor": "<userId>|null", "actorName": "Asha Rao", "actorRole": "user|superadmin|null",
  "actorPhotoUrl": "/api/files/…|null",
  "target": { "kind": "user|task|team", "id": "…", "label": "TSK-2026-00008 Check delivery schedule" },
  "meta": { …details: fields changed (before/after), the device, a note excerpt… },
  "ip": "…", "platform": "android",
  "summary": "Asha Rao accepted the task “TSK-2026-00008 Check delivery schedule”.",
  "actorLabel": "Asha Rao",
  "badge": { "text": "Accepted", "tone": "good|bad|wait|info|neutral" } }
```

`summary` always starts with `actorLabel` (the actor's name, `KARO` for the system, or `Someone`), so a screen can set it in bold. Sentences are English, like all server text.

Actions recorded:

| Group | Actions | Where |
|---|---|---|
| auth | `auth.login`, `auth.login_failed` (`meta.reason`: `wrong_password`, `no_account`, `disabled`, `invalid`; `meta.identifier` is the account's login when it exists, else kept only in part, e.g. `ra…@example.com`, `…3210`, `pa…`, since people type passwords into the login box), `auth.logout`, `auth.signup`, `auth.password_changed` (`meta.forced` after a reset), `auth.password_forgot`, `auth.password_reset`, `auth.account_deleted` | routes/auth.js |
| people | `profile.updated` (`meta.changes: [{ field, label, before, after }]` for name, title, email, phone), `profile.photo_added`, `profile.photo_changed`, `profile.photo_removed`, `profile.settings_changed` (`meta.fields`: the settings sent) | routes/auth.js, routes/me.js |
| people | `contact.requested`, `contact.accepted`, `contact.declined`, `contact.removed`, `contact.cancelled` | routes/contacts.js |
| people | `team.created`, `team.updated`, `team.invited`, `team.joined`, `team.declined`, `team.left`, `team.member_removed`, `team.role_changed`, `team.transferred`, `team.deleted` | routes/teams.js |
| admin | `admin.user_created`, `admin.user_deleted`, `admin.user_disabled`, `admin.user_enabled`, `admin.password_reset`, `admin.signed_out`, `admin.session_revoked`, `admin.team_deleted`, `admin.settings_changed` | routes/platform.js, routes/teams.js |
| tasks | `task.<kind>` for every task history row (`created`, `status`, `comment`, `edited`, `assigned`, `reminder`, `accepted`, `rejected`, `delegated`, `subtask`, `submitted`, `approved`, `sent_back`, `progress`, `split`, `claimed`, `extension_asked`, `extension_decided`, `transferred`, `nudged`, `overdue`). Target = the task (code + title); actor = the row's author; system rows have no actor ("KARO"). | product/models/TaskUpdate.js (a `post('save')` hook) |

Every row is written before the response is sent (a serverless host may stop afterwards); a row that cannot be written never fails the request. Server code adds one with `await activity.record({ req, action, target?, meta? })` (`platform/services/activity.js`). Never secrets in `meta`.

---

## 3. Task endpoints `/api/tasks/**`: HRMS shapes, with these differences

Everything not listed here behaves exactly as in the HRMS Tasks backend: routes, params, multipart field names (`voice`, `voiceDurationMs`, files as any other field), `can`/capabilities objects, feed rows, counters, board, extension, delegate, transfer, split/claim, nudge, progress, accept/decline, submit/approve/reject, status moves with a mandatory note, recurring patterns, reminders, templates prefill, dashboard, overdue report and export.

**Removed**
- **Points everywhere:** `points`, `distributedPoints`, `effectivePoints`, `pointsAwarded*`, `pointsBudget`, the `points` sort, `defaultPoints`, `pointsArePaid`, and points columns in the dashboard and export.
  - Dashboard "score" becomes count-based: `completion %` = completed / total, `onTime %` = completed in time / completed.
- `kind` / REQUEST and `canRequest`. Everything is a task.
- `company`, `department`, `employeeCode`, `designation`, the `department` filter, and `departments` in `/meta`.
- Legacy routes `/:id/subtasks*`, and `?scope=requests`.
- Server-side translation: no `localise`; typed text is returned as typed.

**Changed**
- **`/meta`:**
  - `people` = the assignable list: `[{ _id, id, name, pin, pinDisplay, relation: "self"|"team"|"contact"|"other", teams: [teamId], canAssign: true, departed: false }]`. `other` only appears for the Super Admin.
  - `team` = `{ direct: [team-mate ids], indirect: [] }`, `hasTeam`.
  - `teams` = `[{ id, name, myRole }]`, the teams you are an active member of.
  - `canAssignOnBehalf` = Super Admin only. `canRecur: true` and `canSetReminders: true` for everyone.
  - `isAdmin` = Super Admin. `canManageCategories` = true (you manage your own and your admin teams' categories).
  - `swipeRemarkRequired: true`; `defaultReminders` from your Settings. Everything else is as HRMS (palettes, statuses, boardColumns, sorts, progressSteps, maxPieces, frequencies, weekdays, reminder vocab, nudgeCooldownMin).
- **Scopes** (`?scope=`):
  - `mine`: assigned to me.
  - `delegated`: set by me.
  - `loop`: I'm in the loop.
  - `team`: tasks filed under a team where I'm owner/admin; `&team=<id>` narrows to one team.
  - `all`: Super Admin only (403 otherwise).
  - `withScopes=1` returns counters for the scopes the caller has.
- **Filters:** `team=<id>` added; `department` removed. Others as HRMS (`category`, `assignedTo`, `assignedBy`, `frequency`, `priority`, `status`, `overdue`, `late`, `moreTime`, `includeSubtasks`, `parentTask`, `q`, `range`, `from`, `to`, `sort`, `dir`, `page`, `limit`).
- **Create** (`POST /`):
  - New optional `team` (a team you're an active member of).
  - Every assignee and loop user must be assignable to you: 400 `"<Name> isn't in your contacts or teams yet. Add them by their Task Pin first."`
  - `onBehalfOf` is Super Admin only.
  - An empty assignee list means a task for yourself (HRMS rule).
- **Visibility:** you can see a task if you are an assignee, setter, approver, loop user, in `openTo`, an original assignee, or owner/admin of the task's `team`. Sub-tasks follow their parent. The Super Admin sees everything. Anyone else gets **404**.
- **Assigner rights** (HRMS `isAssigner` / `tasks.manage`):
  - The setter, the approver, the owner/admin of the task's team, and the Super Admin.
  - **Delete (archive):** the setter, team owner/admin, or Super Admin. **Purge** (`?purge=1`): Super Admin only.
  - **Delegate / transfer / split-assign / openTo targets** must be assignable by the actor, with the same 400 message.
- **Edit conflicts** (`PATCH|PUT /:id`): send optional `baseUpdatedAt`, the task's `updatedAt` when the edit form was filled in. If somebody else has since changed one of the fields this edit changes (an edit; a transfer or delegation counts as changing `assignees`), nothing is saved and the answer is **409** `{ error, code: "EDIT_CONFLICT", message, fields: [field…], by: { id, name } }`, e.g. `"Ravi changed the title and the deadline while you were editing. Look at the latest and save again."`. `by` is the latest of them. Changes to other fields go through and keep theirs. New attachments never clash. Without `baseUpdatedAt` an edit behaves as before (the last save wins). The apps send only the fields changed in the form.
- **Races:** accept, decline, delegate, transfer and status moves each claim the task as it was read. A second press, or somebody else's change in between, gets **409** `"Somebody else changed this task a moment ago. Open it again to see where it is."` (status moves keep their `"Somebody else moved this task a moment ago…"`). A repeated accept or decline answers 200 with the task as it now stands (`unchanged: true` on accept) instead of recording it twice.
- **Categories:**
  - `GET /categories`: yours plus those of your teams.
  - `POST /categories { name, team? }`: personal, or team-wide if you're a team owner/admin.
  - `PATCH/DELETE /categories/:id`: the creator, the team owner/admin, or the Super Admin.
  - Category objects: `{ _id, name, color, team }`.
- **Templates:**
  - `GET /templates` returns `{ mine: [...], team: [{ team: { id, name }, templates: [...] }] }`, in place of the HRMS department directory.
  - `POST /templates` takes optional `team` (team owner/admin) to share a template with a team.
  - `POST /templates/:id/copy` copies a team template to your own.
  - `prefill` is unchanged.
- **Recurring:** open to everyone (no grant). You see schedules you created or are an assignee of; team admins also see those filed under their team; the Super Admin sees all. Only the creator, a team owner/admin of its team, or the Super Admin may edit, pause, delete or run them.
- **Dashboard** `?view=`:
  - `mine`, `delegated`, `category`, `trend` work as HRMS.
  - `people` (renamed from HRMS `employee`): per person, for the people in teams where you're owner/admin, or everyone for the Super Admin.
  - `team=<id>` narrows the view.
  - Rows: `{ person|category|bucket, total, completed, inTime, delayed, open, overdue, inReview, cancelled, completionPct, onTimePct }`.
- **Time zone:** every date calculation (ranges, "today", appear times, digests, reminder windows, export) uses the **viewer's** Settings timezone for requests, and the **task setter's** timezone for background jobs. The HRMS used fixed IST.
- **Codes:** `TSK-YYYY-NNNNN` from a global counter.
- **Files:** stored through the platform GridFS service. Attachment objects keep HRMS fields and also carry `url` (a signed `/api/files/...` link), so clients can open them without a header. `GET /:id/files/:fileId` and `/:id/updates/:updateId/voice` still stream with a session.
- **Emails:** the EMAIL reminder channel sends through SMTP when it is configured, otherwise it falls back to APP.

## 4. Calendar and reminders (the HRMS's, through contacts and teams)

### Reminders `/api/reminders`

A dated reminder on the calendar. `day` is a calendar day (`YYYY-MM-DD`) in the setter's own zone; `time` is free text (`"4:00 PM"`, `"16:00"`, `"after lunch"`).

**Reminder shape:**
```json
{ "id", "title", "notes", "day": "2026-10-09", "time": "16:00", "timeLabel": "4:00 PM", "timed": true,
  "priority": "Low"|"Normal"|"High", "scope": "self"|"users"|"team"|"everyone", "audience": "Specific people",
  "team": { "id", "name" }|null, "recipients": [{ "id", "name" }], "recipientIds": ["…"],
  "setBy": { "id", "name" }, "mine": true, "canEdit": true, "ringAt": "…", "rung": false }
```
`recipients` / `recipientIds` are filled for the setter (and the Super Admin) only. `setBy.name` is `"You"` on your own.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/?month=YYYY-MM&mine=1` | | `{ count, reminders, aim: { users, teams: [{ id, name }], everyone, anyTeam } }`: what you can see (yours, aimed at you, at a team you are in, or at everyone). `aim` is what your form may offer. |
| GET | `/:id` | | `{ reminder }` (404 if you can't see it) |
| POST | `/` | `{ title, date, time?, notes?, priority?, scope?, recipients?, team? }` | 201 `{ reminder, notified }` |
| PUT / PATCH | `/:id` | any of the above | `{ reminder, notified }`: the setter or the Super Admin |
| DELETE | `/:id` | | `{ id, deleted: true }`: the setter or the Super Admin |

**Who a reminder may go to** (checked on every save):
- `self`: anyone.
- `users`: people you may give a task to (contacts and team-mates); 400 with the usual "isn't in your contacts or teams yet" otherwise.
- `team`: a team you own or are an admin of (403 otherwise); every active member sees it.
- `everyone`: the Super Admin only (403 otherwise).

**When it rings.** On its day: at `time` when that reads as a clock time, otherwise at the setter's workday start (Settings). Once, to the setter and everyone it reaches (`⏰ Reminder: …` / `⏰ Reminder today: …`). Set for other people, they are also told the moment it is saved (`Reminder: …`); on an edit, only the people it reaches for the first time are told. A ring missed by more than 6 hours is dropped. Moving the day or time rings it again at the new moment. Rings go out from the 5-minute jobs and, where jobs never run (Vercel), from `GET /api/notifications/unread-count`, at most once a minute.

### Calendar `/api/calendar`

`GET /?month=YYYY-MM` (default: this month, in your zone) → `{ year, month, events, aim }`. Each event is `{ date: "YYYY-MM-DD", day, type, label, meta }`, sorted by day and time:

| `type` | What | `meta` |
|---|---|---|
| `task` | an open task (to do, in progress, in review) on the day it is due | `taskId, code, status, statusLabel, priority, category, assignedTo ("You", "Ravi", "You + 2"), setBy ("You" or a name), mine, given, subtask, at, time ("6:00 PM" or ""), dueAt, overdue` |
| `done` | a completed task on the day it was finished | the same, plus `done, completedAt, late` |
| `reminder` | my own reminder | the reminder shape, plus `reminderId`; `time` is the `timeLabel` |
| `sharedReminder` | a reminder someone else set for me | the same (`canEdit` false unless I am the Super Admin) |

Tasks shown are the ones you are on (and have not declined) or that you set. Archived and cancelled tasks are left out.

## 5. Deep links (both apps)

| Link | Opens |
|---|---|
| `/tasks/<id>` | task detail |
| `/contacts` | contacts and requests |
| `/teams/<id>` | team detail (invites included) |
| `/recurring` | Recurring |
| `/alerts` | Alerts |
| `/calendar?date=YYYY-MM-DD` | the calendar on that day |
