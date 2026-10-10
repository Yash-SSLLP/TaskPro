/**
 * The blog: the list of posts (and a tag's posts), and a post.
 */
const { html, raw, attr } = require('./html');
const { icon } = require('./icons');
const { layout, mediaUrl } = require('./layout');
const { postCard, picture, dateText, button } = require('./sections');
const seo = require('../seo');
const { slugify } = require('../links');

const tagHref = (tag) => `/blog/tag/${slugify(tag, 40)}`;

/** ?page=n links a crawler can follow. */
function pager(base, page, pages) {
  if (pages <= 1) return '';
  const href = (n) => (n <= 1 ? base : `${base}?page=${n}`);
  return html`<nav class="pager" aria-label="Pages">
    ${page > 1 ? html`<a class="btn btn-outline btn-sm" href="${href(page - 1)}" rel="prev">Newer posts</a>` : html`<span></span>`}
    <span class="pager-n">Page ${page} of ${pages}</span>
    ${page < pages ? html`<a class="btn btn-outline btn-sm" href="${href(page + 1)}" rel="next">Older posts</a>` : html`<span></span>`}
  </nav>`;
}

/** The tags on these posts, most used first: links to their lists. */
function topics(posts, current) {
  const count = new Map();
  for (const p of posts) for (const t of p.tags || []) if (slugify(t, 40)) count.set(t, (count.get(t) || 0) + 1);
  const list = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 12);
  if (list.length < 2) return '';
  return html`<ul class="topics" aria-label="Topics">${list.map(
    (t) => html`<li><a href="${tagHref(t)}"${attr('aria-current', slugify(t, 40) === current ? 'page' : '')}>${t}</a></li>`
  )}</ul>`;
}

/**
 * /blog and /blog/tag/:tag.
 * @param {{ posts, page, pages, tag?, tagText? }} list  tag: the slug; tagText: as the posts write it
 */
