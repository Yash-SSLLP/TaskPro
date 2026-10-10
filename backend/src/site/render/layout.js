/**
 * The frame every website page sits in: <head> (title, description,
 * canonical, robots, Open Graph, icons, JSON-LD), the sticky header (logo,
 * menu, Log in / Register), the announcement bar and the footer.
 *
 * No inline script and no inline style: the site's CSP allows only files from
 * this origin. /site/boot.js runs in <head> (theme before the first paint,
 * signed-in visitors, iPhones); /site/site.js runs after (menu, dismissing
 * the announcement).
 */
const crypto = require('node:crypto');
const { html, attr, jsonLd } = require('./html');
const { icon } = require('./icons');
const { safeHref } = require('../links');
const seo = require('../seo');

const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';

const SOCIALS = [
  ['instagram', 'Instagram'],
  ['youtube', 'YouTube'],
  ['linkedin', 'LinkedIn'],
  ['x', 'X'],
  ['facebook', 'Facebook'],
  ['whatsapp', 'WhatsApp'],
];

/** A media library item's public address, `thumb: true` for its small copy. */
function mediaUrl(item, { thumb = false } = {}) {
  if (!item) return '';
  const file = thumb && item.thumb ? item.thumb : item.file;
  const name = String(item.name || 'image').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'image';
  return `/media/${file}/${encodeURIComponent(name)}`;
}

/** "%s · Karo" around a title, unless the title already names the brand. */
function fullTitle(settings, title) {
  const brand = settings.brandName || 'Karo';
  const text = String(title || '').trim();
  if (!text) return brand;
  if (text.toLowerCase().includes(brand.toLowerCase())) return text;
  const template = settings.seo?.titleTemplate || `%s · ${brand}`;
  return template.includes('%s') ? template.replace('%s', () => text) : `${text} · ${brand}`;
}

