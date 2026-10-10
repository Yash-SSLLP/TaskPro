/**
 * /api/site: the Super Admin's website editor (the console's Website pages).
 *
 * Settings, pages (draft → publish), blog posts, the picture library, and
 * previews. Every write is checked (site/schemas.js) and logged
 * (admin.site_* in the activity log). Each record carries `version`: send it
 * back with a change, and if someone else saved in between the answer is
 * 409 CHANGED_ELSEWHERE (platform/errors.js) instead of overwriting them.
 */
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { protect, requireSuperAdmin } = require('../platform/auth');
const { parse, idParam } = require('../platform/validate');
const { HttpError, badRequest, notFound, conflict } = require('../platform/errors');
const files = require('../platform/services/files');
const activity = require('../platform/services/activity');
const SiteSettings = require('./models/SiteSettings');
const SitePage = require('./models/SitePage');
const BlogPost = require('./models/BlogPost');
const SiteMedia = require('./models/SiteMedia');
const schemas = require('./schemas');
const seo = require('./seo');
const { isPagePath, slugify, tagFilter } = require('./links');
const { renderMarkdown, readingMinutes } = require('./markdown');
const { loadSettings, context, prepare, collectMediaIds, loadMedia } = require('./content');
const { renderPage } = require('./render/pages');
const { renderPost } = require('./render/blog');
const { mediaUrl } = require('./render/layout');

const router = express.Router();
router.use(protect, requireSuperAdmin);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Someone saved this since the editor loaded it. */
function checkVersion(doc, version) {
  if (version !== undefined && !doc.isNew && version !== doc.__v) throw new mongoose.Error.VersionError(doc, version, []);
}

const log = (req, action, { id, label }, meta) => activity.record({ req, action, target: { kind: 'site', id: String(id), label: label || '' }, meta });

const noStore = (res) => res.set('Cache-Control', 'private, no-store');

// ---------------------------------------------------------------- views

function settingsView(doc) {
  const s = doc.toObject ? doc.toObject() : doc;
  const { _id, __v, seedVersion, ...rest } = s;
  return { ...rest, version: __v ?? 0 };
}

const sameContent = (a, b) => JSON.stringify({ t: a?.title, s: a?.seo, x: a?.sections }) === JSON.stringify({ t: b?.title, s: b?.seo, x: b?.sections });

function pageView(doc, { full = true } = {}) {
  const p = doc.toObject ? doc.toObject() : doc;
  const view = {
    id: String(p._id),
    path: p.path,
    system: !!p.system,
    status: p.status,
    title: p.draft?.title || p.published?.title || '',
    publishedAt: p.published?.publishedAt || null,
    // The draft differs from what visitors see.
    changed: p.status !== 'published' || !sameContent(p.draft, p.published),
    updatedAt: p.updatedAt,
    version: p.__v ?? 0,
  };
  return full ? { ...view, draft: p.draft, published: p.published } : view;
}

function postView(doc, { full = true } = {}) {
  const p = doc.toObject ? doc.toObject() : doc;
  const view = {
    id: String(p._id),
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    status: p.status,
    // Published with a date still to come: it appears by itself then.
    scheduled: p.status === 'published' && !!p.publishedAt && new Date(p.publishedAt) > new Date(),
    publishedAt: p.publishedAt,
    tags: p.tags,
    cover: p.cover,
    author: p.author,
    readingMinutes: p.readingMinutes,
    updatedAt: p.updatedAt,
    url: `/blog/${p.slug}`,
    version: p.__v ?? 0,
  };
  return full ? { ...view, bodyMd: p.bodyMd, bodyHtml: p.bodyHtml, toc: p.toc, previousSlugs: p.previousSlugs, seo: p.seo, createdAt: p.createdAt } : view;
}

function mediaView(doc) {
  const m = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(m._id),
    url: mediaUrl(m),
    thumbUrl: m.thumb ? mediaUrl(m, { thumb: true }) : null,
    name: m.name,
    mime: m.mime,
    width: m.width,
    height: m.height,
    size: m.size,
    alt: m.alt,
    createdAt: m.createdAt,
    version: m.__v ?? 0,
  };
}

