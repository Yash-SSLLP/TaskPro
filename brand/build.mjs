// KARO's mark, and every icon file the apps ship, from one place.
//
//   node brand/build.mjs
//
// The mark: a K whose lower leg is a tick. The stem and the arm are one
// colour; the leg grows out of the stem's edge in red, dips into the tick's
// vertex and sweeps up parallel to the arm, thinning to a point. A clean gap
// is cut where the tick passes under the arm. White on a Salesforce-navy tile;
// navy on the light splash.
//
// SVGs are written straight into the apps. PNGs are rendered by a headless
// Edge or Chrome (a throwaway profile under brand/.render), transparent where
// the SVG is. Android's launcher icons, splash and notification icon are
// generated from mobile/assets by `expo prebuild` (npm run apk).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(ROOT, 'brand', '.render');

// ---------------------------------------------------------------- geometry (1024 canvas)

// W the stroke; top/bot the K's height; sx the stem's centre; armY and legY
// where the arm's and the tick's centre lines meet the stem's right edge; ang
// the arm's angle (the tick's long stroke matches it); legAng the short leg's
// angle down and leg its length; tipY the tick's tip height; tick the tick's
// widths at its start, vertex and tip; gap the cut between arm and tick.
const G = { W: 96, top: 250, bot: 774, sx: 300, armY: 540, legY: 622, ang: 46, legAng: 42, leg: 205, tipY: 300, tick: [96, 102, 40], gap: 20 };

const NAVY = '#032D60';
const WHITE = '#FFFFFF';
const RED = ['#E3001B', '#FF4A3D'];

const f = (n) => n.toFixed(1);
const rad = (d) => (d * Math.PI) / 180;

/** A stroke from a to b as a quad, wa wide at a and wb at b. */
function quad(a, b, wa, wb) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  const nx = -dy / L;
  const ny = dx / L;
  return `M${f(a[0] + (nx * wa) / 2)},${f(a[1] + (ny * wa) / 2)}L${f(b[0] + (nx * wb) / 2)},${f(b[1] + (ny * wb) / 2)}L${f(b[0] - (nx * wb) / 2)},${f(b[1] - (ny * wb) / 2)}L${f(a[0] - (nx * wa) / 2)},${f(a[1] - (ny * wa) / 2)}Z`;
}
const dot = (p, w) => `M${f(p[0] - w / 2)},${f(p[1])}a${w / 2},${w / 2} 0 1 0 ${w},0a${w / 2},${w / 2} 0 1 0 -${w},0Z`;

/** A superellipse ("squircle") filling size×size, as an SVG path. */
function squircle(size, n = 5, inset = 0) {
  const a = size / 2 - inset;
  const c = size / 2;
  const pts = [];
  for (let i = 0; i < 360; i += 2) {
    const t = (i / 360) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    pts.push(`${(c + a * Math.sign(ct) * Math.abs(ct) ** (2 / n)).toFixed(1)},${(c + a * Math.sign(st) * Math.abs(st) ** (2 / n)).toFixed(1)}`);
  }
  return `M${pts[0]}L${pts.slice(1).join('L')}Z`;
}

// The pieces, worked out once.
const R = G.sx + G.W / 2; // the stem's right edge
const A = rad(G.ang);
const LA = rad(G.legAng);
const ARM = quad([R - 120 * Math.cos(A), G.armY + 120 * Math.sin(A)], [R + (G.armY - G.top + 80) / Math.tan(A), G.top - 80], G.W, G.W);
const V = [R + G.leg * Math.cos(LA), G.legY + G.leg * Math.sin(LA)];
const TIP = [V[0] + (V[1] - G.tipY) / Math.tan(A), G.tipY];
const TICK = [quad([R - 60, G.legY - 60 * Math.tan(LA)], V, G.tick[0], G.tick[1]), quad(V, TIP, G.tick[1], G.tick[2]), dot(V, G.tick[1]), dot(TIP, G.tick[2])].join('');
// The mark's box, for centring it on the canvas.
const BOX = { left: G.sx - G.W / 2, right: TIP[0] + G.tick[2] / 2, top: G.top, bottom: Math.max(G.bot, V[1] + G.tick[1] / 2) };
const CENTRE = [(BOX.left + BOX.right) / 2, (BOX.top + BOX.bottom) / 2];

