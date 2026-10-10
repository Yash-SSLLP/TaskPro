const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const mongoose = require('mongoose');
const h = require('./helpers');
const { ensureSiteDefaults } = require('../src/site');
const { renderMarkdown } = require('../src/site/markdown');
const SitePage = require('../src/site/models/SitePage');
const BlogPost = require('../src/site/models/BlogPost');
const SiteSettings = require('../src/site/models/SiteSettings');
const defaults = require('../src/site/defaults');

before(async () => {
  await h.start();
  await ensureSiteDefaults();
});
after(h.stop);

const site = (url, host) => {
  const req = h.request().get(url);
  return host ? req.set('Host', host) : req;
};

/** The JSON-LD blocks of a page, parsed. */
const jsonLdOf = (text) => [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

/** Change the site settings as the Super Admin (each key replaces that key). */
async function settings(root, patch) {
  const res = await root.put('/api/site/settings', patch);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

describe('public pages', () => {
  test('the home page: title, canonical, Open Graph, JSON-LD, one h1, CSP and no Vary: Origin', async () => {
    const res = await site('/').set('Origin', 'https://elsewhere.example');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^text\/html/);
    assert.match(res.text, /^<!doctype html>\n<html lang="en-IN">/);
    assert.match(res.text, /<title>Karo: Free Task Delegation App for Indian Teams<\/title>/);
    assert.match(res.text, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/">/);
    assert.match(res.text, /<meta property="og:title" content="Karo: Free Task Delegation App for Indian Teams">/);
    assert.match(res.text, /<meta property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/site\/og-default\.png">/);
    assert.match(res.text, /<meta property="og:locale" content="en_IN">/);
    assert.match(res.text, /<meta name="twitter:card" content="summary_large_image">/);
    assert.equal((res.text.match(/<h1[\s>]/g) || []).length, 1, 'one h1');
    assert.match(res.text, /<h1 id="hero-h">In Karo, you give a task once\. It gets done\.<\/h1>/);
    assert.match(res.text, /href="\/sign-in"/);
    assert.match(res.text, /href="\/sign-up"/);
    assert.match(res.text, /class="phone" aria-hidden="true"/, 'the drawn phone is decorative');

    const graph = jsonLdOf(res.text)[0]['@graph'];
    const types = graph.map((n) => n['@type']);
    for (const t of ['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage']) assert.ok(types.includes(t), t);
    const app = graph.find((n) => n['@type'] === 'SoftwareApplication');
    assert.deepEqual(app.offers, { '@type': 'Offer', price: '0', priceCurrency: 'INR' });
    assert.equal(app.aggregateRating, undefined, 'no made-up ratings');
    assert.deepEqual(graph.find((n) => n['@type'] === 'Organization').alternateName, ['Karo India']);

    // Scripts only from this origin, never inline (JSON-LD is data).
    assert.match(res.headers['content-security-policy'], /script-src 'self'/);
    assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.doesNotMatch(res.text, /<script>/);
    assert.doesNotMatch(String(res.headers.vary || ''), /Origin/, 'cached once for everyone');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    assert.equal(res.headers['set-cookie'], undefined);
    assert.equal(res.headers['cache-control'], 'public, max-age=60');
    assert.equal(res.headers['vercel-cdn-cache-control'], 'max-age=60, stale-while-revalidate=86400');
  });

  test('every starter page and post is there; the API is untouched', async () => {
    for (const path of ['/features', '/about', '/contact', '/privacy', '/terms', '/for/business-owners', '/for/shops-and-outlets', '/for/offices', '/blog']) {
      const res = await site(path);
      assert.equal(res.status, 200, path);
      assert.doesNotMatch(res.text, /KARO/, `${path}: the name is written Karo`);
      assert.doesNotMatch(res.text, /\btemplates?\b/i, `${path}: there are no templates`);
    }
    for (const slug of ['what-is-a-task-pin', 'how-to-delegate-tasks-to-employees', 'whatsapp-groups-vs-task-app']) {
      assert.equal((await site(`/blog/${slug}`)).status, 200, slug);
    }
    const privacy = await site('/privacy');
    assert.match(privacy.text, /<h1>Privacy policy<\/h1>/);
    assert.match(privacy.text, /We do not sell your information/);
    assert.match(privacy.text, /href="\/delete-account"/);
    assert.match(privacy.text, /Last updated: 11 October 2026/);
    assert.doesNotMatch(privacy.text, /email and mobile number are never shown/);
    assert.doesNotMatch((await site('/blog/what-is-a-task-pin')).text, /mobile number are never shown/);

    const health = await h.request().get('/api/health').set('Origin', 'https://elsewhere.example');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.headers['access-control-allow-origin'], 'https://elsewhere.example');
    assert.equal(health.headers['content-security-policy'], undefined, 'the CSP is for the site only');
    assert.equal((await h.request().get('/api/nope')).body.error, 'Not found');
  });

  test('the /privacy page says what the apps’ policy (privacy.js) says, word for word', async () => {
    const file = path.join(__dirname, '../../web/src/platform/privacy.js');
    const { PRIVACY } = await import(pathToFileURL(file).href);
    const block = (b) => (typeof b === 'string' ? b : b.list.map((x) => `- ${x}`).join('\n'));
    const expected = [`_Last updated: ${PRIVACY.updated}_`, ...PRIVACY.intro, ...PRIVACY.sections.flatMap((s) => [`# ${s.title}`, ...s.body.map(block)])].join('\n\n');
    const seeded = defaults.PAGES.find((p) => p.path === '/privacy').sections[0].props.md;
    // The page may turn words into links; the words themselves must match.
    const words = (md) => md.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/"/g, '');
    assert.equal(words(seeded), words(expected), 'update PRIVACY_MD in backend/src/site/defaults.js to match privacy.js');
  });

  test('an unknown site address is a real HTML 404, never indexed', async () => {
    for (const path of ['/features/no-such-thing', '/for/nobody', '/blog/no-such-post', '/blog/tag/nothing-here', '/for']) {
      const res = await site(path);
      assert.equal(res.status, 404, path);
      assert.match(res.headers['content-type'], /^text\/html/);
      assert.match(res.text, /<meta name="robots" content="noindex">/);
      assert.equal(res.headers['x-robots-tag'], 'noindex');
      assert.match(res.text, /We could not find that page/);
    }
    assert.equal((await site('/blog?page=99')).status, 404);
    assert.equal((await site('/blog?page=abc')).status, 404);
  });

  test('a trailing slash or capitals: 301 to the one clean address, query kept', async () => {
    const slash = await site('/features/?ref=x');
    assert.equal(slash.status, 301);
    assert.equal(slash.headers.location, '/features?ref=x');
    assert.equal((await site('/blog/')).headers.location, '/blog');
    assert.equal((await site('/blog/What-Is-A-Task-Pin')).headers.location, '/blog/what-is-a-task-pin');
    assert.equal((await site('/blog//x/')).headers.location, '/blog/x', 'never a //host address');
    assert.equal((await site('/blog?page=1')).headers.location, '/blog');
    for (const [from, to] of [['/Privacy', '/privacy'], ['/FEATURES?x=1', '/features?x=1'], ['/Blog', '/blog']]) {
      const res = await site(from);
      assert.equal(res.status, 301, from);
      assert.equal(res.headers.location, to, from);
    }
  });

  test('robots.txt, the sitemap and the feeds', async () => {
    const robots = await site('/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(robots.headers['content-type'], /^text\/plain/);
    assert.equal(robots.headers['cache-control'], 'public, max-age=3600');
    assert.match(robots.text, /^User-agent: \*\nDisallow: \/\n/, 'indexing is off until it is switched on');

    const rss = await site('/rss.xml');
    assert.equal(rss.status, 200);
    assert.match(rss.text, /<rss version="2\.0"/);
    assert.match(rss.text, /<link>http:\/\/127\.0\.0\.1:\d+\/blog\/what-is-a-task-pin<\/link>/);
    assert.match(rss.text, /<category>WhatsApp<\/category>/);

    const llms = await site('/llms.txt');
    assert.equal(llms.status, 200);
    assert.match(llms.text, /^# Karo\n/);
  });
});

describe('search engines', () => {
  test('noindex until indexing is on AND the page is served on the site URL host', async () => {
    const root = await h.root();
    const host = 'www.karoindia.in';
    const noindex = (res) => {
      assert.match(res.text, /<meta name="robots" content="noindex">/);
      assert.equal(res.headers['x-robots-tag'], 'noindex');
    };

    // Off: noindex everywhere, robots says keep out, canonical already on the site URL.
    const set = await settings(root, { siteUrl: 'https://www.karoindia.in/some/path', indexing: false });
    assert.equal(set.settings.siteUrl, 'https://www.karoindia.in', 'only the origin is kept');
    assert.deepEqual(
      { url: set.effective.siteUrl, source: set.effective.siteUrlSource, on: set.effective.indexing },
      { url: 'https://www.karoindia.in', source: 'settings', on: false }
    );
    let res = await site('/features', host);
    noindex(res);
    assert.match(res.text, /<link rel="canonical" href="https:\/\/www\.karoindia\.in\/features">/);
    assert.match((await site('/robots.txt', host)).text, /^User-agent: \*\nDisallow: \/\n/);

    // On, but asked on another host (taskpro-self.vercel.app, a preview): still noindex.
    await settings(root, { indexing: true });
    res = await site('/features', 'taskpro-self.vercel.app');
    noindex(res);
    assert.match(res.text, /<link rel="canonical" href="https:\/\/www\.karoindia\.in\/features">/);
    assert.match((await site('/robots.txt', 'taskpro-self.vercel.app')).text, /Disallow: \/\n/);

    // On, on the right host: indexable, and robots names the sitemap.
    res = await site('/features', host);
    assert.equal(res.status, 200);
    assert.match(res.text, /<meta name="robots" content="index,follow,max-image-preview:large">/);
    assert.equal(res.headers['x-robots-tag'], undefined);
    const robots = await site('/robots.txt', host);
    assert.match(robots.text, /^User-agent: \*\nAllow: \//);
    assert.match(robots.text, /Disallow: \/api\//);
    assert.match(robots.text, /Disallow: \/tasks/);
    assert.match(robots.text, /Sitemap: https:\/\/www\.karoindia\.in\/sitemap\.xml/);
    // A tag's list is followed, never indexed; a page marked noindex stays out.
    const tagPage = await site('/blog/tag/delegation', host);
    assert.equal(tagPage.status, 200);
    assert.match(tagPage.text, /<meta name="robots" content="noindex,follow">/);
    assert.match(tagPage.text, /<h1>Posts about Delegation<\/h1>/);

    // A forwarded host from the client never counts: not for indexing, not for links.
    res = await site('/features', 'taskpro-self.vercel.app').set('X-Forwarded-Host', host);
    noindex(res);

    // No site URL at all: never indexable, whatever the switch says.
    await settings(root, { siteUrl: '' });
    noindex(await site('/features', host));
    await settings(root, { indexing: false });
    const forged = await site('/').set('X-Forwarded-Host', 'evil.example');
    assert.match(forged.text, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/">/);
    assert.doesNotMatch(forged.text, /evil\.example/);
  });

  test('the sitemap lists published, indexable pages and posts only', async () => {
    const root = await h.root();
    const draftPage = (await root.post('/api/site/pages', { path: '/features/draft-only', title: 'Draft only' })).body.page;
    const draftPost = (await root.post('/api/site/posts', { title: 'Not yet', bodyMd: 'Soon.' })).body.post;
    const hidden = (await root.post('/api/site/posts', { title: 'Hidden from search', bodyMd: 'Shh.', seo: { noindex: true } })).body.post;
    assert.equal((await root.post(`/api/site/posts/${hidden.id}/publish`)).status, 200);

    const res = await site('/sitemap.xml');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /^application\/xml/);
    const locs = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    for (const p of ['/', '/features', '/privacy', '/for/offices', '/blog', '/blog/what-is-a-task-pin']) assert.ok(locs.includes(p), p);
    assert.ok(!locs.includes(draftPage.path), 'no draft page');
    assert.ok(!locs.includes(`/blog/${draftPost.slug}`), 'no draft post');
    assert.ok(!locs.includes(`/blog/${hidden.slug}`), 'no noindex post');
    assert.ok(!locs.some((p) => p.startsWith('/blog/tag/')), 'no tag lists');
    assert.match(res.text, /<lastmod>\d{4}-\d\d-\d\dT/);
    assert.equal((await site(`/blog/${hidden.slug}`)).headers['x-robots-tag'], 'noindex');
  });
});

describe('escaping and sanitizing', () => {
  test('what the Super Admin types is shown as text, never run', async () => {
    const root = await h.root();
    const evil = '"><script>alert(1)</script><img src=x onerror=alert(2)>';
    await settings(root, {
      tagline: evil,
      footer: { columns: [{ title: evil, links: [{ label: evil, href: '/about' }] }], note: evil },
      announcement: { enabled: true, text: evil, href: '/features' },
      seo: { defaultDescription: evil, titleTemplate: '%s · Karo' },
    });
    const post = (await root.post('/api/site/posts', { title: `Title ${evil}`, excerpt: evil, bodyMd: 'Hello' })).body.post;
    await root.post(`/api/site/posts/${post.id}/publish`);

    for (const path of ['/', `/blog/${post.slug}`, '/blog']) {
      const res = await site(path);
      assert.equal(res.status, 200, path);
      assert.doesNotMatch(res.text, /<script>alert|<img src=x|onerror=alert\(2\)>/, path);
      assert.match(res.text, /&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/, path);
    }
    // Inside JSON-LD a "<" is <, so it can never close the block.
    const postPage = await site(`/blog/${post.slug}`);
    assert.doesNotMatch(postPage.text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1], /</);
    const graph = jsonLdOf(postPage.text)[0]['@graph'];
    assert.equal(graph.find((n) => n['@type'] === 'BlogPosting').headline, `Title ${evil}`);
    assert.ok(graph.find((n) => n['@type'] === 'BreadcrumbList'));

    // Links are checked when saved.
    const bad = await root.put('/api/site/settings', { nav: [{ label: 'x', href: 'javascript:alert(1)' }] });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /link/);
    assert.equal((await root.put('/api/site/settings', { nav: [{ label: 'x', href: '//evil.example' }] })).status, 400);
    assert.equal((await root.put('/api/site/settings', { socials: { instagram: 'javascript:alert(1)' } })).status, 400);

    const { tagline, footer, announcement, seo } = defaults.SETTINGS;
    await settings(root, { tagline, footer, announcement, seo });
  });

  test('Markdown: no raw HTML, no script, no javascript: links, headings get ids', () => {
    const { html, toc } = renderMarkdown(
      [
        '# Start here',
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '[click](javascript:alert(1)) [data](data:text/html;base64,PHNjcmlwdD4=) [ok](/features) [web](https://example.com)',
        '![pic](javascript:alert(1)) ![lib](/media/0123456789abcdef01234567/a.png) ![far](https://example.com/far.png)',
        '## Start here',
      ].join('\n\n')
    );
    // Raw HTML and bad links stay as plain text: no tag, no attribute, no link.
    assert.doesNotMatch(html, /<script|<img[^>]*onerror|(href|src)="(javascript|data):/i);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'shown as text');
    assert.match(html, /\[click\]\(javascript:alert\(1\)\)/, 'a refused link is left as text');
    assert.match(html, /<a href="\/features">ok<\/a>/);
    assert.match(html, /<a href="https:\/\/example\.com" rel="noopener noreferrer" target="_blank">web<\/a>/);
    assert.match(html, /<img src="\/media\/0123456789abcdef01234567\/a\.png" alt="lib"/);
    assert.doesNotMatch(html, /far\.png/, 'a picture from elsewhere is dropped: the CSP would block it');
    assert.match(html, /<h2 id="start-here">Start here<\/h2>/, '# becomes h2: the page has the h1');
    assert.match(html, /<h3 id="start-here-2">/);
    assert.deepEqual(toc, [
      { id: 'start-here', text: 'Start here', level: 2 },
      { id: 'start-here-2', text: 'Start here', level: 3 },
    ]);

    // A table's column alignment is a class: the site's CSP allows no style="".
    const table = renderMarkdown('| a | b | c |\n|--:|:-:|---|\n| 1 | 2 | 3 |').html;
    assert.match(table, /<th class="ta-right">a<\/th>/);
    assert.match(table, /<td class="ta-center">2<\/td>/);
    assert.doesNotMatch(table, /style=/);
  });

  test('a post body is sanitized when saved, and the live preview is the same', async () => {
    const root = await h.root();
    const md = 'Hi <script>alert(1)</script> [x](javascript:alert(1))';
    const created = await root.post('/api/site/posts', { title: 'Sanitized', bodyMd: md });
    assert.equal(created.status, 201);
    assert.doesNotMatch(created.body.post.bodyHtml, /<script|href="javascript:/);
    const preview = await root.post('/api/site/render-markdown', { md });
    assert.equal(preview.status, 200);
    assert.equal(preview.headers['cache-control'], 'private, no-store');
    assert.equal(preview.body.html, created.body.post.bodyHtml);
  });
});

describe('drafts, publishing and addresses', () => {
  test('a page is seen only once published; system pages stay put', async () => {
    const root = await h.root();
    const created = await root.post('/api/site/pages', { path: '/for/Clinics', title: 'Clinics' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const page = created.body.page;
    assert.equal(page.path, '/for/clinics');
    assert.equal(page.status, 'draft');
    assert.equal((await site('/for/clinics')).status, 404, 'a draft is not public');

    const draft = {
      title: 'Clinics',
      seo: { title: 'Karo for clinics', description: 'Tasks for clinic staff.' },
      sections: [
        { type: 'hero', props: { title: 'Clinic work, done on time', subtitle: 'Hello', primary: { label: 'Register free', href: '/sign-up' } } },
        { type: 'richText', props: { md: 'Some **words**.' } },
        { type: 'faq', hidden: true, props: { title: 'Hidden', items: [{ q: 'Hidden question?', a: 'No.' }] } },
      ],
    };
    const saved = await root.patch(`/api/site/pages/${page.id}`, { version: page.version, draft });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.page.draft.sections[0].id, 'hero-1', 'ids are filled in');
    assert.equal(saved.body.page.draft.sections[0].props.visual, 'phone', 'defaults are filled in');

    const published = await root.post(`/api/site/pages/${page.id}/publish`, { version: saved.body.page.version });
    assert.equal(published.status, 200);
    assert.equal(published.body.page.changed, false);
    const live = await site('/for/clinics');
    assert.equal(live.status, 200);
    assert.match(live.text, /<title>Karo for clinics<\/title>/);
    assert.match(live.text, /<h1 id="hero-1-h">Clinic work, done on time<\/h1>/);
    assert.match(live.text, /Some <strong>words<\/strong>\./);
    assert.doesNotMatch(live.text, /Hidden question/, 'hidden sections are not drawn');

    // A new draft does not change the live page until it is published.
    const edited = await root.patch(`/api/site/pages/${page.id}`, { draft: { ...draft, title: 'Clinics 2', sections: [{ type: 'richText', props: { md: 'Changed' } }] } });
    assert.equal(edited.body.page.changed, true);
    assert.match((await site('/for/clinics')).text, /Clinic work, done on time/);

    // Moving it.
    const moved = await root.patch(`/api/site/pages/${page.id}`, { path: '/features/clinics' });
    assert.equal(moved.status, 200);
    assert.equal((await site('/features/clinics')).status, 200);
    assert.equal((await site('/for/clinics')).status, 404);

    assert.equal((await root.post(`/api/site/pages/${page.id}/unpublish`)).status, 200);
    assert.equal((await site('/features/clinics')).status, 404);

    // Logged for the console.
    const log = (await root.get('/api/platform/activity?group=admin')).body.items.map((r) => r.action);
    for (const a of ['admin.site_page_saved', 'admin.site_page_published', 'admin.site_page_unpublished', 'admin.site_settings_changed']) assert.ok(log.includes(a), a);

    assert.equal((await root.del(`/api/site/pages/${page.id}`)).status, 200);
    assert.equal(await SitePage.exists({ _id: page.id }), null);

    // The six main pages: never deleted, never moved; the home page and privacy never unpublished.
    const pages = (await root.get('/api/site/pages')).body.pages;
    const home = pages.find((p) => p.path === '/');
    const privacy = pages.find((p) => p.path === '/privacy');
    assert.equal(pages.filter((p) => p.system).length, 6);
    assert.equal((await root.del(`/api/site/pages/${home.id}`)).status, 400);
    assert.equal((await root.patch(`/api/site/pages/${privacy.id}`, { path: '/features/privacy' })).status, 400);
    assert.equal((await root.post(`/api/site/pages/${home.id}/unpublish`)).status, 400);
    assert.equal((await root.post(`/api/site/pages/${privacy.id}/unpublish`)).status, 400);
  });

  test('reserved and malformed page addresses are refused', async () => {
    const root = await h.root();
    for (const path of ['/sign-in', '/tasks', '/blog', '/api/x', '/media/x', '/features', '/about-us', '/features/Bad Slug', '/features/a/b', '/for/', '/features/../tasks', '/join/abc', '/iphone/x']) {
      const res = await root.post('/api/site/pages', { path, title: 'Nope' });
      assert.equal(res.status, 400, path);
    }
    assert.equal((await root.post('/api/site/pages', { path: '/for/offices', title: 'Again' })).status, 409, 'taken');
    const ok = await root.post('/api/site/pages', { path: '/for/ok-page', title: 'Fine' });
    assert.equal((await root.patch(`/api/site/pages/${ok.body.page.id}`, { path: '/sign-up' })).status, 400);
    const badSection = await root.patch(`/api/site/pages/${ok.body.page.id}`, { draft: { title: 'x', sections: [{ type: 'hero', props: { primary: { label: 'x', href: 'javascript:alert(1)' } } }] } });
    assert.equal(badSection.status, 400);
    assert.match(badSection.body.error, /^Section 1 \(hero\): primary\.href/);
    assert.equal((await root.patch(`/api/site/pages/${ok.body.page.id}`, { draft: { sections: [{ type: 'carousel' }] } })).status, 400);
  });

  test('a post: draft, scheduled, published; an old slug answers with a 301', async () => {
    const root = await h.root();
    const created = await root.post('/api/site/posts', { title: 'Hello, World: a first post!', bodyMd: '## One\n\nText', tags: ['Getting started', 'getting-started', 'WhatsApp'] });
    assert.equal(created.status, 201);
    const post = created.body.post;
    assert.equal(post.slug, 'hello-world-a-first-post');
    assert.deepEqual(post.tags, ['Getting started', 'WhatsApp'], 'one tag per address');
    assert.equal((await site(`/blog/${post.slug}`)).status, 404, 'a draft is not public');

    // Scheduled: published with a date still to come.
    const later = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const scheduled = await root.post(`/api/site/posts/${post.id}/publish`, { publishedAt: later });
    assert.equal(scheduled.body.post.scheduled, true);
    assert.equal((await site(`/blog/${post.slug}`)).status, 404, 'not before its date');
    assert.ok((await root.get('/api/site/posts?status=scheduled')).body.posts.some((p) => p.id === post.id));

    const now = await root.post(`/api/site/posts/${post.id}/publish`, { publishedAt: new Date(Date.now() - 1000).toISOString() });
    assert.equal(now.body.post.scheduled, false);
    const live = await site(`/blog/${post.slug}`);
    assert.equal(live.status, 200);
    assert.match(live.text, /<h1>Hello, World: a first post!<\/h1>/);
    assert.match(live.text, /href="\/blog\/tag\/getting-started">Getting started<\/a>/);
    assert.match(live.text, /<meta property="og:type" content="article">/);

    // A new slug: the old address moves on for good.
    const renamed = await root.patch(`/api/site/posts/${post.id}`, { slug: 'first-post', version: now.body.post.version });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.deepEqual(renamed.body.post.previousSlugs, ['hello-world-a-first-post']);
    const old = await site('/blog/hello-world-a-first-post');
    assert.equal(old.status, 301);
    assert.equal(old.headers.location, '/blog/first-post');
    assert.equal((await site('/blog/first-post')).status, 200);

    // Another post may take the old address; then it is that post's.
    const taker = await root.post('/api/site/posts', { title: 'Taker', slug: 'hello-world-a-first-post', bodyMd: 'x' });
    assert.equal(taker.status, 201);
    assert.deepEqual((await BlogPost.findById(post.id).lean()).previousSlugs, []);
    assert.equal((await root.post('/api/site/posts', { title: 'Dup', slug: 'first-post' })).status, 409);

    assert.equal((await root.post(`/api/site/posts/${post.id}/unpublish`)).status, 200);
    assert.equal((await site('/blog/first-post')).status, 404);
    assert.equal((await root.del(`/api/site/posts/${post.id}`)).status, 200);
    const log = (await root.get('/api/platform/activity?group=admin')).body.items.map((r) => r.action);
    for (const a of ['admin.site_post_saved', 'admin.site_post_published', 'admin.site_post_unpublished', 'admin.site_post_deleted']) assert.ok(log.includes(a), a);
  });

  test('two editors: the second save of the same version is refused with CHANGED_ELSEWHERE', async () => {
    const root = await h.root();
    const page = (await root.post('/api/site/pages', { path: '/for/race', title: 'Race' })).body.page;
    const first = await root.patch(`/api/site/pages/${page.id}`, { version: page.version, draft: { title: 'First', sections: [] } });
    assert.equal(first.status, 200);
    assert.ok(first.body.page.version > page.version);
    const second = await root.patch(`/api/site/pages/${page.id}`, { version: page.version, draft: { title: 'Second', sections: [] } });
    assert.equal(second.status, 409);
    assert.equal(second.body.code, 'CHANGED_ELSEWHERE');

    const s = (await root.get('/api/site/settings')).body.settings;
    assert.equal((await root.put('/api/site/settings', { version: s.version, tagline: 'One' })).status, 200);
    const stale = await root.put('/api/site/settings', { version: s.version, tagline: 'Two' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'CHANGED_ELSEWHERE');
  });

  test('redirects from the settings come before any page', async () => {
    const root = await h.root();
    assert.equal((await root.put('/api/site/settings', { redirects: [{ from: '/tasks', to: '/features' }] })).status, 400, 'only site addresses');
    assert.equal((await root.put('/api/site/settings', { redirects: [{ from: '/features/old', to: 'javascript:alert(1)' }] })).status, 400);
    // Typed with capitals: kept lowercase, the form every address is sent to first.
    const saved = await settings(root, { redirects: [{ from: '/features/Old-Name', to: '/features', status: 301 }, { from: '/about', to: '/contact', status: 302 }] });
    assert.equal(saved.settings.redirects[0].from, '/features/old-name');
    const moved = await site('/features/old-name');
    assert.equal(moved.status, 301);
    assert.equal(moved.headers.location, '/features');
    const temp = await site('/about');
    assert.equal(temp.status, 302);
    assert.equal(temp.headers.location, '/contact');
    await settings(root, { redirects: [] });
    assert.equal((await site('/about')).status, 200);
  });
});

describe('pictures', () => {
  test('/media serves website pictures only, cached for good; never a task file', async () => {
    const root = await h.root();
    const up = await root.multipart('post', '/api/site/media', { alt: 'A dot' }, [
      { field: 'file', buffer: h.PNG, filename: 'Dot Picture.png', contentType: 'image/png' },
      { field: 'thumb', buffer: h.PNG, filename: 'dot-small.png', contentType: 'image/png' },
    ]);
    assert.equal(up.status, 201, JSON.stringify(up.body));
    const media = up.body.media;
    assert.equal(media.mime, 'image/png');
    assert.equal(media.width, 1);
    assert.equal(media.height, 1);
    assert.equal(media.alt, 'A dot');
    assert.match(media.url, /^\/media\/[a-f\d]{24}\/dot-picture\.png$/);
    assert.match(media.thumbUrl, /^\/media\/[a-f\d]{24}\/dot-picture\.png$/);
    assert.notEqual(media.thumbUrl, media.url, 'the small copy is a file of its own');

    const res = await h.binary(h.request().get(media.url));
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.equal(res.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(Buffer.compare(res.body, h.PNG) === 0);
    assert.equal((await h.request().get(media.url.replace(/\/[^/]+$/, ''))).status, 200, 'the name is optional');

    // A task attachment (or any other file) is not served here.
    const person = await h.signup('Uploader');
    const file = await person.upload('/api/files', 'file', h.PNG, 'private.png', 'image/png');
    assert.equal(file.status, 201);
    assert.equal((await h.request().get(`/media/${file.body.file.id}/private.png`)).status, 404);
    assert.equal((await h.request().get('/media/not-an-id')).status, 404);

    // Used as a page's picture: width, height and the small copy are given.
    await settings(root, { seo: { defaultOgImage: media.id } });
    const home = await site('/');
    const og = /<meta property="og:image" content="([^"]+)">/.exec(home.text)[1];
    assert.equal(new URL(og).pathname, media.url);
    assert.match(home.text, /<meta property="og:image:width" content="1">/);
    await settings(root, { seo: defaults.SETTINGS.seo });

    // On a page: the share picture, and the hero's picture with its size and small copy.
    const page = (await root.post('/api/site/pages', { path: '/features/with-picture', title: 'With a picture' })).body.page;
    const draft = { title: 'With a picture', seo: { ogImage: media.id }, sections: [{ type: 'hero', props: { title: 'Look', visual: 'image', image: { media: media.id, alt: 'Our dot' } } }] };
    assert.equal((await root.patch(`/api/site/pages/${page.id}`, { draft })).status, 200);
    assert.equal((await root.post(`/api/site/pages/${page.id}/publish`)).status, 200);
    const pictured = await site('/features/with-picture');
    assert.equal(new URL(/<meta property="og:image" content="([^"]+)">/.exec(pictured.text)[1]).pathname, media.url);
    const img = /<img class="hero-img"[^>]+>/.exec(pictured.text)[0];
    assert.ok(img.includes(`src="${media.url}"`) && img.includes(`srcset="${media.thumbUrl} 640w, ${media.url} 1w"`), img);
    assert.match(img, /width="1" height="1" alt="Our dot" fetchpriority="high"/);

    // Alt text, then gone.
    const patched = await root.patch(`/api/site/media/${media.id}`, { alt: 'A blue dot', version: media.version });
    assert.equal(patched.body.media.alt, 'A blue dot');
    assert.equal((await root.get('/api/site/media')).body.media[0].id, media.id);
    assert.equal((await root.del(`/api/site/media/${media.id}`)).status, 200);
    assert.equal((await h.request().get(media.url)).status, 404);
    const log = (await root.get('/api/platform/activity?group=admin')).body.items.map((r) => r.action);
    assert.ok(log.includes('admin.site_media_uploaded') && log.includes('admin.site_media_deleted'));
  });

  test('only JPEG, PNG and WebP by their bytes: SVG and anything else refused', async () => {
    const root = await h.root();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    for (const [buffer, name, type] of [
      [svg, 'evil.svg', 'image/svg+xml'],
      [svg, 'evil.png', 'image/png'],
      [Buffer.from('%PDF-1.4 not a picture at all'), 'doc.pdf', 'application/pdf'],
    ]) {
      const res = await root.multipart('post', '/api/site/media', {}, [{ field: 'file', buffer, filename: name, contentType: type }]);
      assert.equal(res.status, 400, name);
      assert.match(res.body.error, /JPEG, PNG or WebP/);
    }
    const big = Buffer.concat([h.PNG, Buffer.alloc(4 * 1024 * 1024)]);
    const tooBig = await root.multipart('post', '/api/site/media', {}, [{ field: 'file', buffer: big, filename: 'big.png', contentType: 'image/png' }]);
    assert.equal(tooBig.status, 413);
    assert.equal(await mongoose.connection.db.collection('files.files').countDocuments({ 'metadata.ref.kind': 'site' }), 0, 'nothing left behind');
  });
});

describe('the editor API', () => {
  test('signed out: 401; a person: 403; the Super Admin: in', async () => {
    const person = await h.signup('Curious');
    const calls = [
      ['get', '/api/site/settings'],
      ['put', '/api/site/settings'],
      ['get', '/api/site/pages'],
      ['post', '/api/site/pages'],
      ['get', '/api/site/posts'],
      ['post', '/api/site/media'],
      ['post', '/api/site/preview'],
      ['post', '/api/site/render-markdown'],
    ];
    for (const [method, url] of calls) {
      assert.equal((await h.client()[method === 'delete' ? 'del' : method](url)).status, 401, `${method} ${url}`);
      assert.equal((await person[method](url)).status, 403, `${method} ${url}`);
    }
    const root = await h.root();
    const s = await root.get('/api/site/settings');
    assert.equal(s.status, 200);
    assert.equal(s.body.settings.brandName, 'Karo');
    assert.equal(s.body.settings.seedVersion, undefined);
    assert.equal(s.body.settings.footer.columns.length, 4);
    assert.ok(s.body.settings.footer.columns.some((c) => c.links.some((l) => l.href === '/privacy')));
    assert.ok((await root.get('/api/site/pages')).body.pages.length >= 9);
    assert.ok((await root.get('/api/site/posts?status=published')).body.total >= 3);
  });

  test('preview: the unsaved page or post as HTML, never indexed, no scripts', async () => {
    const root = await h.root();
    const page = await root.post('/api/site/preview', {
      kind: 'page',
      path: '/',
      data: { title: 'Preview', sections: [{ type: 'hero', props: { title: 'Previewed <b>hero</b>' } }, { type: 'stats', props: { title: 'Numbers', mode: 'live', items: [{ key: 'people', label: 'People' }] } }] },
    });
    assert.equal(page.status, 200, JSON.stringify(page.body));
    assert.equal(page.headers['cache-control'], 'private, no-store');
    assert.match(page.body.html, /<meta name="robots" content="noindex">/);
    assert.match(page.body.html, /Previewed &lt;b&gt;hero&lt;\/b&gt;/);
    assert.match(page.body.html, /<meta http-equiv="Content-Security-Policy"/);
    assert.doesNotMatch(page.body.html, /<script src=/);
    assert.match(page.body.html, /<dt>People<\/dt><dd>\d+<\/dd>/, 'live numbers');

    const post = await root.post('/api/site/preview', { kind: 'post', data: { title: 'Draft post', bodyMd: '## Part\n\n<script>x</script>' } });
    assert.equal(post.status, 200);
    assert.match(post.body.html, /<h1>Draft post<\/h1>/);
    assert.doesNotMatch(post.body.html, /<script>x/);
    assert.equal((await root.post('/api/site/preview', { kind: 'page', data: { sections: [{ type: 'nope' }] } })).status, 400);
  });

  test('the Super Admin changes the words around posts, on the 404 and beside the FAQ; a $ in a title stays', async () => {
    const root = await h.root();
    const { brandName, blog, notFound } = defaults.SETTINGS;
    await settings(root, {
      brandName: 'Kaam',
      blog: { ...blog, cta: { title: 'Try Kaam today', text: 'It is free.', primary: { label: 'Join', href: '/sign-up' }, secondary: { label: 'Read more', href: '/features' } } },
      notFound: { title: 'Lost?', text: 'Try one of these.' },
    });
    const post = (await root.post('/api/site/posts', { title: 'Save $$ and $& now', bodyMd: 'Hi' })).body.post;
    await root.post(`/api/site/posts/${post.id}/publish`);
    const page = await site(`/blog/${post.slug}`);
    // The title template ("%s · Karo") is a setting of its own.
    assert.match(page.text, /<title>Save \$\$ and \$&amp; now · Karo<\/title>/, 'no $ replacement patterns');
    assert.match(page.text, /<h2 id="post-cta-h">Try Kaam today<\/h2>\s*<p>It is free\.<\/p>/);
    assert.match(page.text, /href="\/features">[^<]*Read more/);
    const missing = await site('/features/nothing-here');
    assert.match(missing.text, /<h1 id="nf-h">Lost\?<\/h1>/);
    assert.match(missing.text, /What Kaam is and how it works/);

    const faq = await root.post('/api/site/preview', {
      kind: 'page',
      path: '/',
      data: { title: 'Q', sections: [{ type: 'faq', props: { title: 'Questions', ask: 'Anything else?', items: [{ q: 'Free?', a: 'Yes.' }] } }, { type: 'featureSplit', props: { title: 'Chat', visual: 'chat' } }] },
    });
    assert.equal(faq.status, 200, JSON.stringify(faq.body));
    assert.match(faq.body.html, /<b>Anything else\?<\/b>/);
    assert.match(faq.body.html, /The same work in Kaam/, 'the drawing uses the brand name');

    assert.equal((await root.del(`/api/site/posts/${post.id}`)).status, 200);
    await settings(root, { brandName, blog, notFound });
  });

  test('the starter content is written once: a deleted post or page does not come back', async () => {
    const root = await h.root();
    const before = await SitePage.countDocuments();
    await ensureSiteDefaults();
    assert.equal(await SitePage.countDocuments(), before);
    const starter = await BlogPost.findOne({ slug: 'whatsapp-groups-vs-task-app' });
    assert.equal((await root.del(`/api/site/posts/${starter._id}`)).status, 200);
    await ensureSiteDefaults();
    assert.equal(await BlogPost.exists({ slug: 'whatsapp-groups-vs-task-app' }), null);
    assert.equal((await SiteSettings.findById('site').lean()).seedVersion, defaults.SEED_VERSION);
  });

  test('a refresh rewrites starter content nobody edited, and keeps edited and deleted content', async () => {
    const seeded = (p) => defaults.PAGES.find((x) => x.path === p);
    const stale = { 'draft.title': 'Old copy', 'published.title': 'Old copy', updatedBy: null };
    await SitePage.updateOne({ path: '/about' }, { $set: stale });
    await SitePage.updateOne({ path: '/contact' }, { $set: { ...stale, updatedBy: new mongoose.Types.ObjectId() } });
    await BlogPost.updateOne({ slug: 'what-is-a-task-pin' }, { $set: { title: 'Old post', updatedBy: null } });
    await SiteSettings.updateOne({ _id: 'site' }, { $set: { seedVersion: 1, tagline: 'Old tagline', updatedBy: null } });

    await ensureSiteDefaults();

    const about = await SitePage.findOne({ path: '/about' }).lean();
    assert.equal(about.published.title, seeded('/about').title);
    assert.equal(about.draft.title, seeded('/about').title);
    assert.equal((await SitePage.findOne({ path: '/contact' }).lean()).published.title, 'Old copy');
    assert.equal((await BlogPost.findOne({ slug: 'what-is-a-task-pin' }).lean()).title, defaults.POSTS.find((p) => p.slug === 'what-is-a-task-pin').title);
    assert.equal(await BlogPost.exists({ slug: 'whatsapp-groups-vs-task-app' }), null);
    const s = await SiteSettings.findById('site').lean();
    assert.equal(s.tagline, defaults.SETTINGS.tagline);
    assert.equal(s.seedVersion, defaults.SEED_VERSION);
  });
});