// ---------------------------------------------------------------- settings

router.get('/settings', async (req, res) => {
  const doc = await SiteSettings.findById('site');
  const settings = doc || new SiteSettings();
  res.json({ settings: settingsView(settings), effective: seo.effective(settings, req) });
});

/** PUT /settings: each top-level key sent replaces that key. */
router.put('/settings', async (req, res) => {
  const { version, ...fields } = parse(schemas.settingsPut, req.body);
  const doc = (await SiteSettings.findById('site')) || new SiteSettings({ _id: 'site' });
  checkVersion(doc, version);
  for (const [k, v] of Object.entries(fields)) doc.set(k, v);
  doc.updatedBy = req.user._id;
  await doc.save();
  await log(req, 'admin.site_settings_changed', { id: 'site', label: doc.brandName }, { fields: Object.keys(fields) });
  res.json({ settings: settingsView(doc), effective: seo.effective(doc, req) });
});

// ---------------------------------------------------------------- pages

router.get('/pages', async (req, res) => {
  const pages = await SitePage.find().sort({ system: -1, path: 1 }).lean();
  res.json({ pages: pages.map((p) => pageView(p, { full: false })) });
});

router.post('/pages', async (req, res) => {
  const { path, title } = parse(schemas.pageCreate, req.body);
  if (await SitePage.exists({ path })) throw conflict('There is already a page at that address');
  // A new page starts with a heading and a call to action to build on.
  const draft = schemas.parseContent({
    title,
    sections: [
      { type: 'hero', props: { title, visual: 'none', primary: { label: 'Register free', href: '/sign-up' } } },
      { type: 'cta', props: { title: 'Start giving tasks in Karo today.', primary: { label: 'Register free', href: '/sign-up' }, secondary: { label: 'Get the Android app', href: '/get-app' } } },
    ],
  });
  const page = await SitePage.create({ path, draft, status: 'draft', updatedBy: req.user._id });
  await log(req, 'admin.site_page_saved', { id: page._id, label: title }, { path, created: true });
  res.status(201).json({ page: pageView(page) });
});

async function findPage(id) {
  const page = await SitePage.findById(idParam(id));
  if (!page) throw notFound('Page not found');
  return page;
}

router.get('/pages/:id', async (req, res) => {
  res.json({ page: pageView(await findPage(req.params.id)) });
});

router.patch('/pages/:id', async (req, res) => {
  const body = parse(schemas.pagePatch, req.body);
  const page = await findPage(req.params.id);
  checkVersion(page, body.version);
  if (body.path !== undefined && body.path !== page.path) {
    if (page.system) throw badRequest("The site's main pages stay where they are");
    if (!isPagePath(body.path)) throw badRequest('A page lives at /features/<name> or /for/<name> (lowercase letters, numbers and dashes)');
    if (await SitePage.exists({ path: body.path, _id: { $ne: page._id } })) throw conflict('There is already a page at that address');
    page.path = body.path;
  }
  if (body.draft !== undefined) page.draft = schemas.parseContent(body.draft);
  page.updatedBy = req.user._id;
  await page.save();
  await log(req, 'admin.site_page_saved', { id: page._id, label: page.draft.title }, { path: page.path });
  res.json({ page: pageView(page) });
});

router.delete('/pages/:id', async (req, res) => {
  const page = await findPage(req.params.id);
  if (page.system) throw badRequest("The site's main pages can't be deleted");
  await page.deleteOne();
  await log(req, 'admin.site_page_deleted', { id: page._id, label: page.draft?.title }, { path: page.path });
  res.json({ ok: true });
});

router.post('/pages/:id/publish', async (req, res) => {
  const page = await findPage(req.params.id);
  checkVersion(page, req.body?.version);
  // Through JSON, so stored ids read back as the strings the schema expects.
  const draft = schemas.parseContent(JSON.parse(JSON.stringify(page.draft)));
  page.published = { ...draft, publishedAt: new Date() };
  page.status = 'published';
  page.updatedBy = req.user._id;
  await page.save();
  await log(req, 'admin.site_page_published', { id: page._id, label: draft.title }, { path: page.path });
  res.json({ page: pageView(page) });
});