/**
 * One SVG of the mark.
 *   bg     'squircle' (the tile), 'square' (full bleed), or 'none'
 *   glyph  the K's colour
 *   check  'accent' (the red gradient) or a flat colour
 *   scale  the mark's size about the canvas centre
 */
function build({ bg = 'squircle', glyph = WHITE, check = 'accent', scale = 0.98, rim = true }) {
  const t = `translate(512 512) scale(${scale}) translate(${f(-CENTRE[0])} ${f(-CENTRE[1])})`;
  const checkPaint = check === 'accent' ? 'url(#check)' : check;
  const tile =
    bg === 'none'
      ? ''
      : bg === 'square'
        ? '<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#sheen)"/>'
        : `<path d="${squircle(1024)}" fill="url(#bg)"/><path d="${squircle(1024)}" fill="url(#sheen)"/>${
            rim ? `<path d="${squircle(1024, 5, 2.5)}" fill="none" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="3"/>` : ''
          }`;
  const mark =
    scale > 0
      ? `<g transform="${t}">
<g clip-path="url(#k)" fill="${glyph}"><rect x="${BOX.left}" y="${G.top}" width="${G.W}" height="${G.bot - G.top}"/><path mask="url(#cut)" d="${ARM}"/></g>
<path clip-path="url(#leg)" d="${TICK}" fill="${checkPaint}"/>
</g>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1024" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0B4A92"/><stop offset=".55" stop-color="${NAVY}"/><stop offset="1" stop-color="#001639"/></linearGradient>
<radialGradient id="sheen" cx="300" cy="80" r="760" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="check" x1="${f(R)}" y1="${f(V[1])}" x2="${f(TIP[0])}" y2="${f(TIP[1])}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${RED[0]}"/><stop offset="1" stop-color="${RED[1]}"/></linearGradient>
<clipPath id="k"><rect x="${BOX.left}" y="${G.top}" width="1024" height="${G.bot - G.top}"/></clipPath>
<clipPath id="leg"><rect x="${f(R)}" y="0" width="1024" height="1024"/></clipPath>
<mask id="cut" maskUnits="userSpaceOnUse" x="-512" y="-512" width="2048" height="2048"><rect x="-512" y="-512" width="2048" height="2048" fill="#fff"/><path d="${TICK}" fill="#000" stroke="#000" stroke-width="${G.gap * 2}" stroke-linejoin="round" clip-path="url(#leg)"/></mask>
</defs>
${tile}
${mark}
</svg>
`;
}

// ---------------------------------------------------------------- what ships where

const SVGS = {
  tile: build({}),
  square: build({ bg: 'square', rim: false }),
  adaptiveFg: build({ bg: 'none', scale: 0.64 }),
  adaptiveBg: build({ bg: 'square', rim: false, scale: 0 }),
  adaptiveMono: build({ bg: 'none', scale: 0.64, check: WHITE }),
  splashLight: build({ bg: 'none', scale: 1.2, glyph: NAVY }),
  splashDark: build({ bg: 'none', scale: 1.2 }),
  notification: build({ bg: 'none', scale: 1.3, check: WHITE }),
};

