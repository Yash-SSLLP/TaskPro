/**
 * One renderer per section type (models/SitePage.js SECTION_TYPES; the props
 * each one reads are in site/schemas.js PROPS). Each gets the section's props,
 * the page context and its options (h1: this section holds the page's h1;
 * alt: paint it on the alternate band), and returns escaped HTML.
 *
 * Only the first section of a page may hold the page's h1 (a hero); every
 * other section's title is an h2 and its items h3.
 *
 * Bands: the page alternates plain and tinted sections (render/pages.js); a
 * hero, the CTA band and the organizations split paint their own (bandOf).
 */
const { html, raw, attr } = require('./html');
const { icon } = require('./icons');
const { MOCKS, stage } = require('./mocks');
const { mediaUrl } = require('./layout');
const { safeHref } = require('../links');
const { markdownHtml, renderMarkdown } = require('../markdown');
const { PROPS } = require('../schemas');

const LANG_CODES = { english: 'en', hindi: 'hi', kannada: 'kn', tamil: 'ta', telugu: 'te', malayalam: 'ml', marathi: 'mr', bengali: 'bn', gujarati: 'gu', punjabi: 'pa', odia: 'or', urdu: 'ur' };

// Each icon's colour: the app's hue for what it means (site.css .h-*).
const HUES = {
  check: 'done', sheet: 'done', shield: 'done', whatsapp: 'done',
  progress: 'progress', chart: 'progress', play: 'progress', globe: 'progress',
  review: 'review', languages: 'review', sparkles: 'review',
  time: 'moretime', clock: 'moretime',
  repeat: 'pending', bell: 'pending', store: 'pending',
  alert: 'overdue',
};
const hueOf = (name) => `h-${HUES[name] || 'total'}`;

/** An icon in its coloured chip. */
const chip = (name, cls = 'tile-ic') => (name ? html`<span class="${cls} ${hueOf(name)}">${icon(name)}</span>` : '');

/** A button for a {label, href} link; nothing when it has no label or a bad link. */
function button(ctx, link, cls) {
  const href = safeHref(link?.href);
  if (!link?.label || !href) return '';
  // No Register button while sign-up is switched off.
  if (ctx.signupEnabled === false && href === '/sign-up') return '';
  const lead = /btn-(primary|light)/.test(cls) ? '' : href === '/get-app' ? icon('download', { size: 18 }) : '';
  const trail = /btn-(primary|light)/.test(cls) ? icon('arrow', { size: 18, cls: 'ic ic-go' }) : '';
  return html`<a class="${cls}" href="${href}">${lead}${link.label}${trail}</a>`;
}

/** "Free · No credit card · …" as a row of ticks. */
function trust(note, cls) {
  const items = String(note || '')
    .split(/\s+·\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!items.length) return '';
  return html`<ul class="${cls}">${items.map((t) => html`<li>${icon('check', { size: 16 })}<span>${t}</span></li>`)}</ul>`;
}

/** Eyebrow, title and intro over a section. */
function sectionHead(p, id, { cls = 'sec-head' } = {}) {
  if (!p.eyebrow && !p.title && !p.intro) return '';
  return html`<div class="${cls}">
    ${p.eyebrow ? html`<p class="eyebrow">${p.eyebrow}</p>` : ''}
    ${p.title ? html`<h2 id="${id}-h">${p.title}</h2>` : ''}
    ${p.intro ? html`<p class="intro">${p.intro}</p>` : ''}
  </div>`;
}

/** A picture from the media library, with its small copy for narrow screens. */
function picture(ctx, img, { eager = false, sizes = '(min-width: 960px) 560px, 100vw', cls = '' } = {}) {
  const item = img?.media ? ctx.media.get(String(img.media)) : null;
  if (!item) return '';
  const full = mediaUrl(item);
  const srcset = item.thumb ? `${mediaUrl(item, { thumb: true })} 640w, ${full} ${item.width || 1600}w` : '';
  return html`<img${attr('class', cls)} src="${full}"${attr('srcset', srcset)}${attr('sizes', srcset ? sizes : '')}${attr('width', item.width)}${attr('height', item.height)} alt="${img.alt || item.alt || ''}"${
    eager ? raw(' fetchpriority="high" decoding="async"') : raw(' loading="lazy" decoding="async"')
  }>`;
}

/** Plain text in paragraphs: a blank line starts a new one. */
const paragraphs = (text) =>
  String(text || '')
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => html`<p>${t}</p>`);

