// Build the iPhone app: this same Expo app, exported for the web into the
// website at web/public/iphone/. The website's own build then ships it at
// https://<site>/iphone/, where iPhone users open it in Safari and add it to
// the home screen (Share › Add to Home Screen). It opens full screen, like the
// Android app, and gets notifications through Web Push.
//
//   npm run iphone          (from mobile/)
//
// The export needs `experiments.baseUrl: "/iphone"` so its bundle and assets
// load from /iphone/. That key is written into app.json for the export ONLY
// and the original file is put back byte for byte afterwards (even on
// failure): the Android build must never see it. EXPO_PUBLIC_FOLDER points
// the export at web-public/ (index.html with the home-screen tags, manifest,
// service worker, icons), so no `public/` folder exists for the native build.
// pdf.js (the in-app PDF viewer) is copied from node_modules, renamed .js
// because some hosts serve .mjs with the wrong content type.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const APP_JSON = path.join(ROOT, 'app.json');
const OUT = path.join(ROOT, '..', 'web', 'public', 'iphone');
const BASE_URL = '/iphone';
const PDFJS = path.join(ROOT, 'node_modules', 'pdfjs-dist', 'legacy', 'build');

const original = fs.readFileSync(APP_JSON);
const restore = () => fs.writeFileSync(APP_JSON, original);
['SIGINT', 'SIGTERM'].forEach((sig) =>
  process.on(sig, () => {
    restore();
    process.exit(130);
  })
);

let status = 1;
try {
  const cfg = JSON.parse(original.toString('utf8'));
  cfg.expo.experiments = { ...(cfg.expo.experiments || {}), baseUrl: BASE_URL };
  fs.writeFileSync(APP_JSON, `${JSON.stringify(cfg, null, 2)}\n`);

  fs.rmSync(OUT, { recursive: true, force: true });
  // Relative: with shell on Windows, an absolute path with a space in it
  // ("External App") would split into two arguments.
  const res = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', path.relative(ROOT, OUT), '--clear'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, EXPO_PUBLIC_FOLDER: 'web-public', NODE_ENV: 'production' },
  });
  status = res.status == null ? 1 : res.status;
} finally {
  restore();
}

if (status !== 0) {
  console.error('\nexpo export failed. app.json restored, nothing changed in web/public/iphone.');
  process.exit(status);
}

const pdfDir = path.join(OUT, 'pdfjs');
fs.mkdirSync(pdfDir, { recursive: true });
for (const [from, to] of [
  ['pdf.min.mjs', 'pdf.min.js'],
  ['pdf.worker.min.mjs', 'pdf.worker.min.js'],
]) {
  const src = path.join(PDFJS, from);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(pdfDir, to));
  else console.warn(`! ${src} not found: PDFs will open in a plain frame. Run npm install in mobile/.`);
}

// metadata.json is Expo's, not the site's.
fs.rmSync(path.join(OUT, 'metadata.json'), { force: true });

const size = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(`\niPhone app built: web/public/iphone (${(size(OUT) / 1048576).toFixed(1)} MB)`);
console.log(`It goes live with the website's next deploy, at ${BASE_URL}/index.html`);
