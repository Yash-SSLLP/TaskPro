// Stage the built APK in web/public/app, which the web app serves at /app/:
// the in-app updater reads /app/release.json and the web's "Android app" page
// links the APK beside it.
//
//   npm run apk                                  # build android/…/app-release.apk
//   npm run publish                              # dry run: checks everything, changes nothing
//   npm run publish -- --publish --notes "Faster task list"
//
// Then commit and push; Vercel deploys and every phone is offered the build:
//
//   git add web/public/app && git commit -m "app 1.0.2" && git push
//
// Every check below is a way a release goes wrong SILENTLY, reaching nobody:
//   • the APK on disk can predate the version bump (yesterday's build under
//     today's number). Gradle's output-metadata.json says what it really is.
//   • a versionCode not higher than the published one is offered to nobody,
//     and Android refuses to install a lower code over a higher one.
const fs = require('fs');
const path = require('path');

const PUBLISH = process.argv.includes('--publish');
const notesAt = process.argv.indexOf('--notes');
const NOTES = notesAt > -1 ? String(process.argv[notesAt + 1] || '').trim() : '';

const ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, '..', 'web', 'public', 'app');
const OUT_DIR = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release');
const APK = path.join(OUT_DIR, 'app-release.apk');
// Builds up to 1.0.6 are taskpro-…, newer ones karo-…: both count as
// published, so the first karo- build replaces the last taskpro- one.
const APK_RE = /^(?:taskpro|karo)-(\d+\.\d+\.\d+)-(\d+)\.apk$/i;

const problems = [];
const fail = (m) => problems.push(m);
const ok = (m) => console.log(`  ok    ${m}`);

// ----- what the source says -----
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
const VERSION = app.version;
const CODE = Number(app.android && app.android.versionCode);
console.log(`\n  version  ${VERSION}  (versionCode ${CODE})\n`);

// ----- what the APK actually is -----
if (!fs.existsSync(APK)) {
  fail(`No APK at ${APK}\n        Build one first:  npm run apk`);
} else {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'output-metadata.json'), 'utf8'));
    const el = (meta.elements || [])[0] || {};
    if (Number(el.versionCode) !== CODE || el.versionName !== VERSION) {
      fail(`The built APK is ${el.versionName} / ${el.versionCode}, not ${VERSION} / ${CODE}. Rebuild: npm run apk`);
    } else ok(`APK is ${VERSION} / ${CODE}`);
  } catch {
    console.log('  warn  could not read output-metadata.json, APK version not verified');
  }
  const ageMin = Math.round((Date.now() - fs.statSync(APK).mtimeMs) / 60000);
  ok(`APK ${(fs.statSync(APK).size / 1048576).toFixed(1)} MB, built ${ageMin} min ago`);
  if (ageMin > 60) console.log('  warn  that build is over an hour old: make sure it has your latest changes');
}

// ----- what's already published -----
fs.mkdirSync(RELEASE_DIR, { recursive: true });
const existing = fs.readdirSync(RELEASE_DIR).filter((n) => APK_RE.test(n));
const publishedCode = Math.max(0, ...existing.map((n) => Number(APK_RE.exec(n)[2])));
if (publishedCode && CODE <= publishedCode) {
  fail(`versionCode ${CODE} is not higher than the published ${publishedCode}. Phones would ignore it: bump "version" and "android.versionCode" in app.json and rebuild.`);
} else ok(publishedCode ? `newer than the published build (${publishedCode})` : 'first build in web/public/app');

if (problems.length) {
  console.error('\n✗ Not publishing:\n');
  problems.forEach((p) => console.error('  • ' + p));
  console.error('');
  process.exit(1);
}

// Installed apps download whatever release.json names, so the name is free
// to change; it is what people see in their downloads.
const fileName = `karo-${VERSION}-${CODE}.apk`;
if (!PUBLISH) {
  console.log(`\n  Dry run: all checks pass. Would put web/public/app/${fileName}`);
  if (existing.length) console.log(`  and remove ${existing.join(', ')}`);
  console.log('\n  Run again with --publish (and optionally --notes "what changed").\n');
  process.exit(0);
}

// ----- stage it -----
// Exactly ONE build in the folder: every APK committed stays in git history,
// and phones are only ever offered the newest.
fs.copyFileSync(APK, path.join(RELEASE_DIR, fileName));
for (const old of existing) if (old !== fileName) fs.rmSync(path.join(RELEASE_DIR, old), { force: true });
fs.writeFileSync(
  path.join(RELEASE_DIR, 'release.json'),
  JSON.stringify(
    {
      versionName: VERSION,
      versionCode: CODE,
      fileName,
      size: fs.statSync(path.join(RELEASE_DIR, fileName)).size,
      notes: NOTES || `${app.name} ${VERSION}`,
      publishedAt: new Date().toISOString(),
    },
    null,
    2
  ) + '\n'
);

console.log(`
✓ Staged web/public/app/${fileName}

  Now commit and push. Phones see it as soon as Vercel has deployed:

    git add web/public/app && git commit -m "app ${VERSION}" && git push
`);