const wrapSection = (s, cls, inner, labelled = true, opts = {}) =>
  html`<section class="sec sec-${s.type}${cls ? ` ${cls}` : ''}${opts.alt ? ' tone-alt' : ''}" id="${s.id}"${attr('aria-labelledby', labelled ? `${s.id}-h` : '')}>${inner}</section>`;

/** A section that paints its own band ('hero', 'navy'), or '' for one that takes the page's alternation. */
function bandOf(section) {
  if (section.type === 'hero') return 'hero';
  if (section.type === 'cta') return 'navy';
  if (section.type === 'featureSplit' && section.props?.visual === 'orgTabs') return 'navy';
  return '';
}

// ---------------------------------------------------------------- the types

function hero(s, ctx, { h1 }) {
  const p = s.props;
  const visual = p.visual === 'image' ? picture(ctx, p.image, { eager: h1, cls: 'hero-img' }) : p.visual === 'phone' ? stage() : '';
  return wrapSection(
    s,
    visual ? `hero has-visual${p.visual === 'phone' ? ' has-stage' : ''}` : 'hero',
    html`<div class="wrap hero-in">
    <div class="hero-copy">
      ${p.eyebrow ? html`<p class="eyebrow">${p.eyebrow}</p>` : ''}
      ${h1 ? html`<h1 id="${s.id}-h">${p.title}</h1>` : html`<h2 class="h1" id="${s.id}-h">${p.title}</h2>`}
      ${p.subtitle ? html`<p class="lead">${p.subtitle}</p>` : ''}
      <div class="actions">${button(ctx, p.primary, 'btn btn-primary btn-lg')}${button(ctx, p.secondary, 'btn btn-outline btn-lg')}</div>
      ${trust(p.note, 'trust')}
    </div>
    ${visual ? html`<div class="hero-visual">${visual}</div>` : ''}
  </div>`,
    !!p.title
  );
}

