# The Karo website

Karo's public website (home, features, use-case pages, about, contact, privacy, terms, the blog, robots.txt and the sitemap) is rendered by the **backend** from MongoDB and edited by the **Super Admin** in the console. There is no separate site to build or deploy: publish in the console and the page is live within a minute.

The API contract is in `backend/API.md` §6. This file explains how it fits together, how to edit it, and how to go live on `www.karoindia.in`.

## 1. How it works

```
browser ──► Vercel ──┬─ /api/*                                   → backend (Express)
                     ├─ /  /features[/…]  /for/…  /about  /contact
                     │  /privacy  /terms  /blog[/…]  /media/…
                     │  /rss.xml  /sitemap.xml  /robots.txt  /llms.txt → backend: backend/src/site
                     └─ everything else (/sign-in, /tasks, /join/…,
                        /get-app, /delete-account, /iphone/…, /site/*) → web (the React app and its files)
```

- **One origin.** `vercel.json` sends the site's paths to the backend service and everything else to the web app, `/api` first and the web catch-all last. Locally, `web/vite.config.js` forwards the same paths to the API on port 5120 (`/` exactly), so `http://localhost:5121/` shows the website and `/sign-in`, `/tasks` … show the app.
- **Rendered on the server.** `backend/src/site/public.js` answers those paths with complete HTML, so search engines and link previews (WhatsApp, LinkedIn) see everything without running JavaScript. It is mounted in `app.js` **before** `cors()`: no `Vary: Origin`, no cookies, so Vercel's CDN keeps one copy per page (`max-age=60`, served stale for a day while it refreshes).
- **Static files from the web service.** `web/public/site/` holds `site.css`, `boot.js`, `site.js` and `og-default.png`. Pages link them as `/site/site.css?v=<commit>` (the deployment's `VERCEL_GIT_COMMIT_SHA`, else the backend's package version).
- **Pictures** uploaded in the console live in GridFS like every other file, filed under `ref: { kind: 'site' }`, and are served to anyone at `/media/<id>/<name>`, cached for a year. Only site pictures can be opened there: a task's attachment never can.
- **Starter content.** `site/defaults.js` writes the settings, the nine pages and three blog posts once (`ensureSiteDefaults()`, at every start in `server.js` and on Vercel's cold start in `app.js`). A page or post the Super Admin deletes is not put back. A fault there is logged and never stops the API.

### The pieces (`backend/src/site/`)

| File | What it does |
|---|---|
| `index.js` | `publicRouter`, `adminRouter`, `ensureSiteDefaults` |
| `public.js` | the public routes: clean addresses (301), redirects, pages, blog, feeds, `/media`, the HTML 404 |
| `admin.js` | `/api/site/*`, the Super Admin's editor (Super Admin only, checked with Zod, logged) |
| `models/` | `SiteSettings` (one document, `_id: 'site'`), `SitePage`, `BlogPost`, `SiteMedia` |
| `schemas.js` | what may be saved: settings, page drafts and **each section type's props** (`PROPS`) |
| `content.js` | loading what a page needs (settings, pictures, latest posts, live numbers) |
| `render/html.js` | the escaping `html` template tag: the only way the site builds HTML |
| `render/layout.js` | `<head>` (title, description, canonical, robots, Open Graph, JSON-LD), header, footer |
| `render/sections.js` | one renderer per section type |
| `render/mocks.js` | the HTML/CSS drawings of the app (the hero's phone, the organization tabs, the chat) |
| `render/blog.js`, `render/pages.js`, `render/feeds.js` | blog list and post; a page, the 404, the error page; robots, sitemap, RSS, llms.txt |
| `render/icons.js` | inline SVG icons (Lucide style, the apps' set) |
| `markdown.js` | Markdown → safe HTML (markdown-it with raw HTML off, then sanitize-html), heading ids, table of contents |
| `seo.js` | the site URL, whether a request may be indexed, JSON-LD builders |
| `links.js` | which paths are the site's, reserved app paths, which links may be printed |
| `stats.js` | the live numbers (people, organizations, tasks done), cached 10 minutes |

### Browser scripts (`web/public/site/`)

- `boot.js` runs in `<head>` before anything is drawn (a file, not inline: the site's CSP forbids inline script):
  - light or dark from the app's own `taskpro.theme` choice;
  - a visitor signed in on this browser (`taskpro.session.v2` has a token) who opens `/` goes straight to `/tasks` (`/console` for the Super Admin); add `?home=1` to see the home page anyway. On every other page Log in / Register become one **Open Karo** button;
  - a dismissed announcement stays hidden (`taskpro.site.announce`);
  - on an iPhone it adds the iPhone app's manifest and metas, so **Add to Home Screen** from the website installs the Karo app full screen (as the React app's `advertiseIphoneApp` does).
- `site.js` (deferred): the phone menu, dismissing the announcement, the Open Karo address. The site works without it: the menu then shows as a row of links.

## 2. Editing the website (Super Admin)

Everything is in the console under **Website** (`/website`): Pages, Blog, Media and Settings. The editor talks to `/api/site/*`.

- **Pages** are built from sections: hero, steps, feature grid, feature split, audiences, languages, platforms, stats, testimonials, FAQ, blog teaser, call to action and rich text (Markdown). Add, reorder, hide or delete sections; each type has its own form (`schemas.js` `PROPS`, `API.md` §6). **Save draft** keeps your changes private; **Preview** shows the draft as it will look; **Publish** makes it live; **Unpublish** takes a page down (the home page and the privacy policy always stay up). The six main pages (`/`, `/features`, `/about`, `/contact`, `/privacy`, `/terms`) can't be deleted or moved. New pages go at `/features/<name>` or `/for/<name>`.
- **Blog posts** are written in Markdown. The address (slug) comes from the title; change it later and the old address keeps working (301). A publish date in the future schedules the post: it appears by itself on that date. Give every post a description (SEO panel) and a cover picture with alt text.
- **Media**: upload JPEG, PNG or WebP (the console shrinks them to WebP first). SVG is refused on purpose: it can carry script. Write alt text for every picture.
- **Settings**: brand and tagline; **Site URL** and **Let search engines index the site** (see §4); the menu; the header buttons; the footer's columns; social links (Instagram first) and contact details; the announcement bar; SEO defaults (title template `%s · Karo`, description, default share picture, Google verification code); redirects (old site address → new one).
- **Two people editing**: if someone else saved the same page, post or settings since you opened it, the save is refused with "Someone else changed this — reload". Nothing is overwritten.
- Every change is in the console's Activity log (`admin.site_*`).

### Writing rules

- Say **Karo** (not KARO). Where it reads naturally: "In Karo, you …".
- Be exact about what Karo does: free; Task Pin; contacts and organizations (people accept invites); accept / decline, progress, review, more time; reminders, recurring tasks, calendar; voice notes and files; Excel export; Android app, iPhone home-screen app, web; six languages in the app. WhatsApp is a **nudge the person sends in one tap**, never automatic messages.
- No made-up numbers, ratings or testimonials. The stats band and the testimonials are hidden until there are real ones to show. Task templates no longer exist: don't mention them.
- One title and one description per page, written for that page (about 50–60 and 150–160 characters).
- **Markdown headings start at `#`** (blog posts, rich-text sections, FAQ answers). The page or post title is the page's only `<h1>`, so the engine moves every Markdown heading one level down: `#` becomes `<h2>`, `##` becomes `<h3>`, `###` and deeper become `<h4>` (`site/markdown.js`). Use `#` for a post's main sections and `##` under them; starting at `##` makes everything one level too deep. A post's table of contents lists its `#` and `##` headings.

## 3. Security

The session token lives in `localStorage` on this same origin, so nothing a CMS author types may ever run as script:

- every string goes through the escaping `html` tag (`render/html.js`); `raw()` is used only for sanitized Markdown, JSON-LD and the site's own SVG;
- Markdown: raw HTML off, then `sanitize-html` with a short allowlist; links only to site paths, `https:`, `http:`, `mailto:`, `tel:`; pictures only from the site's own `/media/` (the CSP allows no other);
- every link saved in the settings or a section is checked the same way (`links.js isSafeHref`);
- a CSP on the site's routes only: scripts and styles from this origin (plus Google Fonts), no inline script, no framing. JSON-LD is written with every `<` as its JSON escape (backslash, u003c);
- `/media` serves only `ref.kind === 'site'` files, as `image/jpeg|png|webp`, `nosniff`, with a sandbox CSP; uploads are checked by their bytes (≤ 4 MB);
- the editor API is Super Admin only, validated with Zod and logged.

## 4. Search engines

- **Canonical** links always use the **site URL**: the Settings value, else the `SITE_URL` environment variable, else the address the page was asked on (its `Host` header, never `X-Forwarded-Host`). Until the domain is live, set `SITE_URL=https://taskpro-self.vercel.app` in Vercel (Production) so the cached pages' links never come from a request at all.
- **Indexing is off** until the switch is on (or `SITE_INDEXING=on`) **and** the page is served on the site URL's own host. Until then, and on every other host (`taskpro-self.vercel.app`, preview deployments), each page says `noindex` and `robots.txt` says `Disallow: /`.
- **Never redirect `taskpro-self.vercel.app`**: the installed Android and iPhone apps call its `/api`, invite links are built on it, and Android App Links are verified for it.
- Pages carry a unique title and description, Open Graph and Twitter tags (`og:locale en_IN`, default picture `/site/og-default.png`, 1200×630), `hreflang en-IN`, and JSON-LD: Organization (with the social links) on every page, WebSite and SoftwareApplication (free, Android, iOS, Web, no ratings) on the home page, FAQPage where there is an FAQ, BlogPosting and BreadcrumbList on posts.
- `/sitemap.xml` lists the published pages and posts that are not marked noindex, with their real last-changed dates. Tag pages are `noindex,follow` and not in the sitemap. `/rss.xml` has the latest 30 posts.
- The default share picture (`web/public/site/og-default.png`) was drawn from the site's own CSS and the home page's phone drawing with headless Edge (the same way `brand/build.mjs` renders the icons). Replace it with any 1200×630 PNG under 300 KB, or set a default share picture in Settings.

## 5. Going live on www.karoindia.in

Do these in order. Nothing changes for the apps.

1. **Domains (Vercel → Project → Domains).** Add `www.karoindia.in` and `karoindia.in`; make **www** the primary and redirect the apex to it (308/301). If `karoindia.com` is bought, add it too and redirect it to `https://www.karoindia.in`. Leave `taskpro-self.vercel.app` as it is.
2. **DNS (at the registrar).** Point `www` (CNAME) and the apex (A record) where Vercel says; wait until Vercel shows both domains as valid with certificates.
3. **Environment (Vercel → Settings → Environment Variables, Production).**
   - `SITE_URL=https://www.karoindia.in`
   - `WEB_URL=https://www.karoindia.in` (password-reset emails link here)
   - `VAPID_SUBJECT=https://www.karoindia.in` (or a `mailto:` address)
   - `CORS_ORIGIN`: only if it is set today, add the new origin to it
   - leave `SITE_INDEXING` unset for now
   Redeploy.
4. **Check the live site** on `https://www.karoindia.in`: the home page, `/features`, `/privacy`, a blog post, a made-up address (a real 404), `/robots.txt` (still `Disallow: /`), `/sitemap.xml` (every address starts with `https://www.karoindia.in`), the page source (`<link rel="canonical" href="https://www.karoindia.in/…">`). Sign in from the site's **Log in** button and check the app works on the new address. Share the home page link on WhatsApp and check the preview.
5. **Settings in the console.** Website → Settings: set the Site URL to `https://www.karoindia.in` (or rely on `SITE_URL`), fill in the Instagram (and other) links, check the footer and contact details. Turn **Let search engines index the site** on. Check `/robots.txt` now shows `Allow: /` and a `Sitemap:` line, and a page no longer says `noindex` (view source).
6. **Google Search Console** (search.google.com/search-console):
   1. Add a **Domain** property for `karoindia.in`, and verify it with the **DNS TXT** record it gives you (at the registrar). (Or add a URL-prefix property for `https://www.karoindia.in` and paste its HTML-tag code into Website → Settings → Google verification.)
   2. **Sitemaps** → submit `https://www.karoindia.in/sitemap.xml`. It should read "Success" with the pages and posts discovered.
   3. **URL inspection** → inspect `https://www.karoindia.in/` → **Request indexing**. Repeat for `/features` and the blog posts you most want found.
   4. Over the next weeks watch **Pages** (why some aren't indexed) and **Performance** (which searches show Karo).
7. **Bing Webmaster Tools** (optional): import the site from Search Console and submit the same sitemap.
8. **Later, for new app builds only**: add the new host to `mobile/app.json` `intentFilters` (App Links for `/join/` and `/tasks/`) and update `extra.apiUrl`. `/.well-known/assetlinks.json` is already served on every host. Installed apps keep using `taskpro-self.vercel.app`, which keeps working.

## 6. Known limits

- The CDN keeps a page for 60 seconds (and may serve the old copy once while it refreshes), so a publish shows within about a minute. A new deployment starts with a fresh cache.
- Scheduled posts appear on time, but the cached blog list may take up to a minute longer.
- A picture still used on a page or post can be deleted; the page then simply leaves it out. Check before deleting.
- Tags are compared by their slug (letters and numbers); a tag written only in another script (हिंदी) is dropped.
- Terms of use are a plain-language starting point: have them reviewed before relying on them.
- The privacy policy lives twice: `web/src/platform/privacy.js` (the apps) and the `/privacy` page (seeded once from `backend/src/site/defaults.js`, then edited in Website → Pages). `test/site.test.js` fails when the seed and privacy.js differ; on a live site, change the `/privacy` page in the console too.
- The drawn phone, organization tabs and chat on the home page are pictures: their sample names (Sharma Traders, Ravi…) are fixed; only the brand name follows Settings. So are small interface words such as "Keep reading", "On this page", "min read" and the pager's.