function renderBlogIndex(ctx, { posts, page, pages, tag, tagText }) {
  const blog = ctx.settings.blog || {};
  const brand = ctx.settings.brandName || 'Karo';
  const base = tag ? `/blog/tag/${encodeURIComponent(tag)}` : '/blog';
  const title = tag ? `Posts about ${tagText || tag}` : blog.title || `The ${brand} blog`;
  const description = tag
    ? `Every ${brand} blog post about ${tagText || tag}.`
    : blog.description || `Guides on giving tasks, following up and getting work done with your team, from ${brand}.`;
  // The newest post leads the first page, wide.
  const lead = !tag && page === 1 && posts.length >= 3 ? posts[0] : null;
  const rest = lead ? posts.slice(1) : posts;
  return layout(ctx, {
    title: page > 1 ? `${title} (page ${page})` : title,
    ogTitle: title,
    description,
    canonicalPath: page > 1 ? `${base}?page=${page}` : base,
    // A tag's list repeats the posts: crawl it, don't index it.
    robots: tag ? 'noindex,follow' : undefined,
    bodyClass: 'page page-plain page-blog',
    jsonLd: tag ? [] : [seo.breadcrumbs([{ name: 'Home', url: `${ctx.base}/` }, { name: title, url: `${ctx.base}/blog` }])],
    main: html`<header class="page-head">
  <div class="wrap">
    ${
      tag
        ? html`<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/blog">${blog.title || `The ${brand} blog`}</a></li></ol></nav>`
        : html`<p class="eyebrow">Blog</p>`
    }
    <h1>${title}</h1>
    <p class="intro">${description}</p>
    ${topics(posts, tag)}
  </div>
</header>
<section class="sec sec-blog" aria-label="Posts">
  <div class="wrap">
    ${lead ? postCard(ctx, lead, { level: 'h2', featured: true }) : ''}
    ${
      posts.length
        ? html`<div class="grid grid-3 post-grid">${rest.map((p, i) => postCard(ctx, p, { level: 'h2', index: i + (lead ? 1 : 0) }))}</div>`
        : html`<p class="empty">No posts here yet.</p>`
    }
    ${pager(base, page, pages)}
  </div>
</section>`,
  });
}

/** /blog/:slug */
function renderPost(ctx, post, { related = [] } = {}) {
  const brand = ctx.settings.brandName || 'Karo';
  const url = seo.absolute(ctx.base, `/blog/${post.slug}`);
  const blogTitle = ctx.settings.blog?.title || `The ${brand} blog`;
  const og = ctx.media.get(String(post.seo?.ogImage || '')) || ctx.media.get(String(post.cover?.media || ''));
  const ogUrl = og ? seo.absolute(ctx.base, mediaUrl(og)) : '';
  const crumbs = [
    { name: 'Home', url: `${ctx.base}/` },
    { name: 'Blog', url: `${ctx.base}/blog` },
    { name: post.title, url },
  ];
  const cover = post.cover?.media ? picture(ctx, post.cover, { eager: true, sizes: '(min-width: 1100px) 1040px, 100vw', cls: 'post-cover' }) : '';
  const published = post.publishedAt ? new Date(post.publishedAt) : null;
  const toc = (post.toc || []).filter((t) => t.level === 2);
  const author = post.author?.name || `${brand} team`;
  const initial = author.trim().charAt(0).toUpperCase() || 'K';
  // The box at the end: Website → Settings → Blog, else these words.
  const cta = ctx.settings.blog?.cta || {};
  const ctaLink = (l, label, href) => ({ label: l?.label || label, href: l?.href || href });
  return layout(ctx, {
    title: post.seo?.title || post.title,
    ogTitle: post.seo?.title || post.title,
    description: post.seo?.description || post.excerpt,
    noindex: !!post.seo?.noindex,
    ogType: 'article',
    ogImage: ogUrl,
    ogImageSize: og ? { width: og.width, height: og.height } : null,
    ogImageAlt: og ? post.cover?.alt || og.alt : '',
    head: html`${published ? html`<meta property="article:published_time" content="${published.toISOString()}">` : ''}
<meta property="article:modified_time" content="${new Date(post.updatedAt || published || Date.now()).toISOString()}">
${(post.tags || []).map((t) => html`<meta property="article:tag" content="${t}">`)}`,
    jsonLd: [seo.blogPosting(ctx.settings, ctx.base, post, { url, image: ogUrl }), seo.breadcrumbs(crumbs)],
    bodyClass: 'page page-plain page-post',
    main: html`<article class="post">
  <header class="post-head">
    <div class="wrap wrap-read">
      <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/blog">${blogTitle}</a></li></ol></nav>
      <h1>${post.title}</h1>
      ${post.excerpt ? html`<p class="lead">${post.excerpt}</p>` : ''}
      <div class="byline">
        <span class="avatar" aria-hidden="true">${initial}</span>
        <p><b>${author}</b>${post.author?.title ? html`<span class="byline-role">, ${post.author.title}</span>` : ''}<span class="byline-meta">${
          published ? html`<time datetime="${published.toISOString()}">${dateText(published)}</time><span aria-hidden="true"> · </span>` : ''
        }${post.readingMinutes || 1} min read</span></p>
      </div>
    </div>
  </header>
  ${cover ? html`<div class="wrap post-cover-wrap"><figure class="post-figure">${cover}</figure></div>` : ''}
  <div class="wrap post-layout${toc.length >= 3 ? ' has-toc' : ''}">
    ${
      toc.length >= 3
        ? html`<nav class="toc" aria-label="On this page"><p>On this page</p><ol>${toc.map((t) => html`<li><a href="#${t.id}">${t.text}</a></li>`)}</ol></nav>`
        : ''
    }
    <div class="post-main">
      <div class="prose">${raw(post.bodyHtml)}</div>
      ${post.tags?.length ? html`<ul class="tags" aria-label="Tags">${post.tags.map((t) => html`<li><a href="${tagHref(t)}">${t}</a></li>`)}</ul>` : ''}
      <aside class="post-cta" aria-labelledby="post-cta-h">
        <span class="post-cta-mark" aria-hidden="true"></span>
        <h2 id="post-cta-h">${cta.title || `Give your next task in ${brand}`}</h2>
        <p>${cta.text || 'Free for you and everyone you work with. Set up in a minute, on Android, iPhone or the web.'}</p>
        <div class="actions">${button(ctx, ctaLink(cta.primary, 'Register free', '/sign-up'), 'btn btn-light')}${button(
          ctx,
          ctaLink(cta.secondary, 'Get the Android app', '/get-app'),
          'btn btn-on-band'
        )}</div>
      </aside>
    </div>
  </div>
</article>
${
  related.length
    ? html`<section class="sec sec-related tone-alt" aria-labelledby="related-h">
  <div class="wrap">
    <div class="head-row"><h2 id="related-h">Keep reading</h2><a class="link-arrow" href="/blog">All posts ${icon('arrow', { size: 16 })}</a></div>
    <div class="grid grid-3">${related.map((p, i) => postCard(ctx, p, { index: i }))}</div>
  </div>
</section>`
    : ''
}`,
  });
}

module.exports = { renderBlogIndex, renderPost };
