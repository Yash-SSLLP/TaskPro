# Publishing Karo on Google Play, and shipping updates

This is the whole path, from "it runs on my phone" to "it's on the Play Store",
and then how to ship updates. Steps marked **one time** are done once.

Facts checked October 2026: Expo SDK 54 builds against Android 16 (API 36),
which is what Google Play has required for new apps and updates since
31 August 2026.

---

## 1. Before the first build (one time)

These must be done before an app goes out to the public.

1. **Put the backend and the web app on a real HTTPS server** (see the
   README's "Put it on a server"). Note the address, e.g.
   `https://www.karoindia.in` (the planned domain; going live on it is
   `docs/WEBSITE.md` §5).
2. **Check that these pages open in a browser, signed out.** Play Console
   asks for both links:
   - `https://<your-domain>/privacy`: the privacy policy (the website's
     Privacy page)
   - `https://<your-domain>/delete-account`: delete your account
3. **Check the company name and contact email in the privacy policy.** They
   are at the top of `web/src/platform/privacy.js` (`org`, `email`, and the
   name `app`), and the text is built from them. The current values are
   `Sequence Surface LLP` and `support@sequencesurface.com`. That inbox must
   exist and be read. After any edit, copy the file over
   `mobile/src/platform/privacy.js` so both apps show the same text, and
   make the same change on the website's Privacy page (console → Website →
   Pages → `/privacy`), which is what `/privacy` shows.
4. **Point the app at the live server.** In `mobile/app.json`:
   - `expo.extra.apiUrl` → `https://<your-api-domain>`
   - in the `expo-build-properties` plugin, set `"usesCleartextTraffic": false`
     (the live server is HTTPS, and plain HTTP should be blocked)
5. **Push notifications:** create a Firebase project, add an Android app with
   package `in.salestracker.taskpro`, download `google-services.json` into
   `mobile/`, and add `"googleServicesFile": "./google-services.json"` under
   `expo.android` in `app.json`. Then upload the FCM V1 service-account key to
   Expo (`npx eas-cli@latest credentials` → Android → Push Notifications).
6. **Make a reviewer account.** Google's reviewers can't use the app without
   signing in. Sign up a demo account (e.g. `playreview@<your-domain>`), add a
   couple of tasks to it, and keep the login for step 4.3.

> The package name `in.salestracker.taskpro` **can never change** once
> uploaded to Play. Make sure it's the one you want.

---

## 2. Google Play developer account (one time)

1. Go to <https://play.google.com/console/signup> and pay the one-time US$25 fee.
2. **Choose an Organization account** (as Sequence Surface LLP). You will need
   a D-U-N-S number for the LLP, which is free from Dun & Bradstreet but can
   take a few days.
   - A **personal** account created after November 2023 must first run a
     **closed test with at least 12 testers, opted in for 14 days in a row**,
     before it can publish to production. Organization accounts don't have
     this rule.
3. Complete identity verification and add a developer contact email.

---

## 3. Build the release (.aab) with EAS

Google Play takes an **Android App Bundle (`.aab`)**, not an APK. The easiest
route is Expo's cloud build (EAS). It works from Windows, and it avoids this
PC's Java and long-path problems. `mobile/eas.json` is already set up.

**One time:**

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
```

`init` links the app to an Expo project and writes `extra.eas.projectId` into
`app.json`. Commit that change.

**Every release build:**

```bash
npx eas-cli@latest build --platform android --profile production
```

- On the first build, say **yes** when it offers to generate a keystore. EAS
  keeps this "upload key" safe in your Expo account. Google re-signs the app
  with its own key (Play App Signing), so a lost upload key can be reset.
- `versionCode` goes up by itself on every production build
  (`appVersionSource: remote` + `autoIncrement`).
- When it finishes, download the `.aab` from the link it prints.

For a test APK you can install directly on phones:
`npx eas-cli@latest build -p android --profile preview`.

<details>
<summary>Building locally instead (no EAS)</summary>

Follow the README's local build steps, but build a bundle:
`gradlew.bat bundleRelease`. You also need your own upload keystore
(`keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`),
wired into `android/app/build.gradle`. `expo prebuild` regenerates the
`android/` folder and wipes that wiring, so you have to redo it on every
prebuild. **Back up `upload.jks` and its passwords.** EAS is much less work.
</details>

---

## 4. Create the app in Play Console (one time)

1. **Create app** → name `Karo`, default language English, App, Free.
   Accept the declarations.

2. **Store listing** (Grow → Store presence → Main store listing):
   - Short description (max 80 characters): *In Karo, you give and get tasks by Task Pin. Organizations, reminders, reviews.* (79 characters)
   - Full description (max 4000 characters), in the same voice ("In Karo, you …"). The README's "How it works" and the website's Features page are a good start. Say only what Karo does: no templates, and WhatsApp is a one-tap nudge the person sends, not automatic messages.
   - App icon 512×512 PNG (`brand/icon.png`, resized), feature graphic
     1024×500, at least 2 phone screenshots (take them from the app).
   - Category: Productivity. Contact email: same as the privacy policy.

3. **App content** (Policy → App content). Fill in every item:

   | Item | Answer |
   |---|---|
   | Privacy policy | `https://<your-domain>/privacy` |
   | App access | "All or some functionality is restricted" → give the reviewer login from step 1.6 |
   | Ads | No ads |
   | Content rating | Fill the questionnaire (Utility/Productivity; no violence etc.) → usually "Everyone" / "3+" |
   | Target audience | 18 and over (matches the privacy policy) |
   | Data safety | See section 7 below |
   | Account deletion | Yes, users can create accounts → URL `https://<your-domain>/delete-account` (in-app: More → Delete account) |
   | Government app / Financial features / Health | No / None / No |
   | News app | No |

