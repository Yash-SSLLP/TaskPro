# web/public/app: the released Android build

The APK in this folder **is** the release. Vite copies `public/` into the web
build, so on Vercel these are plain static files served from the CDN at
`https://<site>/app/…`. There is no upload step and no database row:
publishing an update to every phone is a commit and a push.

```
npm run apk  ->  npm run publish -- --publish  ->  commit + push  ->  Vercel deploys  ->  phones see it
```

(both commands run in `mobile/`)

## What's here

| File | What it is |
|---|---|
| `taskpro-<versionName>-<versionCode>.apk` | the newest build. Exactly one; the publish script removes the old one |
| `release.json` | `{ versionName, versionCode, fileName, size, notes, publishedAt }` |

## Who reads it

- **The Android app**: on every launch, when it returns to the foreground (at
  most every 6 hours), and from **More → App updates**, it reads
  `/app/release.json` from its server address. When `versionCode` is
  **higher** than the installed build it offers the update, downloads the APK
  and opens Android's installer.
- **The web app**: **Settings → Android app**, the sidebar's *Get the Android
  app*, and the public page **`/get-app`** (the link to send a new user) show
  the version, a QR code and the download link.

## Releasing a new version

1. In `mobile/app.json` raise `version` (e.g. `1.0.2`) **and**
   `android.versionCode` (e.g. `3`). Phones compare `versionCode`.
2. `npm run apk` in `mobile/`: regenerates `android/` and builds the release APK.
3. `npm run publish` (dry run), then
   `npm run publish -- --publish --notes "What changed"`.
4. `git add web/public/app mobile/app.json && git commit -m "app 1.0.2" && git push`.

## Signing

Android installs an update over an installed app only when both are signed
with the **same key**. Every build here is signed with the template's
`android/app/debug.keystore` (regenerated identically by `expo prebuild`), as
was 1.0.0, so updates install in place. Switching to a new key later means
every phone has to uninstall once and install fresh.
