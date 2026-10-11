/**
 * The public website: every page, the blog, the feeds and the pictures,
 * rendered from MongoDB for anyone (no sign-in, no cookies).
 *
 * Mounted in app.js BEFORE cors(), so these answers carry no `Vary: Origin`
 * and Vercel's CDN can keep one copy per page. It only answers the site's own
 * paths (site/links.js isSitePath, the list vercel.json sends here); anything
 * else goes on to the API and the app.
 *
 * In order: a trailing slash or capitals → 301 to the clean address; the
 * Super Admin's redirects; the page; else a real HTML 404.
 */
const express = require('express');
const helmet = require('helmet');
const config = require('../config');
const { sendFallback } = require('./fallback');
const SitePage = require('./models/SitePage');
const BlogPost = require('./models/BlogPost');
const files = require('../platform/services/files');
const { isSitePath, SLUG, slugify, tagFilter } = require('./links');
const { loadSettings, publishedPosts, CARD_FIELDS, collectMediaIds, loadMedia, context, prepare } = require('./content');
const { renderPage, renderNotFound, renderError } = require('./render/pages');
const { renderBlogIndex, renderPost } = require('./render/blog');
const feeds = require('./render/feeds');

const router = express.Router();

const PER_PAGE = 12;
const PAGE_PATHS = ['/', '/features', '/about', '/contact', '/privacy', '/terms', '/features/:slug', '/for/:slug'];

// The pages load scripts and styles from this origin only (plus Google's
// font files); nothing inline may run.
const csp = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  },
});

// ---------------------------------------------------------------- answers

/** An HTML page, cached a minute by browsers and the CDN (and served stale for a day while it refreshes). */
function sendHtml(res, status, body, { indexable = false, robots = '' } = {}) {
  res.status(status).type('html');
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Vercel-CDN-Cache-Control', status === 200 ? 'max-age=60, stale-while-revalidate=86400' : 'max-age=60');
  if (!indexable) res.set('X-Robots-Tag', robots === 'noindex,follow' ? 'noindex, follow' : 'noindex');
  res.send(String(body));
}

/** Text for robots and feed readers, cached an hour. */
function sendText(res, type, body) {
  res.status(200).type(type);
  res.set('Cache-Control', 'public, max-age=3600');
  res.set('Vercel-CDN-Cache-Control', 'max-age=3600');
  res.send(body);
}

function redirect(res, status, to) {
  res.set('Cache-Control', 'public, max-age=60');
  res.set('Vercel-CDN-Cache-Control', 'max-age=60');
  res.redirect(status, to);
}

async function notFound(req, res) {
  const ctx = context(req, req.site || (await loadSettings()));
  await prepare(ctx, {});
  sendHtml(res, 404, renderNotFound(ctx));
}

const queryOf = (req) => {
  const i = req.originalUrl.indexOf('?');
  return i === -1 ? '' : req.originalUrl.slice(i);
};

// ---------------------------------------------------------------- the gate

router.use((req, res, next) => {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !isSitePath(req.path)) return next('router');
  next();
});
router.use(csp);

// One address per page: no trailing slash, no capitals (pictures keep their names).
router.use((req, res, next) => {
  const { path } = req;
  let clean = path.length > 1 ? path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/' : path;
  if (!path.startsWith('/media/')) clean = clean.toLowerCase();
  if (clean !== path) return redirect(res, 301, clean + queryOf(req));
  next();
});

// The settings every page needs, and the Super Admin's redirects.
router.use(async (req, res, next) => {
  if (req.path.startsWith('/media/')) return next();
  req.site = await loadSettings();
  const hit = (req.site.redirects || []).find((r) => r.from === req.path);
  if (hit) return redirect(res, hit.status === 302 ? 302 : 301, hit.to);
  next();
});

// ---------------------------------------------------------------- robots and feeds

router.get('/robots.txt', (req, res) => {
  const ctx = context(req, req.site);
  sendText(res, 'text/plain', feeds.robotsTxt(ctx));
});

router.get('/sitemap.xml', async (req, res) => {
  const ctx = context(req, req.site);
  const [pages, posts] = await Promise.all([
    SitePage.find({ status: 'published', 'published.seo.noindex': { $ne: true } }).select('path updatedAt published.publishedAt').sort({ path: 1 }).lean(),
    BlogPost.find(publishedPosts({ 'seo.noindex': { $ne: true } })).select('slug updatedAt').sort({ publishedAt: -1 }).limit(5000).lean(),
  ]);
  const list = pages.map((p) => ({ path: p.path, updatedAt: p.published?.publishedAt || p.updatedAt }));
  sendText(res, 'application/xml', feeds.sitemapXml(ctx.base, list, posts));
});

router.get('/rss.xml', async (req, res) => {
  const ctx = context(req, req.site);
  const posts = await BlogPost.find(publishedPosts()).select('slug title excerpt tags publishedAt').sort({ publishedAt: -1 }).limit(30).lean();
  sendText(res, 'application/rss+xml', feeds.rssXml({ base: ctx.base, settings: req.site, posts }));
});

router.get('/llms.txt', async (req, res) => {
  const ctx = context(req, req.site);
  const [pages, posts] = await Promise.all([
    SitePage.find({ status: 'published', 'published.seo.noindex': { $ne: true } }).select('path published.title published.seo').sort({ path: 1 }).lean(),
    BlogPost.find(publishedPosts({ 'seo.noindex': { $ne: true } })).select('slug title excerpt').sort({ publishedAt: -1 }).limit(100).lean(),
  ]);
  const list = pages.map((p) => ({ path: p.path, title: p.published?.title, description: p.published?.seo?.description }));
  sendText(res, 'text/plain', feeds.llmsTxt({ base: ctx.base, settings: req.site, pages: list, posts }));
});