4. **Testing → Internal testing → Create release.** Upload the `.aab` here
   first. Google requires the very first upload to be made by hand in the
   console. Add yourself and your team as testers (by email list), save, and
   roll out. Testers get an opt-in link and install the app from Play.

5. (Personal accounts only) **Closed testing** with 12+ testers for 14 days,
   then apply for production access from the Dashboard.

6. **Production → Create release**: promote the tested build ("Add from
   library"), write release notes, choose countries (e.g. India), and send
   for review. A first review usually takes a few days, sometimes up to a week
   or more.

---

## 5. Shipping updates

There are three kinds of update. Pick by **what changed**.

### A. Server or website changes → just deploy

Changes only in `backend/` or `web/` (bug fixes, new API fields, new web
pages): deploy the server as usual. **No store release needed.** Old app
versions stay on people's phones for months, so never remove or rename an API
field the app uses. Add new ones instead.

### B. App code changes (JavaScript only) → over-the-air update, minutes

Changes only in `mobile/src/` (screens, text, translations, bug fixes) can
reach phones without Play review, using **EAS Update**.

**One time** (then do one store release so phones have the update client):

```bash
cd mobile
npx expo install expo-updates
npx eas-cli@latest update:configure
```

In `app.json`, set `"runtimeVersion": { "policy": "appVersion" }`. Then build
and release once as in section 5C.

**Every OTA update:**

```bash
npx eas-cli@latest update --channel production --message "Fix due-date label"
```

Phones download it in the background and use it on the next launch.
To undo a bad update: `npx eas-cli@latest update:rollback` (or republish the previous one from expo.dev).
Rules: an OTA update may only change JavaScript and images, and must not
change what the app is for (Google Play policy).

### C. Native or config changes → store release

You **must** go through Play when you:
- add or upgrade a package with native code (`npx expo install …`), or upgrade the Expo SDK
- change `app.json` (permissions, icon, splash, plugins, package settings)
- want everyone on a new `version` number

Steps:

1. Bump `"version"` in `mobile/app.json` (e.g. `1.0.0` → `1.1.0`). With
   `runtimeVersion: appVersion`, this also separates the new build's OTA
   updates from the old one's.
2. Build: `npx eas-cli@latest build -p android --profile production`
   (`versionCode` goes up by itself).
3. Upload: either drag the `.aab` into Play Console, or let EAS do it:
   `npx eas-cli@latest submit -p android --latest`
   (for `submit` you first create a Google Cloud service account with Play
   Console access and give EAS its JSON key once; see
   <https://docs.expo.dev/submit/android/>). It lands as a draft on the
   **internal** track (`eas.json → submit`).
4. Test it from internal testing, then in Play Console **promote** the
   release to Production. Use a **staged rollout** (e.g. 20% → 50% → 100%)
   so you can stop it if something breaks.
5. Write "What's new" notes. Reviews of updates are usually faster than the first one.

### Quick reference

| What changed | What to do | Reaches users in |
|---|---|---|
| `backend/`, `web/` | Deploy the server | Immediately |
| `mobile/src/` only | `eas update --channel production` | Minutes (next app launch) |
| `app.json`, native packages, Expo SDK | Bump `version` → `eas build` → `eas submit` → promote in Play Console | Hours to days (Play review) |

---

## 6. Rules to keep after launch

- Each year Google raises the required target API level (new apps and updates
  must target the latest Android within about a year of its release). Upgrade
  the Expo SDK at least once a year to keep up.
- Keep the privacy policy true: if you add analytics, crash reporting, ads,
  location, or a new third-party service, update `privacy.js` (both copies),
  the website's Privacy page, the "Last updated" date, and the Data safety
  form **before** releasing.
- If a new feature needs a new permission, add it to `app.json` and explain it
  in the policy's "Phone permissions" section.

---

## 7. Data safety form answers

Based on what the app actually does (see the privacy policy). Overall answers:
**Collects data: Yes. Shares data: No** (hosting, push and email providers act
for us, which Google does not count as sharing). **Encrypted in transit: Yes**
(needs the HTTPS server). **Users can request deletion: Yes.**

| Data type | Collected | Required? | Purpose |
|---|---|---|---|
| Personal info → Name | Yes | Required | App functionality, Account management |
| Personal info → Email address | Yes | Optional (email *or* phone) | Account management, App functionality |
| Personal info → Phone number | Yes | Optional (email *or* phone) | Account management, App functionality |
| Photos and videos → Photos, Videos | Yes | Optional | App functionality |
| Audio → Voice or sound recordings | Yes | Optional | App functionality |
| Files and docs | Yes | Optional | App functionality |
| Messages → Other in-app messages (task notes and comments) | Yes | Optional | App functionality |
| App activity → Other user-generated content (tasks) | Yes | Required | App functionality |
| Device or other IDs (push token) | Yes | Optional | App functionality |
| Location, Contacts (phone address book), Financial info, Health, Web history, Calendar, App info & performance | **No** | | |

Data is processed in real time and stored on the server. Nothing is
collected only temporarily ("ephemeral" = No).
