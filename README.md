# Karo

Simple task management for anyone who gives or gets work. Everyone signs up
for themselves and gets a **Task Pin**, a short unique ID like a BlackBerry
BBM PIN (`7KQ4-M9XA`). In Karo, you share your pin, add people as contacts by
theirs, make organizations, and give tasks to your contacts and the people in
your organizations.

All the features of the SSLLP HRMS Tasks module are here (accept/decline,
review, delegate, transfer, more time, sub-tasks, progress, nudges, reminder
patterns, repeating tasks, categories, dashboard, Excel export),
except points, templates and AI translation. Karo has its own database and is **not**
connected to the HRMS.

Karo also has a public **website** with a blog (home, features, use-case
pages, privacy, terms), rendered by the backend and edited by the Super Admin
in the console: see [`docs/WEBSITE.md`](docs/WEBSITE.md).

```
backend/   API + website   Node 20+, Express 5, MongoDB (Mongoose 8)   port 5120
web/       Web app         React 18, Vite 6, Tailwind 3                port 5121
mobile/    Android / iOS   Expo SDK 54 (React Native 0.81)             in.salestracker.taskpro
brand/     Logo and icons (SVG + PNG)
docs/      The website (WEBSITE.md) and Google Play (PLAY_STORE.md)
```

The API contract between the three is [`backend/API.md`](backend/API.md).

## How it works

- **Task Pins.** Eight letters and numbers, with no look-alikes (no 0/O or
  1/I). They are given at sign-up and never change. Typing is forgiving:
  `7kq4 m9xa` works.
- **Contacts, BBM style.** Add someone by pin. They get a request, and once
  they accept, either of you can give the other tasks. Either side can remove
  the contact.
- **Organizations.** A person can be in many organizations, and anyone can
  make one. The owner and admins invite people by Task Pin, or pick them from
  their connections (contacts, and people they share another organization
  with); every invite must be accepted. Roles are Owner, Admin and Member.
  People in an organization can give each other tasks. A task can be filed
  under an organization or left in **General**; the organization's owner and
  admins see its tasks in the **Organization** pile, and other members see
  only the ones they are on. In the API and the code an organization is still
  a *team* (`/api/teams`, `task.team`, `Team`).
- **Organization tabs.** On the Tasks screen, between the pile cards and the
  figures, a row of tabs: **All**, **General** (tasks not filed under any of
  your organizations), then one per organization, each with its open count
  (tinted red when something in it is overdue). Change their order in the
  filter (**Tab order**, with ↑/↓); the first tab is the one Tasks opens on.
  The order is saved with your settings (`orgTabs`), so every device follows
  it. The row is hidden when you are in no organization.
- **Who you can give a task to:** yourself, your contacts and the people in
  your organizations. A task given to someone else arrives as *waiting to be
  accepted*, and they accept or decline it.
- **Tasks:**
  - Several people per task, plus people kept in the loop.
  - Priority Urgent / Medium / Low, due date and time, files, links and a
    voice note.
  - To do → In progress → In review → Done. Every move takes a note.
  - The giver approves or sends back. **Review is off by default**: tick "I
    want to review this before it is marked done" (web) or "You review it
    first" (app) on the task, or turn it on for every new task in Settings.
  - The doer can delegate, ask for more time, set progress, or split the task
    into pieces.
  - The bell nudges at most once every 30 minutes. With a contact who joined
    through a WhatsApp invite link, a WhatsApp button opens a chat with the
    reminder typed in (sent by you, never automatically).
  - There are no task templates (removed in 1.0.7). `GET /api/tasks/templates`
    still answers an empty list, because installed 1.0.6 apps ask for it.
- **Reminders and repeating tasks** run on the server every 5 minutes, using
  each person's own time zone and settings.
- **Calendar** (bottom tab in the app and on a phone-sized web page; sidebar
  on desktop), after the HRMS calendar: your open tasks on the day they are
  due (overdue in red), tasks finished on the day they were finished, and
  your reminders.