// The home page and the privacy policy are always there (app stores link to /privacy).
const ALWAYS_PUBLISHED = ['/', '/privacy'];

router.post('/pages/:id/unpublish', async (req, res) => {
  const page = await findPage(req.params.id);
  checkVersion(page, req.body?.version);
  if (ALWAYS_PUBLISHED.includes(page.path)) throw badRequest('The home page and the privacy policy always stay published');
  page.status = 'draft';
  page.updatedBy = req.user._id;
  await page.save();
  await log(req, 'admin.site_page_unpublished', { id: page._id, label: page.draft?.title }, { path: page.path });
  res.json({ page: pageView(page) });
});

// ---------------------------------------------------------------- blog posts

const POST_PAGE = 50;

router.get('/posts', async (req, res) => {
  const filter = {};
  const now = new Date();
  if (req.query.status === 'draft') filter.status = 'draft';
  if (req.query.status === 'published') Object.assign(filter, { status: 'published', publishedAt: { $lte: now } });
  if (req.query.status === 'scheduled') Object.assign(filter, { status: 'published', publishedAt: { $gt: now } });
  if (slugify(req.query.tag || '', 40)) Object.assign(filter, tagFilter(req.query.tag));
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q) filter.$or = [{ title: new RegExp(escapeRe(q), 'i') }, { slug: new RegExp(escapeRe(q), 'i') }];
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const [posts, total] = await Promise.all([
    BlogPost.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * POST_PAGE)
      .limit(POST_PAGE)
      .select('-bodyMd -bodyHtml -toc')
      .lean(),
    BlogPost.countDocuments(filter),
  ]);
  res.json({ posts: posts.map((p) => postView(p, { full: false })), page, pages: Math.max(1, Math.ceil(total / POST_PAGE)), total });
});

/** Fill a post's body fields from its Markdown. */
function renderBody(post) {
  const { html, toc, words } = renderMarkdown(post.bodyMd);
  post.bodyHtml = html;
  post.toc = toc;
  post.readingMinutes = readingMinutes(words);
}

/** Make `slug` this post's: no other post may have it, and none keeps it as an old address. */
async function claimSlug(slug, selfId) {
  if (await BlogPost.exists({ slug, _id: { $ne: selfId } })) throw conflict('Another post already uses that address');
  await BlogPost.updateMany({ previousSlugs: slug, _id: { $ne: selfId } }, { $pull: { previousSlugs: slug } });
}

router.post('/posts', async (req, res) => {
  const { version, ...body } = parse(schemas.postCreate, req.body);
  const slug = body.slug || slugify(body.title, 80);
  if (!slug) throw badRequest('Give the post an address (slug) of letters or numbers');
  const post = new BlogPost({ ...body, slug, status: 'draft', publishedAt: body.publishedAt || null, updatedBy: req.user._id });
  await claimSlug(slug, post._id);
  renderBody(post);
  await post.save();
  await log(req, 'admin.site_post_saved', { id: post._id, label: post.title }, { slug, created: true });
  res.status(201).json({ post: postView(post) });
});

async function findPost(id) {
  const post = await BlogPost.findById(idParam(id));
  if (!post) throw notFound('Post not found');
  return post;
}

router.get('/posts/:id', async (req, res) => {
  res.json({ post: postView(await findPost(req.params.id)) });
});

router.patch('/posts/:id', async (req, res) => {
  const { version, ...body } = parse(schemas.postPatch, req.body);
  const post = await findPost(req.params.id);
  checkVersion(post, version);
  if (body.slug && body.slug !== post.slug) {
    await claimSlug(body.slug, post._id);
    // Once visitors could see it, the old address keeps working (301).
    if (post.status === 'published' && !post.previousSlugs.includes(post.slug)) post.previousSlugs.push(post.slug);
    post.previousSlugs = post.previousSlugs.filter((s) => s !== body.slug);
  }
  for (const [k, v] of Object.entries(body)) post.set(k, v);
  if (body.bodyMd !== undefined) renderBody(post);
  post.updatedBy = req.user._id;
  await post.save();
  await log(req, 'admin.site_post_saved', { id: post._id, label: post.title }, { slug: post.slug });
  res.json({ post: postView(post) });
});

