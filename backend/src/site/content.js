/**
 * Reading the website's content for a page: the settings, the pictures a page
 * uses, the latest posts, the live numbers, and the context every renderer
 * gets.
 */
const mongoose = require('mongoose');
const config = require('../config');
const SiteSettings = require('./models/SiteSettings');
const SiteMedia = require('./models/SiteMedia');
const BlogPost = require('./models/BlogPost');
const seo = require('./seo');
const { tagFilter } = require('./links');
const { liveStats } = require('./stats');

// Cache-busting for /site/*.css|js: the deployment's commit, else the package version.
const ASSET_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12) || require('../../package.json').version;

/** The settings document, or its defaults while none has been saved. */
async function loadSettings() {
  const doc = await SiteSettings.findById('site').lean();
  return doc || new SiteSettings().toObject();
}

/** Posts a visitor may see: published, and their date has come. */
const publishedPosts = (extra = {}) => ({ status: 'published', publishedAt: { $ne: null, $lte: new Date() }, ...extra });

// A post as a card needs none of its body.
const CARD_FIELDS = 'slug title excerpt cover tags publishedAt readingMinutes updatedAt';

const isId = (v) => (v instanceof mongoose.Types.ObjectId || (typeof v === 'string' && /^[a-f\d]{24}$/i.test(v)));

/** Every SiteMedia id named under `media`, `ogImage` or `defaultOgImage` keys, anywhere in `values`. */
function collectMediaIds(values, out = new Set()) {
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 8) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (v instanceof mongoose.Types.ObjectId || v instanceof Date) return;
    for (const [k, x] of Object.entries(v)) {
      if ((k === 'media' || k === 'ogImage' || k === 'defaultOgImage') && isId(x)) out.add(String(x));
      else walk(x, depth + 1);
    }
  };
  walk(values, 0);
  return out;
}

/** SiteMedia by id (as strings). */
async function loadMedia(ids) {
  const list = [...ids].filter((id) => isId(id));
  if (!list.length) return new Map();
  const docs = await SiteMedia.find({ _id: { $in: list } }).lean();
  return new Map(docs.map((d) => [String(d._id), d]));
}

const yearInIndia = () => Number(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }));

/** What every renderer reads. */
function context(req, settings, extra = {}) {
  return {
    req,
    settings,
    path: req.path,
    base: seo.siteBase(settings, req),
    indexable: seo.isIndexable(settings, req),
    signupEnabled: config.signupEnabled,
    assetVersion: ASSET_VERSION,
    year: yearInIndia(),
    media: new Map(),
    stats: null,
    teaserPosts: [],
    preview: false,
    ...extra,
  };
}

/**
 * Load what a page's sections need: their pictures, the latest posts for a
 * blog teaser, the live numbers for a stats band.
 * @param {object} ctx       from context(); filled in place
 * @param {object} content   { seo, sections }, or a post
 */
async function prepare(ctx, content) {
  const visible = (content.sections || []).filter((s) => !s.hidden);
  const teaser = visible.find((s) => s.type === 'blogTeaser');
  const live = visible.some((s) => s.type === 'stats' && s.props?.mode !== 'manual');
  const [media, posts, stats] = await Promise.all([
    loadMedia(collectMediaIds([content, ctx.settings.seo])),
    teaser ? BlogPost.find(publishedPosts(teaser.props?.tag ? tagFilter(teaser.props.tag) : {})).sort({ publishedAt: -1, _id: -1 }).limit(6).select(CARD_FIELDS).lean() : [],
    live ? liveStats().catch(() => null) : null,
  ]);
  ctx.media = media;
  ctx.teaserPosts = posts;
  ctx.stats = stats;
  // Covers of the teaser's posts.
  if (posts.length) {
    const more = await loadMedia(collectMediaIds(posts.map((p) => p.cover)));
    for (const [k, v] of more) ctx.media.set(k, v);
  }
  return ctx;
}

module.exports = { loadSettings, publishedPosts, CARD_FIELDS, collectMediaIds, loadMedia, context, prepare, ASSET_VERSION };
