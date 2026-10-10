/**
 * Markdown → safe HTML for blog posts, rich-text sections and FAQ answers.
 *
 * markdown-it with raw HTML switched off (so "<script>" is shown as text, and
 * its link check already refuses javascript:/vbscript:/file:/data: links),
 * then sanitize-html with a short allowlist as a second lock: only these
 * tags and attributes, and links only to the schemes site/links.js allows.
 * The session token lives in localStorage on this same origin, so nothing a
 * CMS author types may ever run as script.
 *
 * Headings get ids (for the table of contents and #links); h1 in Markdown
 * becomes h2, because the page title is the page's only h1.
 */
const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');
const { isSafeHref, slugify } = require('./links');

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

/** A table column's alignment ("|--:|") as a class: the site's CSP allows no inline style. */
function alignClass(tagName, attribs) {
  const { style, ...out } = attribs;
  const align = /text-align\s*:\s*(left|right|center)/i.exec(style || '')?.[1];
  if (align) out.class = `ta-${align.toLowerCase()}`;
  return { tagName, attribs: out };
}

const ALLOWED = {
  allowedTags: [
    'h2', 'h3', 'h4', 'p', 'br', 'hr', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 's', 'code', 'pre',
    'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
    h2: ['id'],
    h3: ['id'],
    h4: ['id'],
    ol: ['start'],
    code: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: [] },
  allowProtocolRelative: false,
  allowedClasses: { code: [/^language-[a-z0-9-]+$/], th: [/^ta-(left|right|center)$/], td: [/^ta-(left|right|center)$/] },
  transformTags: {
    th: alignClass,
    td: alignClass,
    a(tagName, attribs) {
      const href = isSafeHref(attribs.href) ? attribs.href.trim() : '';
      const out = { ...attribs, href };
      if (!href) delete out.href;
      // Links off the site open in a new tab and carry nothing back.
      if (/^https?:/i.test(href)) Object.assign(out, { rel: 'noopener noreferrer', target: '_blank' });
      else delete out.target;
      return { tagName, attribs: out };
    },
    img(tagName, attribs) {
      // Pictures from the site's own library (/media/…) only: the site's CSP
      // (img-src 'self') would leave any other picture broken on the page.
      const src = String(attribs.src || '').trim();
      const ok = src.startsWith('/media/');
      return { tagName, attribs: { ...attribs, src: ok ? src : '', loading: 'lazy', decoding: 'async' } };
    },
  },
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
};
// sanitize-html checks schemes itself; /media/ paths are relative, which it allows.

/**
 * @param {string} source Markdown
 * @returns {{ html: string, toc: Array<{id, text, level}>, words: number }}
 */
function renderMarkdown(source) {
  const text = String(source || '');
  const tokens = md.parse(text, {});
  const toc = [];
  const used = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'heading_open') continue;
    // # → h2, ## → h3 …, never deeper than h4.
    const level = Math.min(4, Number(t.tag.slice(1)) + 1);
    t.tag = `h${level}`;
    if (tokens[i + 2]?.type === 'heading_close') tokens[i + 2].tag = `h${level}`;
    const label = (tokens[i + 1]?.children || []).filter((c) => c.type === 'text' || c.type === 'code_inline').map((c) => c.content).join('').trim();
    const base = slugify(label, 60) || 'section';
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    t.attrSet('id', id);
    if (level <= 3) toc.push({ id, text: label, level });
  }
  const raw = md.renderer.render(tokens, md.options, {});
  const html = sanitizeHtml(raw, ALLOWED);
  const words = text.replace(/[#>*_`\-[\]()!]/g, ' ').split(/\s+/).filter(Boolean).length;
  return { html, toc, words };
}

// The site renders the same answers and rich text on every visit: keep the
// last few hundred results.
const cache = new Map();
const CACHE_MAX = 300;

/** renderMarkdown(source).html, remembered. */
function markdownHtml(source) {
  const key = String(source || '');
  if (cache.has(key)) return cache.get(key);
  const { html } = renderMarkdown(key);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, html);
  return html;
}

/** Minutes to read `words` (200 a minute, at least 1). */
const readingMinutes = (words) => Math.max(1, Math.ceil((Number(words) || 0) / 200));

module.exports = { renderMarkdown, markdownHtml, readingMinutes };
