/**
 * Which addresses belong to the website, and which links it may print.
 *
 * The site shares its origin with the web app: vercel.json sends exactly the
 * SITE paths below to the backend and everything else to the app. A page can
 * only live where the site is served, and never on a path the app owns
 * (RESERVED_PATHS).
 */

// The app's own paths (web/src/App.jsx) and the files the web service serves.
const RESERVED_PATHS = [
  '/api',
  '/site',
  '/media',
  '/app',
  '/iphone',
  '/assets',
  '/.well-known',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/delete-account',
  '/get-app',
  '/join',
  '/tasks',
  '/calendar',
  '/recurring',
  '/dashboard',
  '/contacts',
  '/teams',
  '/team',
  '/alerts',
  '/settings',
  '/profile',
  '/console',
  '/platform',
  '/report',
  '/website',
  '/blog',
  '/rss.xml',
  '/sitemap.xml',
  '/robots.txt',
  '/llms.txt',
];

// Where a new page may go: /features/<slug> or /for/<slug>.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PAGE_PATH = /^\/(features|for)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * Every path the backend serves for the website (the same list as vercel.json),
 * in any case: /Privacy reaches the site's router, which sends it to /privacy.
 */
const SITE_PATH = /^\/(?:$|(?:features|for|about|contact|privacy|terms|blog|rss\.xml|sitemap\.xml|robots\.txt|llms\.txt)(?:\/|$)|media\/)/i;
const isSitePath = (path) => SITE_PATH.test(String(path || ''));

const isReserved = (path) => {
  const p = String(path || '').toLowerCase();
  return RESERVED_PATHS.some((r) => p === r || p.startsWith(`${r}/`));
};

/** Is `path` somewhere a page may be created? (System pages are made by the seed.) */
const isPagePath = (path) => typeof path === 'string' && path.length <= 120 && PAGE_PATH.test(path) && !isReserved(path);

/** "Hello, World!" → "hello-world" (for slugs, tags and file names). */
function slugify(text, max = 80) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/**
 * A link the site may print: on the site ("/…", "#…") or https:, http:,
 * mailto:, tel:. Anything else (javascript:, data:, "//host") is refused.
 */
function isSafeHref(href) {
  if (typeof href !== 'string') return false;
  const h = href.trim();
  if (!h || h.length > 500 || /[\u0000-\u001f\u007f\s\\]/.test(h)) return false;
  if (h.startsWith('#')) return true;
  if (h.startsWith('/')) return !h.startsWith('//');
  return /^(https?:\/\/[^/]|mailto:|tel:)/i.test(h);
}

/** The href to print: the link itself when safe, else nothing. */
const safeHref = (href) => (isSafeHref(href) ? href.trim() : '');

/**
 * Posts keep their tags as written ("WhatsApp", "Task Pin"); a tag's page is
 * /blog/tag/<slug>. The posts a slug names, case and spacing aside.
 */
function tagFilter(slug) {
  const parts = slugify(slug, 40).split('-').filter(Boolean);
  if (!parts.length) return { _id: null };
  return { tags: { $regex: `^${parts.join('[^a-z0-9]+')}$`, $options: 'i' } };
}

/** A redirect's `from`: a site path without a query or a trailing slash. */
const isRedirectFrom = (from) =>
  typeof from === 'string' && /^\/[a-z0-9\-._~/%]*$/i.test(from) && !from.endsWith('/') && !from.includes('//') && isSitePath(from) && !from.startsWith('/media/');

module.exports = { SLUG, isSitePath, isPagePath, slugify, tagFilter, isSafeHref, safeHref, isRedirectFrom };