/** A WhatsApp setting is a wa.me link or a number. */
function whatsappHref(value) {
  const v = String(value || '').trim();
  if (/^https:\/\//i.test(v)) return safeHref(v);
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : '';
}

function socialLinks(settings) {
  const s = settings.socials || {};
  const brand = settings.brandName || 'Karo';
  return SOCIALS.map(([key, label]) => {
    const href = key === 'whatsapp' ? whatsappHref(s[key]) : /^https:\/\//i.test(s[key] || '') ? safeHref(s[key]) : '';
    return href ? { key, label, href, title: `${brand} on ${label}` } : null;
  }).filter(Boolean);
}

const isCurrent = (href, path) => href === path || (href !== '/' && path.startsWith(`${href}/`));

function header(ctx, page) {
  const { settings } = ctx;
  // The menu marks the page you are on (never on the 404).
  const path = page.navPath ?? ctx.path;
  const brand = settings.brandName || 'Karo';
  const nav = (settings.nav || []).filter((l) => l.label && safeHref(l.href));
  const login = settings.headerCta?.login || {};
  const register = settings.headerCta?.register || {};
  const loginHref = safeHref(login.href) || '/sign-in';
  const registerHref = safeHref(register.href) || '/sign-up';
  const showRegister = ctx.signupEnabled !== false;
  const registerLabel = register.label || 'Register free';
  return html`<header class="site-header">
  <div class="wrap header-in">
    <a class="brand" href="/" aria-label="${brand} home"><img src="/logo.svg" width="34" height="34" alt=""><span>${brand}</span></a>
    <nav class="site-nav" id="site-nav" aria-label="Main">
      <ul>${nav.map((l) => html`<li><a href="${safeHref(l.href)}"${attr('aria-current', isCurrent(l.href, path) ? 'page' : '')}>${l.label}</a></li>`)}</ul>
      <div class="nav-cta">
        <a class="btn btn-outline" href="${loginHref}" data-cta="login">${login.label || 'Log in'}</a>
        ${showRegister ? html`<a class="btn btn-primary" href="${registerHref}" data-cta="register">${registerLabel}</a>` : ''}
        <a class="btn btn-primary cta-open" href="/tasks" data-cta="open">Open ${brand}</a>
      </div>
    </nav>
    <div class="header-cta">
      <a class="btn btn-ghost cta-login" href="${loginHref}" data-cta="login">${login.label || 'Log in'}</a>
      ${showRegister ? html`<a class="btn btn-primary cta-register" href="${registerHref}" data-cta="register">${registerLabel}</a>` : ''}
      <a class="btn btn-primary cta-open" href="/tasks" data-cta="open">Open ${brand}</a>
      <button class="menu-btn" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Menu" data-menu>${icon('menu', { cls: 'ic ic-menu' })}${icon('close', { cls: 'ic ic-close' })}</button>
    </div>
  </div>
</header>`;
}

/** The bar's id changes with its words, so a new message shows again after a dismissal. */
const announcementId = (a) => crypto.createHash('sha1').update(`${a.text}|${a.href}`).digest('hex').slice(0, 10);

function announcement(ctx) {
  const a = ctx.settings.announcement || {};
  if (!a.enabled || !a.text) return '';
  const href = safeHref(a.href);
  return html`<div class="announce" role="region" aria-label="Announcement">
  <div class="wrap announce-in">
    <p>${href ? html`<a href="${href}">${a.text} ${icon('arrow', { size: 16 })}</a>` : a.text}</p>
    <button class="announce-x" type="button" aria-label="Dismiss" data-announce-close>${icon('close', { size: 18 })}</button>
  </div>
</div>`;
}

function footer(ctx) {
  const { settings } = ctx;
  const brand = settings.brandName || 'Karo';
  const columns = (settings.footer?.columns || []).filter((c) => c.title && c.links?.length);
  const socials = socialLinks(settings);
  // The privacy policy is always one tap away (app stores require it).
  const hasPrivacy = columns.some((c) => c.links.some((l) => l.href === '/privacy'));
  return html`<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <div class="footer-brand">
        <a class="brand brand-footer" href="/"><img src="/logo.svg" width="34" height="34" alt=""><span>${brand}</span></a>
        ${settings.tagline ? html`<p>${settings.tagline}</p>` : ''}
        ${
          socials.length
            ? html`<ul class="socials" aria-label="${brand} elsewhere">${socials.map(
                (s) => html`<li><a href="${s.href}" rel="noopener me" target="_blank" aria-label="${s.title}" title="${s.title}">${icon(s.key, { size: 20 })}</a></li>`
              )}</ul>`
            : ''
        }
      </div>
      <div class="footer-cols">${columns.map(
        (c) => html`<section>
          <h2>${c.title}</h2>
          <ul>${c.links.filter((l) => l.label && safeHref(l.href)).map((l) => html`<li><a href="${safeHref(l.href)}">${l.label}</a></li>`)}</ul>
        </section>`
      )}</div>
    </div>
    <div class="footer-bottom">
      <p class="made"><span class="tricolour" aria-hidden="true"><i></i><i></i><i></i></span>© ${ctx.year} ${brand} · Made in India</p>
      ${settings.footer?.note ? html`<p>${settings.footer.note}</p>` : ''}
      ${hasPrivacy ? '' : html`<p><a href="/privacy">Privacy policy</a></p>`}
    </div>
  </div>
</footer>`;
}

/**
 * A whole page.
 * @param {object} ctx      from site/public.js (settings, base, path, indexable…)
 * @param {object} page     { title, description, robots?, ogType?, ogImage?, ogImageAlt?, jsonLd?: [], main, head?, navPath? }
 */
function layout(ctx, page) {
  const { settings, base } = ctx;
  const brand = settings.brandName || 'Karo';
  const title = fullTitle(settings, page.title);
  const description = page.description || settings.seo?.defaultDescription || settings.tagline || '';
  const canonical = seo.absolute(base, page.canonicalPath || ctx.path);
  const indexable = ctx.indexable && !page.noindex;
  const robots = indexable ? page.robots || 'index,follow,max-image-preview:large' : page.robots === 'noindex,follow' ? 'noindex,follow' : 'noindex';
  const defaultOg = ctx.media.get(String(settings.seo?.defaultOgImage || ''));
  const ogImage = page.ogImage || (defaultOg ? seo.absolute(base, mediaUrl(defaultOg)) : `${base}/site/og-default.png`);
  const ogSize = page.ogImage ? page.ogImageSize : defaultOg ? { width: defaultOg.width, height: defaultOg.height } : { width: 1200, height: 630 };
  const v = encodeURIComponent(ctx.assetVersion);
  const announce = ctx.settings.announcement?.enabled && ctx.settings.announcement?.text ? announcementId(ctx.settings.announcement) : '';
  const nodes = [seo.organization(settings, base), ...(page.jsonLd || [])];
  const origin = ctx.previewOrigin;
  return html`<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${
  ctx.preview
    ? html`<base href="${origin}/">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${origin} https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src ${origin} data:; base-uri ${origin}; form-action 'none'">`
    : ''
}
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="${ctx.preview ? 'noindex' : robots}">
${settings.seo?.googleSiteVerification ? html`<meta name="google-site-verification" content="${settings.seo.googleSiteVerification}">` : ''}
<link rel="alternate" hreflang="en-IN" href="${canonical}">
<link rel="alternate" hreflang="x-default" href="${canonical}">
<meta property="og:type" content="${page.ogType || 'website'}">
<meta property="og:site_name" content="${brand}">
<meta property="og:title" content="${page.ogTitle || page.title || brand}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${ogImage}">
${ogSize?.width ? html`<meta property="og:image:width" content="${ogSize.width}"><meta property="og:image:height" content="${ogSize.height}">` : ''}
<meta property="og:image:alt" content="${page.ogImageAlt || `${brand}: give tasks, get them done`}">
<meta property="og:locale" content="en_IN">
${page.head || ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${page.ogTitle || page.title || brand}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImage}">
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0B141A" media="(prefers-color-scheme: dark)">
${announce ? html`<meta name="karo-announce" content="${announce}">` : ''}
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="${settings.blog?.title || `${brand} blog`}" href="/rss.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${
  // Inter never holds up the first paint: fetched early, applied by boot.js
  // (the text shows at once in a size-matched fallback, then swaps).
  ctx.preview
    ? html`<link rel="stylesheet" href="${FONT_CSS}">`
    : html`<link rel="preload" as="style" href="${FONT_CSS}" data-font>`
}
<link rel="stylesheet" href="/site/site.css?v=${v}">
${ctx.preview ? '' : html`<script src="/site/boot.js?v=${v}"></script>
<script src="/site/site.js?v=${v}" defer></script>
<noscript><link rel="stylesheet" href="${FONT_CSS}"></noscript>`}
${jsonLd(seo.graph(nodes))}
</head>
<body${attr('class', page.bodyClass)}>
<a class="skip" href="#main">Skip to content</a>
${announcement(ctx)}
${header(ctx, page)}
<main id="main" tabindex="-1">
${page.main}
</main>
${footer(ctx)}
</body>
</html>
`;
}

module.exports = { layout, mediaUrl };