router.delete('/posts/:id', async (req, res) => {
  const post = await findPost(req.params.id);
  await post.deleteOne();
  await log(req, 'admin.site_post_deleted', { id: post._id, label: post.title }, { slug: post.slug });
  res.json({ ok: true });
});

router.post('/posts/:id/publish', async (req, res) => {
  const body = parse(schemas.postPatch.pick({ version: true, publishedAt: true }), req.body);
  const post = await findPost(req.params.id);
  checkVersion(post, body.version);
  post.status = 'published';
  post.publishedAt = body.publishedAt || post.publishedAt || new Date();
  post.updatedBy = req.user._id;
  await post.save();
  const scheduled = post.publishedAt > new Date();
  await log(req, 'admin.site_post_published', { id: post._id, label: post.title }, { slug: post.slug, ...(scheduled ? { scheduledFor: post.publishedAt } : {}) });
  res.json({ post: postView(post) });
});

router.post('/posts/:id/unpublish', async (req, res) => {
  const post = await findPost(req.params.id);
  checkVersion(post, req.body?.version);
  post.status = 'draft';
  post.updatedBy = req.user._id;
  await post.save();
  await log(req, 'admin.site_post_unpublished', { id: post._id, label: post.title }, { slug: post.slug });
  res.json({ post: postView(post) });
});

// ---------------------------------------------------------------- pictures

// Under Vercel's ~4.5 MB request cap; the console resizes before it sends.
const MEDIA_MAX_BYTES = 4 * 1024 * 1024;
const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MEDIA_MAX_BYTES, files: 2 } }).fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumb', maxCount: 1 },
]);

function receiveMedia(req, res, next) {
  mediaUpload(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'That picture is too large. Choose one under 4 MB.'));
    if (err instanceof multer.MulterError) return next(badRequest('Send the picture as the "file" field (and its small copy as "thumb").'));
    next(badRequest('Could not read that picture. Please try again.'));
  });
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** What the bytes say the picture is: JPEG, PNG or WebP. Never SVG (it can carry script). */
function sniffImage(buf) {
  if (!buf || buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return { mime: 'image/png', ext: 'png' };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Width and height from the picture's header, or nulls. */
function imageSize(buf, mime) {
  try {
    if (mime === 'image/png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (mime === 'image/webp') {
      const kind = buf.toString('latin1', 12, 16);
      if (kind === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (kind === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
      }
    }
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) return { width: null, height: null };
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        // A start-of-frame marker (not DHT, JPG or DAC) holds the size.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
  } catch {
    /* a header we can't read */
  }
  return { width: null, height: null };
}

router.get('/media', async (req, res) => {
  const filter = {};
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q) filter.$or = [{ name: new RegExp(escapeRe(q), 'i') }, { alt: new RegExp(escapeRe(q), 'i') }];
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const [items, total] = await Promise.all([
    SiteMedia.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * 60)
      .limit(60)
      .lean(),
    SiteMedia.countDocuments(filter),
  ]);
  res.json({ media: items.map(mediaView), page, pages: Math.max(1, Math.ceil(total / 60)), total });
});

