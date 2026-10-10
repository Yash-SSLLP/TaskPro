/**
 * The website's only way to build HTML: a tagged template that escapes every
 * value put into it.
 *
 *   html`<h2>${title}</h2>`          title is escaped (& < > " ')
 *   html`<ul>${items.map(li)}</ul>`  arrays are joined, each part escaped
 *   html`<div>${raw(safe)}</div>`    raw() only for HTML that is already safe:
 *                                    sanitized Markdown, JSON-LD, our own SVG
 *
 * Nothing a CMS author types reaches the page without passing through here.
 */

class Raw {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for HTML (text and quoted attributes alike). */
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** Mark a string as HTML that is already safe. */
const raw = (value) => new Raw(value === null || value === undefined ? '' : String(value));

function toHtml(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  return escape(value);
}

/** The escaping template tag. Returns Raw, so templates nest. */
function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + strings[i + 1];
  return new Raw(out);
}

/** An attribute only when it has a value: attr('href', url) → ` href="…"`. */
const attr = (name, value) => (value === null || value === undefined || value === '' || value === false ? '' : raw(` ${name}="${escape(value === true ? '' : value)}"`));

// U+2028 and U+2029 (line and paragraph separators), built from their codes.
const SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g');

/**
 * A JSON-LD block. Data, not script (the CSP allows no inline script, and
 * this one never runs), with every character that could close the tag or
 * start markup written as a \u escape.
 */
function jsonLd(data) {
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(SEPARATORS, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  return raw(`<script type="application/ld+json">${json}</script>`);
}

/** Escape text for XML (sitemap, RSS). */
const xml = (value) =>
  String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

module.exports = { html, raw, escape, attr, jsonLd, xml, Raw };
