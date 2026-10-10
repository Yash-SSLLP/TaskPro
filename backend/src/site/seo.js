/**
 * Search engines: which address is the real one, whether this request may be
 * indexed, and the structured data (JSON-LD) a page carries.
 *
 * The site URL is the Super Admin's setting, else SITE_URL, else the address
 * the page was asked on. Indexing is OFF until both: the "let search engines
 * index the site" switch is on (or SITE_INDEXING=on), AND the page is being
 * served on the site URL's own host. So taskpro-self.vercel.app and preview
 * deployments always say noindex, even with indexing on, and every canonical
 * link points at the site URL. (Never redirect taskpro-self.vercel.app: the
 * installed apps call its /api.)
 *
 * SITE_URL and SITE_INDEXING are read here, at the time of the request,
 * rather than in config.js: only the website uses them.
 */

const envSiteUrl = () => cleanUrl(process.env.SITE_URL);
const envIndexing = () => String(process.env.SITE_INDEXING || '').toLowerCase() === 'on';

/** "https://www.karoindia.in/" → "https://www.karoindia.in"; anything not http(s) → "". */
function cleanUrl(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

// The Host header itself: with `trust proxy` on, Express's req.host would take a
// client's X-Forwarded-Host, and these pages are cached for everyone.
const requestHost = (req) => String(req?.get?.('host') || '').toLowerCase();
const requestOrigin = (req) => (req ? `${req.protocol}://${requestHost(req)}` : '');

/** The configured site URL (setting, then SITE_URL), and where it came from. */
function configuredUrl(settings) {
  const own = cleanUrl(settings?.siteUrl);
  if (own) return { url: own, source: 'settings' };
  const env = envSiteUrl();
  if (env) return { url: env, source: 'env' };
  return { url: '', source: 'request' };
}

/** The base every canonical, sitemap and OG link is built on, without a trailing slash. */
const siteBase = (settings, req) => configuredUrl(settings).url || requestOrigin(req);

/** Is indexing switched on (by the setting or SITE_INDEXING=on)? */
const indexingOn = (settings) => envIndexing() || settings?.indexing === true;

/**
 * May this request's page be indexed? Indexing must be on and the page must
 * be served on the configured site URL's host (no site URL set = never).
 */
function isIndexable(settings, req) {
  if (!indexingOn(settings)) return false;
  const { url } = configuredUrl(settings);
  if (!url) return false;
  return new URL(url).host.toLowerCase() === requestHost(req);
}

/** What the console shows next to the switches. */
function effective(settings, req) {
  const { url, source } = configuredUrl(settings);
  return {
    siteUrl: url || requestOrigin(req),
    siteUrlSource: source,
    indexing: indexingOn(settings),
    indexingForced: envIndexing(),
    // Indexed only on this host: empty while no site URL is set.
    indexedHost: indexingOn(settings) && url ? new URL(url).host : '',
  };
}

/** An absolute link on the site. */
const absolute = (base, path) => (/^https?:\/\//i.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`);

// ---------------------------------------------------------------- JSON-LD

const nonEmpty = (list) => list.filter(Boolean);

/** Profile links for `sameAs`, Instagram first. */
function socialUrls(settings) {
  const s = settings?.socials || {};
  return nonEmpty(['instagram', 'youtube', 'linkedin', 'x', 'facebook'].map((k) => (/^https:\/\//i.test(s[k] || '') ? s[k] : '')));
}

function organization(settings, base) {
  return {
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: settings.brandName || 'Karo',
    alternateName: ['Karo India'],
    url: `${base}/`,
    logo: { '@type': 'ImageObject', url: `${base}/apple-touch-icon.png`, width: 180, height: 180 },
    ...(settings.contact?.email ? { email: settings.contact.email } : {}),
    ...(socialUrls(settings).length ? { sameAs: socialUrls(settings) } : {}),
  };
}

function website(settings, base) {
  return {
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    name: settings.brandName || 'Karo',
    alternateName: ['Karo India'],
    url: `${base}/`,
    inLanguage: 'en-IN',
    publisher: { '@id': `${base}/#organization` },
  };
}

// Free, on Android, iPhone (home-screen app) and the web. No ratings: there
// are none to show yet, and Google forbids made-up ones.
function softwareApplication(settings, base, description) {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${base}/#app`,
    name: settings.brandName || 'Karo',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Android, iOS, Web',
    url: `${base}/`,
    description: description || undefined,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    publisher: { '@id': `${base}/#organization` },
  };
}

function blogPosting(settings, base, post, { url, image }) {
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#post`,
    headline: post.title,
    description: post.seo?.description || post.excerpt || undefined,
    url,
    mainEntityOfPage: url,
    image: image || undefined,
    datePublished: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
    dateModified: new Date(post.updatedAt || post.publishedAt || Date.now()).toISOString(),
    author: post.author?.name ? { '@type': 'Person', name: post.author.name, jobTitle: post.author.title || undefined } : { '@id': `${base}/#organization` },
    publisher: { '@id': `${base}/#organization` },
    keywords: post.tags?.length ? post.tags.join(', ') : undefined,
    inLanguage: 'en-IN',
  };
}

function breadcrumbs(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

/** One JSON-LD document holding `nodes`. */
const graph = (nodes) => ({ '@context': 'https://schema.org', '@graph': nonEmpty(nodes) });

module.exports = {
  cleanUrl,
  siteBase,
  indexingOn,
  isIndexable,
  effective,
  absolute,
  requestOrigin,
  socialUrls,
  organization,
  website,
  softwareApplication,
  blogPosting,
  breadcrumbs,
  graph,
};
