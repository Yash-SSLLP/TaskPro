/**
 * The files robots and feed readers ask for: robots.txt, sitemap.xml,
 * rss.xml and llms.txt.
 */
const { xml } = require('./html');

// The app's screens: nothing there for a search engine.
const APP_PATHS = [
  '/api/',
  '/tasks',
  '/calendar',
  '/recurring',
  '/dashboard',
  '/contacts',
  '/teams',
  '/alerts',
  '/settings',
  '/profile',
  '/console',
  '/platform',
  '/website',
  '/join/',
  '/iphone/',
  '/forgot-password',
  '/reset-password',
];

/** Everything allowed but the app when indexable; nothing at all otherwise. */
function robotsTxt({ indexable, base }) {
  if (!indexable) {
    // Off (or not the site's own host): stay out of search. App-link checks may still read .well-known.
    return 'User-agent: *\nDisallow: /\nAllow: /.well-known/\n';
  }
  return ['User-agent: *', 'Allow: /', ...APP_PATHS.map((p) => `Disallow: ${p}`), '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n');
}

const day = (d) => new Date(d || Date.now()).toISOString();

/**
 * @param {string} base
 * @param {Array<{path, updatedAt}>} pages  published, indexable pages
 * @param {Array<{slug, updatedAt}>} posts  published, indexable posts
 */
function sitemapXml(base, pages, posts) {
  const urls = [
    ...pages.map((p) => ({ loc: `${base}${p.path === '/' ? '/' : p.path}`, lastmod: p.updatedAt })),
    ...(posts.length ? [{ loc: `${base}/blog`, lastmod: posts[0].updatedAt }] : []),
    ...posts.map((p) => ({ loc: `${base}/blog/${p.slug}`, lastmod: p.updatedAt })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xml(u.loc)}</loc><lastmod>${day(u.lastmod)}</lastmod></url>`).join('\n')}
</urlset>
`;
}

function rssXml({ base, settings, posts }) {
  const brand = settings.brandName || 'Karo';
  const title = settings.blog?.title || `The ${brand} blog`;
  const description = settings.blog?.description || settings.tagline || title;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${xml(title)}</title>
  <link>${xml(`${base}/blog`)}</link>
  <atom:link href="${xml(`${base}/rss.xml`)}" rel="self" type="application/rss+xml"/>
  <description>${xml(description)}</description>
  <language>en-IN</language>
${posts
  .map(
    (p) => `  <item>
    <title>${xml(p.title)}</title>
    <link>${xml(`${base}/blog/${p.slug}`)}</link>
    <guid isPermaLink="true">${xml(`${base}/blog/${p.slug}`)}</guid>
    <pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>
    ${p.excerpt ? `<description>${xml(p.excerpt)}</description>` : ''}
${(p.tags || []).map((t) => `    <category>${xml(t)}</category>`).join('\n')}
  </item>`
  )
  .join('\n')}
</channel>
</rss>
`;
}

/** A plain-text map of the site for AI crawlers (llmstxt.org). */
function llmsTxt({ base, settings, pages, posts }) {
  const brand = settings.brandName || 'Karo';
  const line = (title, url, text) => `- [${title}](${url})${text ? `: ${text}` : ''}`;
  return [
    `# ${brand}`,
    '',
    `> ${settings.seo?.defaultDescription || settings.tagline || brand}`,
    '',
    '## Pages',
    '',
    ...pages.map((p) => line(p.title || p.path, `${base}${p.path}`, p.description)),
    '',
    ...(posts.length ? ['## Blog', '', ...posts.map((p) => line(p.title, `${base}/blog/${p.slug}`, p.excerpt)), ''] : []),
  ].join('\n');
}

module.exports = { robotsTxt, sitemapXml, rssXml, llmsTxt };
