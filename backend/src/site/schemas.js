/**
 * What the Super Admin may save, checked with Zod (platform/validate.js).
 *
 * Every section type has its own props (PROPS below), and the console builds
 * its forms from the same list. Text is plain text (the page escapes it);
 * only `richText.md`, `faq.items[].a` and a blog post's body are Markdown.
 * Every link must pass site/links.js isSafeHref. Pictures are SiteMedia ids.
 */
const { z, objectId, parse } = require('../platform/validate');
const { badRequest } = require('../platform/errors');
const { SECTION_TYPES } = require('./models/SitePage');
const { ICON_NAMES } = require('./render/icons');
const { isSafeHref, isRedirectFrom, isPagePath, slugify, SLUG } = require('./links');
const { cleanUrl } = require('./seo');

const str = (max) => z.string().trim().max(max, `must be ${max} characters or fewer`).default('');
const bool = (value = false) => z.boolean().default(value);
const href = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || isSafeHref(v), 'Use a link on this site (starting with /) or one starting with https://, mailto: or tel:')
  .default('');
const link = z.object({ label: str(60), href }).default({});
const image = z.object({ media: objectId.nullable().default(null), alt: str(200) }).default({});
const iconName = z
  .string()
  .trim()
  .refine((v) => v === '' || ICON_NAMES.includes(v), 'Unknown icon')
  .default('');
const list = (item, max) => z.array(item).max(max, `at most ${max} items`).default([]);
const head = { eyebrow: str(80), title: str(160), intro: str(500) };

/** Each section type's props. */
const PROPS = {
  hero: z.object({
    eyebrow: str(80),
    title: str(160),
    subtitle: str(500),
    primary: link,
    secondary: link,
    note: str(200),
    visual: z.enum(['phone', 'image', 'none']).default('phone'),
    image,
  }),
  steps: z.object({ ...head, items: list(z.object({ title: str(120), text: str(500) }), 6) }),
  featureGrid: z.object({ ...head, items: list(z.object({ icon: iconName, title: str(120), text: str(500), href }), 12) }),
  featureSplit: z.object({
    ...head,
    text: str(1500),
    bullets: list(str(300), 8),
    cta: link,
    visual: z.enum(['none', 'image', 'orgTabs', 'chat', 'phone']).default('none'),
    image,
    reverse: bool(),
  }),
  audiences: z.object({ ...head, items: list(z.object({ icon: iconName, title: str(120), text: str(500), href }), 8) }),
  languages: z.object({ ...head, items: list(z.object({ name: str(40), native: str(40) }), 12) }),
  platforms: z.object({ ...head, items: list(z.object({ icon: iconName, title: str(80), text: str(500), cta: link }), 4) }),
  stats: z.object({
    ...head,
    // live: the numbers come from the database (people, organizations, tasks done), cached 10 minutes.
    mode: z.enum(['manual', 'live']).default('live'),
    items: list(z.object({ key: z.enum(['', 'people', 'organizations', 'tasksDone']).default(''), value: str(20), label: str(80) }), 6),
  }),
  testimonials: z.object({ ...head, items: list(z.object({ quote: str(800), name: str(80), role: str(80), org: str(80) }), 12) }),
  faq: z.object({ ...head, ask: str(120), items: list(z.object({ q: str(240), a: str(3000) }), 30) }),
  blogTeaser: z.object({ ...head, count: z.number().int().min(1).max(6).default(3), tag: str(40) }),
  cta: z.object({ title: str(160), text: str(500), primary: link, secondary: link, note: str(200) }),
  richText: z.object({ md: z.string().max(80000, 'must be 80,000 characters or fewer').default('') }),
};

const SECTION_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

const seo = z
  .object({
    title: str(120),
    description: str(320),
    ogImage: objectId.nullable().default(null),
    noindex: bool(),
  })
  .default({});

const sectionInput = z.object({
  id: z.string().trim().regex(SECTION_ID, 'Section ids are lowercase letters, numbers and dashes').optional(),
  type: z.enum(SECTION_TYPES),
  hidden: bool(),
  props: z.record(z.string(), z.unknown()).default({}),
});

const contentInput = z.object({
  title: str(140),
  seo,
  sections: z.array(sectionInput).max(40, 'A page has at most 40 sections').default([]),
});

/** A page's draft: { title, seo, sections } with every section's props checked and ids filled in. */
function parseContent(data) {
  const content = parse(contentInput, data);
  const ids = new Set();
  content.sections = content.sections.map((s, i) => {
    const r = PROPS[s.type].safeParse(s.props);
    if (!r.success) {
      const issue = r.error.issues[0];
      throw badRequest(`Section ${i + 1} (${s.type}): ${[issue.path.join('.'), issue.message].filter(Boolean).join(': ')}`);
    }
    let id = s.id || `${slugify(s.type, 20)}-${i + 1}`;
    while (ids.has(id)) id = `${id}-${ids.size}`;
    ids.add(id);
    return { id, type: s.type, hidden: s.hidden, props: r.data };
  });
  return content;
}

const version = z.number().int().min(0).optional();

