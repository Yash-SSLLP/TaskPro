/**
 * A page of the website, built from sections (site/render/sections.js draws
 * each type; site/schemas.js says what each one holds).
 *
 *   path       where it lives: "/", "/features", "/about", "/contact",
 *              "/privacy", "/terms" (the six `system` pages: never deleted or
 *              moved) or "/features/<slug>", "/for/<slug>"
 *   draft      what the Super Admin is editing
 *   published  what visitors see (a copy of the draft, made on Publish);
 *              shown only while `status` is "published"
 */
const mongoose = require('mongoose');
const { seoSchema } = require('./shared');

const SECTION_TYPES = [
  'hero',
  'steps',
  'featureGrid',
  'featureSplit',
  'audiences',
  'languages',
  'platforms',
  'stats',
  'testimonials',
  'faq',
  'blogTeaser',
  'cta',
  'richText',
];

const sectionSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true, maxlength: 40, required: true },
    type: { type: String, enum: SECTION_TYPES, required: true },
    hidden: { type: Boolean, default: false },
    // Checked per type by site/schemas.js before it is saved.
    props: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false, minimize: false }
);

const contentFields = {
  title: { type: String, trim: true, maxlength: 140, default: '' },
  seo: { type: seoSchema, default: () => ({}) },
  sections: { type: [sectionSchema], default: [] },
};

const sitePageSchema = new mongoose.Schema(
  {
    path: { type: String, required: true, trim: true, maxlength: 120, unique: true },
    system: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    draft: { type: new mongoose.Schema(contentFields, { _id: false, minimize: false }), default: () => ({}) },
    published: {
      type: new mongoose.Schema({ ...contentFields, publishedAt: { type: Date, default: null } }, { _id: false, minimize: false }),
      default: null,
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, optimisticConcurrency: true, minimize: false }
);

module.exports = mongoose.model('SitePage', sitePageSchema);
module.exports.SECTION_TYPES = SECTION_TYPES;
