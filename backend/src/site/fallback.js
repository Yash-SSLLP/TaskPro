/**
 * The page visitors get when the website cannot be built from the database:
 * the API is still starting, MongoDB cannot be reached, or the site's own
 * code failed to load. It is a real landing page (who Karo is for, Log in,
 * Register, the app), not an error screen, and it says plainly that Karo is
 * being updated.
 *
 * It needs nothing but this file: no database, no settings and no other module
 * of the site, so it works whatever broke. It is styled by /site/site.css,
 * which the web service serves even while this server is down. `inlineStyle`
 * adds a small built-in look for when that file cannot load either (the
 * site's CSP blocks inline styles, so pages behind it leave it out).
 *
 * It answers 503 with Retry-After, so search engines treat it as temporary.
 */
const INLINE_STYLE = `<style>
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f3f3f3;color:#181818}
.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
.site-header{background:#fff;border-bottom:1px solid #e5e5e5}
.header-in{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px}
.brand{display:flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font-weight:800;font-size:20px}
.header-cta,.actions{display:flex;flex-wrap:wrap;gap:10px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 18px;border-radius:999px;font-weight:600;text-decoration:none;border:1px solid #c9c9c9;color:#181818}
.btn-primary{background:#0176d3;border-color:#0176d3;color:#fff}
.hero{padding:56px 0 64px}
.eyebrow{color:#0b5cab;font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 12px}
h1{font-size:clamp(34px,6vw,56px);line-height:1.05;letter-spacing:-.02em;margin:0 0 16px}
.lead{font-size:18px;color:#5c5c5c;max-width:60ch;margin:0 0 24px}
.fallback-note{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #e5e5e5;border-left:4px solid #0176d3;border-radius:12px;padding:14px 16px;margin:0 0 24px;max-width:60ch}
.fallback-points{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));list-style:none;padding:0;margin:40px 0 0}
.fallback-points li{background:#fff;border:1px solid #e5e5e5;border-radius:14px;padding:16px}
.site-footer{border-top:1px solid #e5e5e5;padding:24px 0;color:#5c5c5c;font-size:14px}
.site-footer a{color:inherit}
@media (prefers-color-scheme:dark){body{background:#0b141a;color:#e9edef}.site-header,.fallback-note,.fallback-points li{background:#111b21;border-color:#222d34}.lead,.site-footer{color:#aebac1}.btn{color:#e9edef;border-color:#2a3942}.btn-primary{background:#1b96ff;border-color:#1b96ff;color:#0b141a}.eyebrow{color:#53a6fd}}
</style>`;

/** The fallback landing page as HTML. */
function fallbackPage({ inlineStyle = false, signupEnabled = true } = {}) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#f3f3f3">
<title>Karo: give a task once, see it done</title>
<meta name="description" content="Karo is a free task app for Indian teams. Give tasks by Task Pin and see them accepted, moving and done.">
<link rel="icon" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/site/site.css">
${inlineStyle ? INLINE_STYLE : ''}
</head>
<body class="is-fallback">
<header class="site-header">
  <div class="wrap header-in">
    <a class="brand" href="/" aria-label="Karo home"><img src="/logo.svg" width="34" height="34" alt=""><span>Karo</span></a>
    <div class="header-cta">
      <a class="btn btn-ghost" href="/sign-in">Log in</a>
      ${signupEnabled ? '<a class="btn btn-primary" href="/sign-up">Register free</a>' : ''}
    </div>
  </div>
</header>
<main id="main">
  <section class="hero" aria-labelledby="fallback-h">
    <div class="wrap">
      <p class="eyebrow">Free task app for Indian teams</p>
      <h1 id="fallback-h">In Karo, you give a task once. It gets done.</h1>
      <p class="lead">Share your Task Pin, give tasks to your staff or anyone you work with, and see who accepted, what is moving and what is done. On Android, iPhone and the web.</p>
      <p class="fallback-note" role="status"><span><strong>We are updating Karo right now.</strong> This page is back to normal in a few minutes. If signing in does not work yet, try again shortly: your tasks are safe.</span></p>
      <div class="actions">
        ${signupEnabled ? '<a class="btn btn-primary btn-lg" href="/sign-up">Register free</a>' : ''}
        <a class="btn btn-outline btn-lg" href="/get-app">Get the Android app</a>
      </div>
      <ul class="fallback-points">
        <li><strong>One owner, one deadline.</strong><br>In Karo, every task has someone who accepted it and a date it is due.</li>
        <li><strong>Organizations.</strong><br>Keep each shop, office or project in its own tab, and everything else under General.</li>
        <li><strong>Six languages.</strong><br>English, हिंदी, ಕನ್ನಡ, தமிழ், తెలుగు and മലയാളം in the app.</li>
      </ul>
    </div>
  </section>
</main>
<footer class="site-footer">
  <div class="wrap">© ${year} Karo · Made in India · <a href="/get-app">Get the app</a> · <a href="/delete-account">Delete account</a></div>
</footer>
</body>
</html>`;
}

/** Answer with the fallback page: 503, never cached, try again in 30 seconds. */
function sendFallback(res, opts) {
  res.statusCode = 503;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Retry-After', '30');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(fallbackPage(opts));
}

module.exports = { fallbackPage, sendFallback };