/** POST /media (multipart `file`, optional `thumb`, fields `alt`, `name`) → 201 { media } */
router.post('/media', receiveMedia, async (req, res) => {
  const file = req.files?.file?.[0];
  const thumb = req.files?.thumb?.[0];
  if (!file?.buffer?.length) throw badRequest('Choose a picture to upload');
  const kind = sniffImage(file.buffer);
  const thumbKind = thumb ? sniffImage(thumb.buffer) : null;
  if (!kind || (thumb && !thumbKind)) throw badRequest('Choose a JPEG, PNG or WebP picture. SVG and other files cannot be used on the website.');

  const id = new mongoose.Types.ObjectId();
  const ref = { kind: 'site', id };
  const base = slugify(String(req.body?.name || file.originalname || 'image').replace(/\.[a-z0-9]+$/i, ''), 60) || 'image';
  const saved = [];
  try {
    const main = await files.saveFile({ uploadedBy: req.user._id, buffer: file.buffer, name: `${base}.${kind.ext}`, mime: kind.mime, ref });
    saved.push(main.id);
    const small = thumb ? await files.saveFile({ uploadedBy: req.user._id, buffer: thumb.buffer, name: `${base}-small.${thumbKind.ext}`, mime: thumbKind.mime, ref }) : null;
    if (small) saved.push(small.id);
    const media = await SiteMedia.create({
      _id: id,
      file: main.id,
      thumb: small?.id || null,
      name: `${base}.${kind.ext}`,
      mime: kind.mime,
      ...imageSize(file.buffer, kind.mime),
      size: file.buffer.length,
      alt: String(req.body?.alt || '').trim().slice(0, 200),
      uploadedBy: req.user._id,
    });
    await log(req, 'admin.site_media_uploaded', { id: media._id, label: media.name }, { name: media.name });
    res.status(201).json({ media: mediaView(media) });
  } catch (err) {
    await files.deleteFiles(saved);
    throw err;
  }
});

async function findMedia(id) {
  const media = await SiteMedia.findById(idParam(id));
  if (!media) throw notFound('Picture not found');
  return media;
}

router.patch('/media/:id', async (req, res) => {
  const { version, ...body } = parse(schemas.mediaPatch, req.body);
  const media = await findMedia(req.params.id);
  checkVersion(media, version);
  if (body.alt !== undefined) media.alt = body.alt;
  if (body.name) media.name = body.name;
  await media.save();
  res.json({ media: mediaView(media) });
});

router.delete('/media/:id', async (req, res) => {
  const media = await findMedia(req.params.id);
  await files.deleteFiles([media.file, media.thumb].filter(Boolean));
  await media.deleteOne();
  await log(req, 'admin.site_media_deleted', { id: media._id, label: media.name }, { name: media.name });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- previews

/**
 * POST /preview { kind: 'page'|'post', data, path? } → { html }: the page as
 * it would look, never indexed, for the console's sandboxed <iframe srcdoc>.
 */
router.post('/preview', async (req, res) => {
  const { kind, data, path } = parse(schemas.previewInput, req.body);
  const settings = await loadSettings();
  const ctx = context(req, settings, {
    preview: true,
    path: path && path.startsWith('/') ? path : kind === 'post' ? `/blog/${data.slug || 'preview'}` : '/preview',
    // The console's own address: the iframe loads the stylesheet from there.
    previewOrigin: seo.cleanUrl(req.get('origin')) || seo.requestOrigin(req),
    indexable: false,
  });
  let html;
  if (kind === 'page') {
    const content = schemas.parseContent(data);
    await prepare(ctx, content);
    html = renderPage(ctx, content);
  } else {
    const { version, ...body } = parse(schemas.postCreate, data);
    const { html: bodyHtml, toc, words } = renderMarkdown(body.bodyMd);
    const now = new Date();
    const post = { ...body, slug: body.slug || slugify(body.title) || 'preview', bodyHtml, toc, readingMinutes: readingMinutes(words), publishedAt: body.publishedAt || now, updatedAt: now };
    ctx.media = await loadMedia(collectMediaIds([settings.seo, post.cover, post.seo]));
    html = renderPost(ctx, post, { related: [] });
  }
  noStore(res).json({ html: String(html) });
});

/** POST /render-markdown { md } → { html, toc }: the editor's live preview. */
router.post('/render-markdown', (req, res) => {
  const { md } = parse(schemas.markdownInput, req.body);
  const { html, toc } = renderMarkdown(md);
  noStore(res).json({ html, toc });
});

module.exports = router;
