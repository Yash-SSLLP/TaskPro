/**
 * Pieces the website's models share: a link, an SEO block, a picture.
 */
const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 80, default: '' },
    href: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: false }
);

const seoSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 120, default: '' },
    description: { type: String, trim: true, maxlength: 320, default: '' },
    // A SiteMedia id; empty = the site's default picture.
    ogImage: { type: mongoose.Schema.Types.ObjectId, ref: 'SiteMedia', default: null },
    noindex: { type: Boolean, default: false },
  },
  { _id: false }
);

module.exports = { linkSchema, seoSchema };
