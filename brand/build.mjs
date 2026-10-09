// PinTask's mark, and every icon file the apps ship, from one place.
//
//   node brand/build.mjs
//
// The mark: a T and a P fused (one bar, one stem that tapers to a pin's point)
// with a brush-stroke check laid over the bowl, a clean gap cut around it. Bone
// on an Ink tile lit softly from the top; the check in the accent red.
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

const G = { w: 78, gap: 24, armL: 232, bar: 312, stemX: 412, r: 110, bowlX: 540, foot: 792, pin: 150 };
const CHECK = { pts: [[548, 470], [612, 538], [830, 268]], w0: 58, w1: 80, w2: 26 };
// The glyph's box is 232..843 × 255..792; this centres it optically (the thin
// tail of the check carries less weight, so the mark may sit a touch right).
const CENTRE = { dx: -18, dy: -10 };

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

/** A brush-like check: a short leg into the vertex, then a long leg thinning to a point. */
function brushCheck([p0, p1, p2], w0, w1, w2) {
  const leg = (a, b, wa, wb) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    const nx = -dy / L;
    const ny = dx / L;
    return `M${[
      [a[0] + (nx * wa) / 2, a[1] + (ny * wa) / 2],
      [b[0] + (nx * wb) / 2, b[1] + (ny * wb) / 2],
      [b[0] - (nx * wb) / 2, b[1] - (ny * wb) / 2],
      [a[0] - (nx * wa) / 2, a[1] - (ny * wa) / 2],
    ]
      .map((p) => p.map((v) => v.toFixed(1)).join(','))
      .join('L')}Z`;
  };
  const dot = (p, w) => `M${(p[0] - w / 2).toFixed(1)},${p[1]}a${w / 2},${w / 2} 0 1 0 ${w},0a${w / 2},${w / 2} 0 1 0 -${w},0Z`;
  return [leg(p0, p1, w0, w1), leg(p1, p2, w1, w2), dot(p0, w0), dot(p1, w1), dot(p2, w2)].join('');
}

const BRUSH = brushCheck(CHECK.pts, CHECK.w0, CHECK.w1, CHECK.w2);

/**
 * One SVG of the mark.
 *   bg     'squircle' (the tile), 'square' (full bleed), or 'none'
 *   glyph  'bone' (a soft gradient) or a flat colour
 *   check  'accent' (a gradient) or a flat colour
 *   scale  the mark's size about the canvas centre
 */
function build({ bg = 'squircle', glyph = 'bone', check = 'accent', scale = 1, rim = true }) {
  const { w, gap, armL, bar, stemX, r, bowlX, foot, pin } = G;
  const half = w / 2;
  const glyphPaint = glyph === 'bone' ? 'url(#glyph)' : glyph;
  const checkPaint = check === 'accent' ? 'url(#check)' : check;
  const t = `translate(512 512) scale(${scale}) translate(${-512 + CENTRE.dx} ${-512 + CENTRE.dy})`;
  const tile =
    bg === 'none'
      ? ''
      : bg === 'square'
        ? '<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#sheen)"/>'
        : `<path d="${squircle(1024)}" fill="url(#bg)"/><path d="${squircle(1024)}" fill="url(#sheen)"/>${
            rim ? `<path d="${squircle(1024, 5, 2.5)}" fill="none" stroke="#F1ECE2" stroke-opacity="0.10" stroke-width="3"/>` : ''
          }`;
  const mark =
    scale > 0
      ? `<g transform="${t}">
<g mask="url(#cut)" fill="${glyphPaint}">
<rect x="${armL}" y="${bar - half}" width="${stemX - armL}" height="${w}"/>
<path d="M${stemX - half},${bar - half}H${stemX + half}V${foot - pin}Q${stemX + half},${foot - pin * 0.35} ${stemX},${foot}Q${stemX - half},${foot - pin * 0.35} ${stemX - half},${foot - pin}Z"/>
<path d="M${stemX},${bar}H${bowlX}A${r},${r} 0 0 1 ${bowlX},${bar + 2 * r}H${stemX}" fill="none" stroke="${glyphPaint}" stroke-width="${w}" stroke-linejoin="round"/>
</g>
<path d="${BRUSH}" fill="${checkPaint}"/>
</g>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1024" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2B2721"/><stop offset=".55" stop-color="#1A1814"/><stop offset="1" stop-color="#100E0B"/></linearGradient>
<radialGradient id="sheen" cx="300" cy="110" r="760" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".11"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<linearGradient id="glyph" x1="0" y1="220" x2="0" y2="820" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FCFAF5"/><stop offset="1" stop-color="#E9E2D4"/></linearGradient>
<linearGradient id="check" x1="520" y1="620" x2="860" y2="240" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#D9381E"/><stop offset="1" stop-color="#F45E3E"/></linearGradient>
<mask id="cut" maskUnits="userSpaceOnUse" x="-512" y="-512" width="2048" height="2048"><rect x="-512" y="-512" width="2048" height="2048" fill="#fff"/><path d="${BRUSH}" fill="#000" stroke="#000" stroke-width="${gap * 2}" stroke-linejoin="round"/></mask>
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
  adaptiveFg: build({ bg: 'none', scale: 0.67 }),
  adaptiveBg: build({ bg: 'square', rim: false, scale: 0 }),
  adaptiveMono: build({ bg: 'none', scale: 0.67, glyph: '#FFFFFF', check: '#FFFFFF' }),
  splashLight: build({ bg: 'none', scale: 1.25, glyph: '#15130F' }),
  splashDark: build({ bg: 'none', scale: 1.25 }),
  notification: build({ bg: 'none', scale: 1.5, glyph: '#FFFFFF', check: '#FFFFFF' }),
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
// The bare mark, Bone on transparent: the sign-in panel's watermark.
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
  execFileSync(
    bin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--user-data-dir=${path.join(WORK, 'profile')}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${size},${size}`,
      `--screenshot=${out}`,
      `file:///${html.replace(/\\/g, '/')}`,
    ],
    { stdio: 'ignore' }
  );
  const b = fs.readFileSync(out);
  const [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (w !== size || h !== size) throw new Error(`${file} came out ${w}x${h}, not ${size}x${size}`);
  console.log(`✓ ${file} ${w}x${h}`);
}
fs.rmSync(WORK, { recursive: true, force: true });

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