// ---------------------------------------------------------------- pictures

const IMAGE_TYPES = /^image\/(jpeg|png|webp)$/;

// A website picture, to anyone: only files filed under the site (never a
// task's attachment). A new picture is a new id, so it is cached for a year.
router.get('/media/:id{/:name}', async (req, res, next) => {
  const meta = await files.getFile(req.params.id);
  if (!meta || meta.metadata?.ref?.kind !== 'site') {
    res.set('Cache-Control', 'public, max-age=60');
    return res.status(404).type('text/plain').send('Not found');
  }
  const mime = IMAGE_TYPES.test(meta.metadata.mime || '') ? meta.metadata.mime : 'application/octet-stream';
  res.set({
    'Content-Type': mime,
    'Content-Length': String(meta.length),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta.filename || 'image')}`,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  const stream = files.openStream(meta._id);
  stream.on('error', next);
  stream.pipe(res);
});

// ---------------------------------------------------------------- blog

/** ?page=n: a whole number from 1; anything else is not a page. */
function pageNumber(req) {
  const q = req.query.page;
  if (q === undefined) return 1;
  return typeof q === 'string' && /^[1-9]\d{0,4}$/.test(q) ? Number(q) : null;
}

async function listing(req, res, filter, tag) {
  const page = pageNumber(req);
  if (page === null) return notFound(req, res);
  const base = tag ? `/blog/tag/${tag}` : '/blog';
  if (req.query.page === '1') return redirect(res, 301, base);
  const [posts, total] = await Promise.all([
    BlogPost.find(filter)
      .sort({ publishedAt: -1, _id: -1 })
      .skip((page - 1) * PER_PAGE)
      .limit(PER_PAGE)
      .select(CARD_FIELDS)
      .lean(),
    BlogPost.countDocuments(filter),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > pages || (tag && !total)) return notFound(req, res);
  const ctx = context(req, req.site);
  ctx.media = await loadMedia(collectMediaIds([req.site.seo, posts.map((p) => p.cover)]));
  // The tag as its posts write it.
  const tagText = tag ? posts.flatMap((p) => p.tags || []).find((t) => slugify(t, 40) === tag) || tag : '';
  sendHtml(res, 200, renderBlogIndex(ctx, { posts, page, pages, tag, tagText }), { indexable: ctx.indexable && !tag, robots: tag ? 'noindex,follow' : '' });
}

router.get('/blog', (req, res) => listing(req, res, publishedPosts()));

router.get('/blog/tag/:tag', (req, res) => {
  const tag = String(req.params.tag || '');
  if (!SLUG.test(tag)) return notFound(req, res);
  return listing(req, res, publishedPosts(tagFilter(tag)), tag);
});

router.get('/blog/:slug', async (req, res) => {
  const { slug } = req.params;
  if (!SLUG.test(slug)) return notFound(req, res);
  const post = await BlogPost.findOne(publishedPosts({ slug })).lean();
  if (!post) {
    // A post that has moved: send the old address on for good.
    const moved = await BlogPost.findOne(publishedPosts({ previousSlugs: slug })).select('slug').lean();
    return moved ? redirect(res, 301, `/blog/${moved.slug}`) : notFound(req, res);
  }
  // Up to three more: sharing a tag first, then the latest.
  const others = { _id: { $ne: post._id } };
  let related = post.tags?.length
    ? await BlogPost.find(publishedPosts({ ...others, tags: { $in: post.tags } })).sort({ publishedAt: -1 }).limit(3).select(CARD_FIELDS).lean()
    : [];
  if (related.length < 3) {
    const more = await BlogPost.find(publishedPosts({ _id: { $nin: [post._id, ...related.map((p) => p._id)] } }))
      .sort({ publishedAt: -1 })
      .limit(3 - related.length)
      .select(CARD_FIELDS)
      .lean();
    related = [...related, ...more];
  }
  const ctx = context(req, req.site);
  ctx.media = await loadMedia(collectMediaIds([req.site.seo, post.cover, post.seo, related.map((p) => p.cover)]));
  sendHtml(res, 200, renderPost(ctx, post, { related }), { indexable: ctx.indexable && !post.seo?.noindex });
});

// ---------------------------------------------------------------- pages

router.get(PAGE_PATHS, async (req, res) => {
  const page = await SitePage.findOne({ path: req.path, status: 'published' }).lean();
  if (!page?.published) return notFound(req, res);
  const ctx = context(req, req.site);
  await prepare(ctx, page.published);
  sendHtml(res, 200, renderPage(ctx, page.published), { indexable: ctx.indexable && !page.published.seo?.noindex });
});

// Any other site address.
router.use(notFound);

// The database could not be reached (rather than a fault in a page).
const DB_DOWN = new Set(['MongoNetworkError', 'MongoServerSelectionError', 'MongoNotConnectedError', 'MongoTopologyClosedError', 'MongooseServerSelectionError']);

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  console.error(`[site] ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return res.end();
  // Visitors get the landing page while the database is away, not an error.
  if (DB_DOWN.has(err?.name)) return sendFallback(res, { signupEnabled: config.signupEnabled });
  res.status(500).type('html').set('Cache-Control', 'no-store').send(String(renderError()));
});

module.exports = router;
