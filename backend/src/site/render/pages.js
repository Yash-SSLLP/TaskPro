/**
 * Whole pages: a CMS page, the 404 and the error page.
 */
const { html, raw } = require('./html');
const { icon } = require('./icons');
const { layout, mediaUrl } = require('./layout');
const { renderSection, bandOf } = require('./sections');
const { markdownHtml } = require('../markdown');
const seo = require('../seo');

/** Plain text of some sanitized HTML (for JSON-LD answers). */
const textOf = (h) =>
  String(h || '')
    .replace(/<\/?(a|strong|em|code|s)( [^>]*)?>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** Home › (Features ›) <page>, for pages below the top level. */
function crumbsFor(ctx, path, title) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const items = [{ name: 'Home', url: `${ctx.base}/` }];
  if (parts[0] === 'features') items.push({ name: 'Features', url: `${ctx.base}/features` });
  items.push({ name: title, url: seo.absolute(ctx.base, path) });
  return items;
}

/**
 * A CMS page.
 * @param {object} ctx
 * @param {object} content  page.published (or the draft, in a preview): { title, seo, sections }
 */
function renderPage(ctx, content) {
  const sections = (content.sections || []).filter((s) => !s.hidden);
  const heroFirst = sections[0]?.type === 'hero';
  const title = content.title || '';
  const parts = [];
  if (!heroFirst) {
    const intro = content.seo?.description;
    parts.push(html`<header class="page-head">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li aria-current="page">${title}</li></ol></nav>
    <h1>${title}</h1>
    ${intro ? html`<p class="intro">${intro}</p>` : ''}
  </div>
</header>`);
  }
  // Plain and tinted bands take turns; a hero, the CTA band and the navy
  // split paint their own and leave the turn as it was.
  let alt = false;
  sections.forEach((s, i) => {
    const band = bandOf(s);
    const out = renderSection(s, ctx, { h1: heroFirst && i === 0, alt: !band && alt });
    if (!band && String(out)) alt = !alt;
    parts.push(out);
  });

  const nodes = [];
  if (ctx.path === '/') {
    nodes.push(seo.website(ctx.settings, ctx.base), seo.softwareApplication(ctx.settings, ctx.base, content.seo?.description || ctx.settings.seo?.defaultDescription));
  }
  const crumbs = crumbsFor(ctx, ctx.path, title);
  if (crumbs) nodes.push(seo.breadcrumbs(crumbs));
  const faqs = sections.filter((s) => s.type === 'faq').flatMap((s) => (s.props?.items || []).filter((it) => it.q && it.a));
  if (faqs.length) {
    nodes.push({
      '@type': 'FAQPage',
      mainEntity: faqs.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: textOf(markdownHtml(it.a)) } })),
    });
  }

  const og = content.seo?.ogImage ? ctx.media.get(String(content.seo.ogImage)) : null;
  return layout(ctx, {
    title: content.seo?.title || title,
    ogTitle: content.seo?.title || title,
    description: content.seo?.description,
    noindex: !!content.seo?.noindex,
    ogImage: og ? seo.absolute(ctx.base, mediaUrl(og)) : '',
    ogImageSize: og ? { width: og.width, height: og.height } : null,
    ogImageAlt: og?.alt,
    jsonLd: nodes,
    bodyClass: `page${ctx.path === '/' ? ' page-home' : ''}${heroFirst ? '' : ' page-plain'}`,
    main: parts,
  });
}

/** The 404: a real page with a way back, never indexed. */
function renderNotFound(ctx) {
  const brand = ctx.settings.brandName || 'Karo';
  const words = ctx.settings.notFound || {};
  return layout(ctx, {
    title: 'Page not found',
    description: 'This page does not exist. It may have moved.',
    noindex: true,
    navPath: '',
    bodyClass: 'page page-plain page-404',
    main: html`<section class="sec notfound" aria-labelledby="nf-h">
  <div class="wrap wrap-narrow">
    <p class="nf-code" aria-hidden="true">404</p>
    <p class="eyebrow">Error 404</p>
    <h1 id="nf-h">${words.title || 'We could not find that page'}</h1>
    <p class="lead">${words.text || 'The link may be old, or the page may have moved. These are a good place to start:'}</p>
    <ul class="nf-links">
      <li><a href="/"><span class="tile-ic h-total">${icon('home', { size: 20 })}</span><span><b>Home</b><span>What ${brand} is and how it works</span></span></a></li>
      <li><a href="/features"><span class="tile-ic h-progress">${icon('layers', { size: 20 })}</span><span><b>Features</b><span>Everything ${brand} does, in plain words</span></span></a></li>
      <li><a href="/blog"><span class="tile-ic h-review">${icon('news', { size: 20 })}</span><span><b>Blog</b><span>Guides to giving tasks and following up</span></span></a></li>
      <li><a href="/sign-in"><span class="tile-ic h-done">${icon('arrow', { size: 20 })}</span><span><b>Log in to ${brand}</b><span>Back to your tasks</span></span></a></li>
    </ul>
  </div>
</section>`,
  });
}

/** Something broke (the database, say): a plain page that loads nothing it doesn't have to. */
function renderError() {
  return raw(`<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Karo is having a moment</title>
<link rel="stylesheet" href="/site/site.css">
</head>
<body class="page page-plain">
<main id="main" class="sec notfound">
<div class="wrap wrap-narrow">
<h1>Something went wrong</h1>
<p class="lead">Please try again in a minute.</p>
<p><a class="btn btn-primary" href="/">Try again</a> <a class="btn btn-outline" href="/sign-in">Log in</a></p>
</div>
</main>
</body>
</html>
`);
}

module.exports = { renderPage, renderNotFound, renderError };