function steps(s, ctx, opts) {
  const p = s.props;
  return wrapSection(
    s,
    '',
    html`<div class="wrap">
    ${sectionHead(p, s.id)}
    <ol class="steps steps-${Math.min(p.items.length, 4)}">${p.items.map(
      (it, i) => html`<li class="step"><span class="step-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><h3>${it.title}</h3><p>${it.text}</p></li>`
    )}</ol>
  </div>`,
    !!p.title,
    opts
  );
}

/** Rows that come out even: four across for 4, 8, 12; three for 3, 6, 9. */
const columnsFor = (n) => (n % 4 === 0 ? 4 : n % 3 === 0 ? 3 : 4);

function featureGrid(s, ctx, opts) {
  const p = s.props;
  return wrapSection(
    s,
    '',
    html`<div class="wrap">
    ${sectionHead(p, s.id)}
    <ul class="grid grid-4 cols-${columnsFor(p.items.length)}">${p.items.map(
      (it) => html`<li class="card tile">
        ${chip(it.icon)}
        <h3>${safeHref(it.href) ? html`<a class="tile-link" href="${safeHref(it.href)}">${it.title}</a>` : it.title}</h3>
        <p>${it.text}</p>
      </li>`
    )}</ul>
  </div>`,
    !!p.title,
    opts
  );
}

function featureSplit(s, ctx, opts) {
  const p = s.props;
  const visual = p.visual === 'image' ? picture(ctx, p.image, { cls: 'split-img' }) : MOCKS[p.visual] ? MOCKS[p.visual]({ brand: ctx.settings.brandName || 'Karo' }) : '';
  const navy = bandOf(s) === 'navy';
  return wrapSection(
    s,
    `${visual ? 'has-visual' : ''}${p.reverse ? ' is-reverse' : ''}${navy ? ' band band-split' : ''}`,
    html`<div class="wrap split">
    <div class="split-copy">
      ${p.eyebrow ? html`<p class="eyebrow">${p.eyebrow}</p>` : ''}
      ${p.title ? html`<h2 id="${s.id}-h">${p.title}</h2>` : ''}
      ${p.intro ? html`<p class="intro">${p.intro}</p>` : ''}
      ${paragraphs(p.text)}
      ${p.bullets.length ? html`<ul class="checks">${p.bullets.filter(Boolean).map((b) => html`<li>${icon('check', { size: 20 })}<span>${b}</span></li>`)}</ul>` : ''}
      ${button(ctx, p.cta, navy ? 'btn btn-on-band' : 'btn btn-outline')}
    </div>
    ${visual ? html`<div class="split-media">${visual}</div>` : ''}
  </div>`,
    !!p.title,
    navy ? {} : opts
  );
}

function audiences(s, ctx, opts) {
  const p = s.props;
  return wrapSection(
    s,
    '',
    html`<div class="wrap">
    ${sectionHead(p, s.id)}
    <ul class="grid grid-3 audiences">${p.items.map((it, i) => {
      const href = safeHref(it.href);
      const inner = html`<span class="aud-art aud-${(i % 3) + 1}" aria-hidden="true">${it.icon ? html`<span class="aud-ic">${icon(it.icon, { size: 28 })}</span>` : ''}</span>
        <div class="aud-body"><h3>${it.title}</h3><p>${it.text}</p>${href ? html`<span class="more">See how ${icon('arrow', { size: 16 })}</span>` : ''}</div>`;
      return html`<li>${href ? html`<a class="card aud card-link" href="${href}">${inner}</a>` : html`<div class="card aud">${inner}</div>`}</li>`;
    })}</ul>
  </div>`,
    !!p.title,
    opts
  );
}

function languages(s, ctx, opts) {
  const p = s.props;
  return wrapSection(
    s,
    '',
    html`<div class="wrap">
    ${sectionHead(p, s.id)}
    <ul class="langs">${p.items.map(
      (it) => html`<li><span class="lang-native"${attr('lang', LANG_CODES[String(it.name).toLowerCase()])}>${it.native || it.name}</span>${
        it.native && it.name ? html`<span class="lang-name">${it.name}</span>` : ''
      }</li>`
    )}</ul>
  </div>`,
    !!p.title,
    opts
  );
}

function platforms(s, ctx, opts) {
  const p = s.props;
  return wrapSection(
    s,
    '',
    html`<div class="wrap">
    ${sectionHead(p, s.id)}
    <ul class="grid grid-3">${p.items.map(
      (it) => html`<li class="card tile platform">
        ${chip(it.icon)}
        <h3>${it.title}</h3>
        <p>${it.text}</p>
        ${button(ctx, it.cta, 'btn btn-outline btn-sm')}
      </li>`
    )}</ul>
  </div>`,
    !!p.title,
    opts
  );
}

const formatCount = (n) => Number(n || 0).toLocaleString('en-IN');

function stats(s, ctx, opts) {
  const p = s.props;
  const items = p.items
    .map((it) => ({ label: it.label, value: p.mode === 'live' && it.key ? formatCount(ctx.stats?.[it.key]) : it.value }))
    .filter((it) => it.label && it.value);
  if (!items.length) return '';
  return wrapSection(
    s,
    '',
    html`<div class="wrap">
    ${sectionHead(p, s.id)}
    <dl class="stats">${items.map((it) => html`<div class="stat"><dt>${it.label}</dt><dd>${it.value}</dd></div>`)}</dl>
  </div>`,
    !!p.title,
    opts
  );
}

function testimonials(s, ctx, opts) {
  const p = s.props;
  const items = p.items.filter((it) => it.quote && it.name);
  if (!items.length) return '';
  return wrapSection(
    s,
    '',
    html`<div class="wrap">
    ${sectionHead(p, s.id)}
    <ul class="grid grid-3">${items.map(
      (it) => html`<li><figure class="card quote">
        <blockquote><p>${it.quote}</p></blockquote>
        <figcaption><b>${it.name}</b>${[it.role, it.org].filter(Boolean).length ? html`<span>${[it.role, it.org].filter(Boolean).join(', ')}</span>` : ''}</figcaption>
      </figure></li>`
    )}</ul>
  </div>`,
    !!p.title,
    opts
  );
}

function faq(s, ctx, opts) {
  const p = s.props;
  const items = p.items.filter((it) => it.q && it.a);
  const email = ctx.settings.contact?.email || '';
  return wrapSection(
    s,
    '',
    html`<div class="wrap faq-wrap">
    <div class="faq-side">
      ${sectionHead(p, s.id, { cls: 'sec-head sec-head-left' })}
      <div class="faq-ask">
        <span class="tile-ic h-total">${icon('mail')}</span>
        <p><b>${p.ask || 'Still have a question?'}</b>${
          email ? html` Write to us at <a href="mailto:${email}">${email}</a>.` : html` <a href="/contact">Get in touch</a>.`
        }</p>
      </div>
    </div>
    <div class="faq">${items.map(
      (it) => html`<details>
        <summary><h3>${it.q}</h3>${icon('plus', { size: 20, cls: 'ic faq-ic' })}</summary>
        <div class="faq-a prose">${raw(markdownHtml(it.a))}</div>
      </details>`
    )}</div>
  </div>`,
    !!p.title,
    opts
  );
}

/** Day Month Year, as India writes it. */
const dateText = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');

/** A post without a cover gets a drawn one: its first tag on a brand panel. */
function fallbackCover(post, i = 0) {
  return html`<span class="cover-art cover-${(i % 3) + 1}" aria-hidden="true"><span class="cover-mark"></span>${post.tags?.length ? html`<span class="cover-tag">${post.tags[0]}</span>` : ''}</span>`;
}

/** A post as a card (blog teaser, blog index, related posts). */
function postCard(ctx, post, { level = 'h3', index = 0, featured = false } = {}) {
  const href = `/blog/${post.slug}`;
  const cover = post.cover?.media
    ? picture(ctx, post.cover, { sizes: featured ? '(min-width: 960px) 600px, 100vw' : '(min-width: 960px) 380px, 100vw', cls: 'post-card-img' })
    : fallbackCover(post, index);
  const title = level === 'h2' ? html`<h2><a href="${href}">${post.title}</a></h2>` : html`<h3><a href="${href}">${post.title}</a></h3>`;
  return html`<article class="card post-card${featured ? ' is-featured' : ''}">
    <a class="post-card-cover" href="${href}" tabindex="-1" aria-hidden="true">${cover}</a>
    <div class="post-card-body">
      ${post.tags?.length ? html`<p class="post-tag">${post.tags[0]}</p>` : ''}
      ${title}
      ${post.excerpt ? html`<p class="post-excerpt">${post.excerpt}</p>` : ''}
      <p class="post-meta"><time datetime="${new Date(post.publishedAt).toISOString()}">${dateText(post.publishedAt)}</time><span aria-hidden="true"> · </span>${post.readingMinutes || 1} min read</p>
    </div>
  </article>`;
}

function blogTeaser(s, ctx, opts) {
  const p = s.props;
  const posts = (ctx.teaserPosts || []).slice(0, p.count);
  if (!posts.length) return '';
  return wrapSection(
    s,
    '',
    html`<div class="wrap">
    <div class="head-row">
      ${sectionHead(p, s.id, { cls: 'sec-head sec-head-left' })}
      <a class="link-arrow" href="/blog">All posts ${icon('arrow', { size: 16 })}</a>
    </div>
    <div class="grid grid-3">${posts.map((post, i) => postCard(ctx, post, { index: i }))}</div>
  </div>`,
    !!p.title,
    opts
  );
}

function cta(s, ctx) {
  const p = s.props;
  return wrapSection(
    s,
    'band band-cta',
    html`<div class="wrap band-in">
    ${p.title ? html`<h2 id="${s.id}-h">${p.title}</h2>` : ''}
    ${p.text ? html`<p class="intro">${p.text}</p>` : ''}
    <div class="actions">${button(ctx, p.primary, 'btn btn-light btn-lg')}${button(ctx, p.secondary, 'btn btn-on-band btn-lg')}</div>
    ${trust(p.note, 'trust trust-band')}
  </div>`,
    !!p.title
  );
}

/** Markdown; a long one (four or more sections) gets "On this page" beside it. */
function richText(s, ctx, opts) {
  const { html: body, toc } = renderMarkdown(s.props.md);
  const parts = toc.filter((t) => t.level === 2);
  if (parts.length < 4) return wrapSection(s, '', html`<div class="wrap"><div class="prose">${raw(body)}</div></div>`, false, opts);
  return wrapSection(
    s,
    'has-toc',
    html`<div class="wrap read-grid">
    <nav class="toc" aria-label="On this page"><p>On this page</p><ol>${parts.map((t) => html`<li><a href="#${t.id}">${t.text}</a></li>`)}</ol></nav>
    <div class="prose">${raw(body)}</div>
  </div>`,
    false,
    opts
  );
}

const RENDERERS = { hero, steps, featureGrid, featureSplit, audiences, languages, platforms, stats, testimonials, faq, blogTeaser, cta, richText };

/**
 * One section, or '' for a type this build does not know. Its props are read
 * through the type's schema, so a section saved before a field existed still
 * gets that field's default.
 */
function renderSection(section, ctx, opts = {}) {
  const fn = RENDERERS[section.type];
  const props = fn && PROPS[section.type].safeParse(section.props || {});
  if (!props?.success) return '';
  return fn({ ...section, props: props.data }, ctx, opts);
}

module.exports = { renderSection, bandOf, postCard, picture, dateText, button, trust };
