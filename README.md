# Task Pro

Simple task management for anyone who gives or gets work. Everyone signs up
for themselves and gets a **Task Pin**, a short unique ID like a BlackBerry
BBM PIN (`7KQ4-M9XA`). Share your pin, add people as contacts by theirs, make
teams, and give tasks to your contacts and team-mates.

All the features of the SSLLP HRMS Tasks module are here (accept/decline,
review, delegate, transfer, more time, sub-tasks, progress, nudges, reminder
patterns, repeating tasks, templates, categories, dashboard, Excel export),
except points and AI translation. Task Pro has its own database and is **not**
connected to the HRMS.

```
backend/   API             Node 20+, Express 5, MongoDB (Mongoose 8)   port 5120
web/       Web app         React 18, Vite 6, Tailwind 3                port 5121
mobile/    Android / iOS   Expo SDK 54 (React Native 0.81)             in.salestracker.taskpro
brand/     Logo and icons (SVG + PNG)
```

The API contract between the three is [`backend/API.md`](backend/API.md).

## How it works

- **Task Pins.** Eight letters and numbers, with no look-alikes (no 0/O or
  1/I). They are given at sign-up and never change. Typing is forgiving:
  `7kq4 m9xa` works.
- **Contacts, BBM style.** Add someone by pin. They get a request, and once
  they accept, either of you can give the other tasks. Either side can remove
  the contact.
- **Teams.** Anyone can create a team and invite people by pin; invites must
  be accepted. Roles are Owner, Admin and Member. Team-mates can give each
  other tasks. A task can be filed under a team, and the team's owner and
  admins see those tasks in a **Team** pile.
- **Who you can give a task to:** yourself, your contacts and your
  team-mates. A task given to someone else arrives as *waiting to be
  accepted*, and they accept or decline it.
- **Tasks:**
  - Several people per task, plus people kept in the loop.
  - Priority Urgent / Medium / Low, due date and time, files, links and a
    voice note.
  - To do → In progress → In review → Done. Every move takes a note.
  - The giver approves or sends back.
  - The doer can delegate, ask for more time, set progress, or split the task
    into pieces.
  - The bell nudges at most once every 30 minutes.
- **Reminders and repeating tasks** run on the server every 5 minutes, using
  each person's own time zone and settings.
- **The Super Admin** (`SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` in
  `backend/.env`, created on first start) has a console with everyone, every
  team and **every task**. They can open, edit, delete or create any task, on
  behalf of anyone, and can switch people off or reset their password.
  **Change that password after the first sign-in on a real server.**

## Run it on your computer

```bash
cd backend
npm install
npm run dev
```

With `MONGO_URI` empty, the API starts a temporary in-memory MongoDB. It is
good for trying things out, and everything is lost when it stops. With
`MONGO_URI` set (as now), it uses the `taskpro_v2` database on MongoDB Atlas. If
this PC can't look up the `mongodb+srv` address itself, the API falls back to
the DNS servers in `DNS_SERVERS`.

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5121. Tests: `cd backend && npm test`.

## Put it on a server

Same as Seq Book (see `../SeqBook/README.md`):

1. Use a new, empty MongoDB database (not the HRMS one).
2. Set `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production` and `SUPERADMIN_*` in
   `backend/.env`.
3. Build `web/` and either serve it from the API (`WEB_DIST`) or host it
   separately with `VITE_API_URL` + `CORS_ORIGIN`.

**Run exactly one copy of the API** against a database, or the reminder and
repeating-task jobs run twice. If you scale out, keep the jobs on one instance.

## The mobile app

Identical setup to Seq Book's: `expo.extra.apiUrl` in `mobile/app.json` (testers
can change it under **Server settings** on the sign-in screen), and push needs
an Expo project plus Firebase `google-services.json` for
`in.salestracker.taskpro`.

The Android build needs **Java 17 or newer**. This PC's `JAVA_HOME` points to
JDK 16, so point it at Android Studio's bundled JDK for the build. Also build
from a **short folder with no spaces** (for example `F:\apkb\app`): React
Native's native build fails on Windows with long paths or spaces
(`build.ninja still dirty`), and `External App` has a space. Copy `mobile/`
there without `node_modules` and `android`, then (Command Prompt):

```bat
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
cd /d F:\apkb\app
npm install
npx expo prebuild --platform android
cd android
gradlew.bat assembleRelease
```

The APK is written to `android\app\build\outputs\apk\release\` inside that folder.

## Where things are

| | |
|---|---|
| API contract (backend ↔ web ↔ mobile) | `backend/API.md` |
| Shared platform (sign-in, Task Pins, contacts, teams, alerts, push, files, Super Admin) | `backend/src/platform/`, `web/src/platform/`, `mobile/src/platform/` |
| Who can give work to whom | `backend/src/platform/services/people.js` |
| Task rules: statuses, moves, reminders vocabulary | `backend/src/product/config.js` |
| Who can do what with a task (the `can` object drives the buttons in both apps) | `backend/src/product/services/access.js`, `engine.js` |
| Reminders, repeating tasks, daily summary | `backend/src/product/services/reminders.js`, `recurrence.js`, started from `startJobs()` in `backend/src/product/jobs.js` |
| Mobile app languages (English, Hindi, Kannada, Tamil, Telugu, Malayalam) | `mobile/src/i18n/` |