- **Calendar reminders**, as in the HRMS: a title, a day, an optional time,
  notes and a priority, for just you, for people you can give tasks to, for a
  whole organization you own or run, or (the Super Admin) for everyone. The
  people they are set for are told at once, and everyone gets an alert on the
  day: at its time, or at their workday start when it has none.
- **Light and dark** on the web (the sun/moon switch in the top bar, or
  Settings → Appearance for System / Light / Dark), in the app (More →
  Appearance) and on the website (it follows the app's choice on that
  browser). Light uses Salesforce's blues and navy. Dark is WhatsApp's dark
  theme (its surfaces, text and dividers) with Karo blue as the accent, so
  green still means Done.
- **The look.** The logo is a white K on a navy squircle whose lower leg is a
  red tick. Every icon file (web favicons, the Android launcher, adaptive,
  themed and notification icons, the splash) comes from
  `node brand/build.mjs`. You can switch light/dark on the sign-in pages too.
- **Profile and photo.** `/profile` on the web and Profile in the app: a
  photo (cropped square on the device, 512 px), name, job title, contact
  details and your Task Pin. Photos show wherever people appear.
- **Swipe a task** (the HRMS's gesture): right to accept, complete or edit,
  left to reject, send back or ask for more time; a swipe with no such move
  opens the status menu. Haptic ticks in the app, a one-time tip and peek.
- **On a desktop** the sidebar folds into a slim rail (the button beside the
  logo, the handle on its edge, or Ctrl/⌘ + B). **On a phone** (the app, and
  the web app at phone width) Tasks looks as the HRMS's does: big pile cards
  (two to a page in the app, with page dots), the organization tabs, then the
  figure grid, three to a row with full labels.
- **The keyboard never hides the field you are typing in.** Screens scroll
  the field into view, and sheets and buttons at the bottom ride up on the
  keyboard: through `react-native-keyboard-controller` on Android, and the
  browser's `visualViewport` in the iPhone app and the web app.
- **The Super Admin** (`SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` in
  `backend/.env`, created on first start) has a console with everyone, every
  organization and **every task**. They can open, edit, delete or create any
  task, on behalf of anyone, and can switch people off or reset their
  password. The console also shows who is online, every signed-in device
  (sign one out, or everyone's), each person's app version against the latest
  build, their notification settings (editable), and an activity log of
  sign-ins, profile, contact, organization, task and website changes (kept 180
  days). The Super Admin can add a person (with a temporary password) and
  delete one, and edits the public website under **Website** (web only).
  **Change that password after the first sign-in on a real server.**

## The website

The public pages (`/`, `/features`, `/for/…`, `/about`, `/contact`,
`/privacy`, `/terms`), the **blog** (`/blog`, with RSS) and `robots.txt` /
`sitemap.xml` are rendered by the backend (`backend/src/site/`) from MongoDB,
on the same address as the app; the stylesheet and two small scripts are in
`web/public/site/`. The Super Admin edits every page (built from sections),
post, picture and setting in the console's **Website** editor
(`web/src/platform/pages/website/`): save a draft, preview it, publish.
Starter pages and three posts are written once on first start. Search engines
are kept out until indexing is switched on for the real domain.

How it fits together, how to edit it, its security rules and how to go live on
`www.karoindia.in`: [`docs/WEBSITE.md`](docs/WEBSITE.md). Its API is
`backend/API.md` §6.

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
the DNS servers in `DNS_SERVERS`. To try something without touching Atlas
even while `MONGO_URI` is set, run `npm run dev:memory` instead (a throwaway
in-memory database; it does not restart on file changes, so restart it after
editing the API).

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5121. `/` is the website (the dev server forwards the
website's paths to the API); the app is at `/sign-in` and `/tasks`. Tests:
`cd backend && npm test`.

## Put it on a server

Same as Seq Book (see `../SeqBook/README.md`):

1. Use a new, empty MongoDB database (not the HRMS one).
2. Set `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production` and `SUPERADMIN_*` in
   `backend/.env`.
3. Build `web/` and either serve it from the API (`WEB_DIST`) or host it
   separately with `VITE_API_URL` + `CORS_ORIGIN`. The website needs the API
   and the app on **one address**: with `WEB_DIST` the API serves both; on
   Vercel `vercel.json` sends `/api/*` and the website's paths to the backend
   and everything else to the web app.

**Run exactly one copy of the API** against a database, or the reminder and
repeating-task jobs run twice. If you scale out, keep the jobs on one instance.

On a host that calls the app per request and never runs `server.js` (Vercel),
the 5-minute jobs do not run. Calendar reminders still ring there: the unread
count both apps poll (`GET /api/notifications/unread-count`) catches up on
any that are due, at most once a minute per instance, and every ring is
claimed so it goes out once. Task reminders, repeating tasks and the daily
summary still need the jobs.

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
`npm run apk` and `npm run publish` in `mobile/` build it and stage it for the
phones' in-app updates: see `web/public/app/README.md`.

**The keyboard handling is native code.** Since 1.0.7 the app uses
`react-native-keyboard-controller` (1.18.5) with `react-native-reanimated`
(~4.1.1) and `react-native-worklets` (0.5.1), so:

- Android phones get it only from a new APK; an over-the-air or iPhone-only
  update can't bring it.
- Always build from a freshly generated `android/` (`npx expo prebuild`, as
  above and in `npm run apk`), never one copied from an older build.
- Reanimated 4 needs the New Architecture (`newArchEnabled`, already on), and
  its Babel plugin comes from `babel-preset-expo` (there is no
  `babel.config.js`).
- Keep `android.softwareKeyboardLayoutMode` at `"resize"` in `app.json`:
  `"pan"` pushes the header off the screen.
- `keyboard.web.js` stands in for it in the iPhone build, so that build has
  no native keyboard code.

### iPhone

There is no App Store build. iPhones run the **same app** as Android,
exported for the web into `web/public/iphone/` and added to the home screen
from Safari (Share › Add to Home Screen, with **Open as Web App** on). It then
opens full screen, without Safari's address bar or toolbar, and gets
notifications through Web Push (iOS 16.4 or later).

```bash
cd mobile
npm run iphone
```

That rebuilds `web/public/iphone/`; commit it and it goes live with the next
website deploy, at `/iphone/index.html`. Run it after any change under
`mobile/` so iPhones get the same app as Android.

- On an iPhone, the web app sends every page to the iPhone app, except
  privacy, account deletion and password reset. Invite and task links open
  inside the app (`?open=`). `?desktop=1` keeps the web app on that phone;
  `?desktop=0` undoes it. See `web/src/platform/iphoneApp.js`. The public
  website stays a website; Add to Home Screen from it installs the app.
- The browser stand-ins for native-only modules (file system, sharing, secure
  store, date picker, dialogs, photos behind a session) are in
  `mobile/src/platform/web/`, swapped in by `mobile/metro.config.js` for the
  web build only; `*.web.js` files beside their native versions (such as
  `ui/keyboard.web.js`) are picked by Metro for the web the same way. The
  Android build is unchanged.
- Push: the app asks once, after sign-in, with a tap (iOS allows nothing
  else). The server signs Web Push with `VAPID_PUBLIC_KEY` and
  `VAPID_PRIVATE_KEY` (optional `VAPID_SUBJECT`, e.g. `mailto:you@example.com`).
  Without them it makes a pair once and keeps it in the database. Changing the
  keys later is safe: each iPhone subscribes again the next time it opens.
- An icon added before this existed, or from Safari with Open as Web App off,
  opens with Safari's bars: delete it and add it again.

## Privacy policy, account deletion and Google Play

- The policy's text lives in `web/src/platform/privacy.js`, copied byte for
  byte to `mobile/src/platform/privacy.js` (edit one, then copy it over the
  other); the app shows it under **More → Privacy policy**.
- On the web, `/privacy` is the **website's** Privacy page, a CMS page first
  written from the same text (`backend/src/site/defaults.js`). When the policy
  changes, change `privacy.js` **and** that page (console → Website → Pages →
  `/privacy`), with the same "Last updated" date.
- People delete their own account under **More → Delete account** (mobile),
  **Settings → Delete account** (web), or at `/delete-account`, which works
  signed out too (Google Play asks for that link).
- Publishing to Google Play and shipping updates:
  [`docs/PLAY_STORE.md`](docs/PLAY_STORE.md).

## Where things are

| | |
|---|---|
| API contract (backend ↔ web ↔ mobile) | `backend/API.md` |
| Shared platform (sign-in, Task Pins, contacts, organizations, alerts, push, files, Super Admin) | `backend/src/platform/`, `web/src/platform/`, `mobile/src/platform/` |
| Who can give work to whom | `backend/src/platform/services/people.js` |
| Organizations (teams in the code): invites, roles, candidates | `backend/src/platform/routes/teams.js`; `web/src/platform/pages/TeamsPage.jsx`, `mobile/src/platform/screens/TeamsScreen.js`, `TeamDetailScreen.js` |
| Organization tabs: the `org` filter and per-tab counts, the saved order | `backend/src/product/services/query.js`, `routes/tasks.js` (`withOrgs`), `routes/meta.js` (`orgTabs`), `backend/src/product/settings.js` |
| Task rules: statuses, moves, reminders vocabulary | `backend/src/product/config.js` |
| Who can do what with a task (the `can` object drives the buttons in both apps) | `backend/src/product/services/access.js`, `engine.js` |
| Reminders, repeating tasks, daily summary | `backend/src/product/services/reminders.js`, `recurrence.js`, started from `startJobs()` in `backend/src/product/jobs.js` |
| Calendar and calendar reminders (who may remind whom, when they ring, the month feed) | `backend/src/product/services/calendar.js`; pages `web/src/product/pages/CalendarPage.jsx`, `mobile/src/product/screens/CalendarScreen.js` |
| Light / dark on the web (colour tokens; the dark washes are worked out in the Tailwind config) | `web/src/index.css`, `web/tailwind.config.js`, `web/src/platform/theme.js`, `ThemeToggle.jsx` |
| Light / dark in the app | `mobile/src/platform/theme.js` |
| Mobile app languages (English, Hindi, Kannada, Tamil, Telugu, Malayalam) | `mobile/src/i18n/` |
| Logo and every icon file | `brand/build.mjs` (writes into `web/public`, `mobile/assets` and `brand/`) |
| Signed-in devices, the activity log and its sentences | `backend/src/platform/services/sessions.js`, `activity.js`, `describe.js` |
| Super Admin console | `web/src/platform/pages/console/`, `mobile/src/platform/screens/admin/` |
| The public website: routes, rendering, sections, Markdown, SEO, starter content | `backend/src/site/` (`public.js`, `render/`, `markdown.js`, `seo.js`, `defaults.js`); `docs/WEBSITE.md` |
| The website's stylesheet and scripts | `web/public/site/` (`site.css`, `boot.js`, `site.js`) |
| The website editor (CMS: pages, blog, media, settings) | `web/src/platform/pages/website/`, API `backend/src/site/admin.js` |
| Keyboard (never hides the field being typed in) | `mobile/src/platform/ui/keyboard.js` (Android), `keyboard.web.js` (iPhone build), used by `Screen.js` and `BottomSheet.js`; web app `web/src/main.jsx` (`--kb-inset`, `--vv-h`) and `web/src/platform/ui/Modal.jsx` |
| Profile and photo | `backend/src/platform/routes/me.js`; `web/src/platform/pages/ProfilePage.jsx`, `mobile/src/platform/screens/ProfileScreen.js` |
| Swiping a task | `web/src/product/components/SwipeRow.jsx`, `mobile/src/product/components/TaskSwipe.js` (moves from `swipeActionsFor` in each app's lifecycle / taskStatus) |
| The folding desktop sidebar | `web/src/platform/Sidebar.jsx` |
| Android releases and in-app updates | `web/public/app/` (the APK and `release.json`), `mobile/scripts/build-apk.js`, `publish-release.js`, `mobile/src/platform/updates.js` |
| Privacy policy | `web/src/platform/privacy.js` = `mobile/src/platform/privacy.js`; on the web, the website's `/privacy` page |