const pageCreate = z.object({
  path: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isPagePath, 'A new page lives at /features/<name> or /for/<name> (lowercase letters, numbers and dashes)'),
  title: str(140).pipe(z.string().min(1, 'Give the page a title')),
});

const pagePatch = z.object({
  version,
  path: z.string().trim().toLowerCase().optional(),
  draft: z.unknown().optional(),
});

// ---------------------------------------------------------------- blog

// Tags as written; two that make the same /blog/tag/<slug> are one.
const tags = z
  .array(z.string().trim().max(40, 'A tag is 40 characters or fewer'))
  .max(12, 'At most 12 tags')
  .transform((list) => {
    const seen = new Set();
    return list.filter((t) => {
      const key = slugify(t, 40);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .default([]);
const date = z
  .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.date()])
  .transform((v) => new Date(v))
  .nullable();

const postFields = {
  version,
  title: z.string().trim().min(1, 'Give the post a title').max(140, 'Title must be 140 characters or fewer'),
  slug: z.string().trim().toLowerCase().max(100).regex(SLUG, 'A slug is lowercase letters, numbers and dashes'),
  excerpt: str(320),
  bodyMd: z.string().max(150000, 'The post is too long').default(''),
  cover: image,
  author: z.object({ name: str(80), title: str(80) }).default({}),
  tags,
  publishedAt: date.optional(),
  seo,
};

const postCreate = z.object({ ...postFields, slug: postFields.slug.optional() });
const postPatch = z.object(postFields).partial();

// ---------------------------------------------------------------- settings

const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https:\/\/[^\s/]+\.[^\s]+$/i.test(v), 'Use the full address, starting with https://')
  .default('');

const siteUrl = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || /^https:\/\//i.test(v) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(v), 'The site URL starts with https://')
  .refine((v) => v === '' || !!cleanUrl(v), 'That is not a web address')
  .transform((v) => cleanUrl(v));

const redirect = z
  .object({
    // Lowercase: the site sends any address with capitals to its lowercase form before it looks here.
    from: z.string().trim().toLowerCase().refine(isRedirectFrom, 'A redirect starts from a website address such as /features/old-name (no trailing slash)'),
    to: z.string().trim().refine(isSafeHref, 'Redirect to a page on this site (starting with /) or an https:// address'),
    status: z.union([z.literal(301), z.literal(302)]).default(301),
  })
  .refine((r) => r.from !== r.to, 'A redirect cannot point at itself');

const settingsPut = z
  .object({
    version,
    brandName: z.string().trim().min(1, 'The brand name is needed').max(60),
    tagline: str(200),
    siteUrl,
    indexing: z.boolean(),
    seo: z
      .object({
        titleTemplate: str(80).refine((v) => v === '' || v.includes('%s'), 'The title template needs %s where the page title goes'),
        defaultDescription: str(320),
        defaultOgImage: objectId.nullable().default(null),
        googleSiteVerification: str(200).refine((v) => /^[A-Za-z0-9_-]*$/.test(v), 'Paste only the code from Search Console'),
      })
      .default({}),
    nav: list(z.object({ label: str(40).pipe(z.string().min(1, 'Give each menu link a label')), href: href.pipe(z.string().min(1, 'Give each menu link an address')) }), 10),
    headerCta: z.object({ login: link, register: link }).default({}),
    footer: z
      .object({
        columns: list(z.object({ title: str(60), links: list(link, 12) }), 6),
        note: str(300),
      })
      .default({}),
    socials: z
      .object({
        instagram: httpsUrl,
        youtube: httpsUrl,
        linkedin: httpsUrl,
        x: httpsUrl,
        facebook: httpsUrl,
        // A wa.me link or a number.
        whatsapp: z
          .string()
          .trim()
          .max(300)
          .refine((v) => v === '' || /^https:\/\//i.test(v) || /^\+?[\d\s-]{8,20}$/.test(v), 'Use a wa.me link or a phone number')
          .default(''),
      })
      .default({}),
    contact: z
      .object({
        email: z.union([z.literal(''), z.string().trim().email('That email address does not look right').max(200)]).default(''),
        phone: str(40),
        whatsapp: str(40),
        address: str(300),
      })
      .default({}),
    announcement: z.object({ enabled: bool(), text: str(200), href }).default({}),
    blog: z
      .object({
        title: str(120),
        description: str(320),
        cta: z.object({ title: str(160), text: str(500), primary: link, secondary: link }).default({}),
      })
      .default({}),
    notFound: z.object({ title: str(160), text: str(500) }).default({}),
    redirects: list(redirect, 200),
  })
  .partial();

const mediaPatch = z.object({ version, alt: str(200).optional(), name: z.string().trim().min(1).max(120).optional() });

const previewInput = z.object({ kind: z.enum(['page', 'post']), data: z.record(z.string(), z.unknown()).default({}), path: z.string().trim().max(120).optional() });

const markdownInput = z.object({ md: z.string().max(150000, 'The text is too long').default('') });

module.exports = {
  PROPS,
  parseContent,
  pageCreate,
  pagePatch,
  postCreate,
  postPatch,
  settingsPut,
  mediaPatch,
  previewInput,
  markdownInput,
};
