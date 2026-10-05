# Task Pro API contract (v2: Task Pins)

This is the contract between the backend, the web app and the mobile app. **Base URL `/api`.**
- Every request except sign-up, login and password reset sends `Authorization: Bearer <token>`.
- Errors are always `{ error: "message for the person", code?: "MACHINE_CODE" }` with a 4xx/5xx status.

**Two conventions, on purpose:**
- **Platform endpoints** (auth, contacts, teams, people, alerts, devices, files, the Super Admin console) use Task Pro's style: objects carry `id`.
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
  "mustChangePassword": false, "lastSeenAt": "…", "createdAt": "…" }
```

**Person** (anyone else; never includes logins):
```json
{ "id": "…", "pin": "7KQ4M9XA", "pinDisplay": "7KQ4-M9XA", "name": "Ravi", "title": "Accounts", "status": "active" }
```

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
  "product": { "key": "taskpro", "name": "Task Pro" } }
```

### Auth `/api/auth`

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/signup` | `{ name, identifier, password }` (identifier = email or mobile) | 201 session payload. `user.pin` is the new pin. |
| POST | `/login` | `{ identifier, password }` (email, mobile or username) | session payload. 401 `BAD_CREDENTIALS`, 403 `USER_DISABLED` |
| GET | `/me` | | session payload (plus a fresh `token` at most daily) |
| PATCH | `/profile` | `{ name?, title?, email?, phone? }` | `{ user: Me }` |
| POST | `/change-password` | `{ currentPassword?, newPassword }` | `{ token, user }` |
| POST | `/forgot-password` | `{ identifier }` | `{ ok, emailEnabled, message }` |
| POST | `/reset-password` | `{ token, newPassword }` | `{ ok }` |

`403 PASSWORD_CHANGE_REQUIRED` is returned on anything but `/auth/me`, `/auth/change-password` and `/devices` while `mustChangePassword` is set, for example after a Super Admin reset.

### Settings `/api/me`

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/settings` | | `{ settings }` |
| PATCH | `/settings` | any subset of Settings | `{ settings }` (400 on bad values) |

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
  - `info`
- The web app routes to the same paths. The mobile app maps them to screens.

### Devices `/api/devices` (unchanged)

`POST { token, platform }` and `DELETE { token }`, using Expo push tokens.

### Files `/api/files` (unchanged)

- `POST` multipart `file` returns `{ file: { id, name, mime, size, url } }`. `GET /:id?exp&sig` opens a file through a signed link.
- Task uploads normally go **inside** the multipart task requests (HRMS style, see §3). `/api/files` remains for generic uploads.

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

**All tasks.** The Super Admin uses the normal task endpoints:
- `scope=all` lists every task.
- Every `can` flag is true wherever the action makes sense: edit even after acceptance, delete, purge, every status move.
- Creating sends `onBehalfOf: <userId>`. The task is then set by that person, and `onBehalf` records the Super Admin.

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

## 4. Deep links (both apps)

| Link | Opens |
|---|---|
| `/tasks/<id>` | task detail |
| `/contacts` | contacts and requests |
| `/teams/<id>` | team detail (invites included) |
| `/recurring` | Recurring |
| `/alerts` | Alerts |