// [svg, file, size]: the web's tile is the SVG itself; the rest are rendered.
const PNGS = [
  ['tile', 'web/public/favicon.png', 64],
  ['square', 'web/public/apple-touch-icon.png', 180],
  ['square', 'mobile/assets/icon.png', 1024],
  ['adaptiveFg', 'mobile/assets/adaptive-icon.png', 1024],
  ['adaptiveBg', 'mobile/assets/adaptive-icon-bg.png', 1024],
  ['adaptiveMono', 'mobile/assets/adaptive-icon-mono.png', 1024],
  ['tile', 'mobile/assets/logo.png', 512],
  ['splashLight', 'mobile/assets/splash-light.png', 768],
  ['splashDark', 'mobile/assets/splash-dark.png', 768],
  ['notification', 'mobile/assets/notification-icon.png', 96],
  ['tile', 'mobile/assets/favicon.png', 48],
];

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function browser() {
  const found = [
    process.env.BROWSER_BIN,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('No Edge or Chrome found: set BROWSER_BIN to render the PNGs.');
  return found;
}

fs.writeFileSync(path.join(ROOT, 'web/public/logo.svg'), SVGS.tile);
// The bare mark, white on transparent: the sign-in panel's watermark.
fs.writeFileSync(path.join(ROOT, 'web/public/mark.svg'), SVGS.splashDark);
fs.writeFileSync(path.join(ROOT, 'brand/logo.svg'), SVGS.tile);
fs.writeFileSync(path.join(ROOT, 'brand/mark-light.svg'), SVGS.splashLight);
fs.writeFileSync(path.join(ROOT, 'brand/mark-dark.svg'), SVGS.splashDark);
console.log('✓ web/public/logo.svg, brand/*.svg');

fs.mkdirSync(WORK, { recursive: true });
const bin = browser();
for (const [key, file, size] of PNGS) {
  const svg = path.join(WORK, `${key}.svg`);
  fs.writeFileSync(svg, SVGS[key]);
  const html = path.join(WORK, `${key}-${size}.html`);
  fs.writeFileSync(
    html,
    `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}img{display:block;width:${size}px;height:${size}px}</style></head><body><img src="${key}.svg"></body></html>`
  );
  const out = path.join(ROOT, file);
  // Headless Edge now and then exits without writing the screenshot, so the
  // old file goes first and a missing one is tried again.
  fs.rmSync(out, { force: true });
  for (let attempt = 1; !fs.existsSync(out); attempt++) {
    if (attempt > 4) throw new Error(`${file} was not rendered`);
    execFileSync(
      bin,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        `--user-data-dir=${path.join(WORK, `profile-${key}-${size}-${attempt}`)}`,
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--default-background-color=00000000',
        `--window-size=${size},${size}`,
        `--screenshot=${out}`,
        `file:///${html.replace(/\\/g, '/')}`,
      ],
      { stdio: 'ignore' }
    );
    // The launcher can return before the renderer has written the file.
    for (let waited = 0; waited < 8000 && !fs.existsSync(out); waited += 250) sleep(250);
  }
  const b = fs.readFileSync(out);
  const [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (w !== size || h !== size) throw new Error(`${file} came out ${w}x${h}, not ${size}x${size}`);
  console.log(`✓ ${file} ${w}x${h}`);
}
// Edge can hold its profile open for a moment after it exits.
try {
  fs.rmSync(WORK, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
} catch {
  console.log('(brand/.render is still in use: delete it later)');
}

// The master copies kept beside this script.
fs.writeFileSync(path.join(ROOT, 'brand/logo-1024.svg'), SVGS.tile.replace('<svg ', '<svg width="1024" height="1024" '));
for (const [from, to] of [
  ['mobile/assets/icon.png', 'icon.png'],
  ['mobile/assets/adaptive-icon.png', 'adaptive-icon.png'],
  ['mobile/assets/logo.png', 'logo.png'],
  ['mobile/assets/notification-icon.png', 'notification-icon.png'],
  ['web/public/apple-touch-icon.png', 'apple-touch-icon.png'],
  ['web/public/favicon.png', 'favicon.png'],
]) {
  fs.copyFileSync(path.join(ROOT, from), path.join(ROOT, 'brand', to));
}
console.log('✓ brand/ master copies');
if (os.platform() === 'win32') console.log('\nDone. Rebuild the APK (npm run apk in mobile/) to put the new icons on Android.');
