/**
 * A blog post. Written in Markdown (`bodyMd`); `bodyHtml` and `toc` are made
 * from it on every save (site/markdown.js), so a visit never renders Markdown.
 *
 *   slug           its address, /blog/<slug>; an old slug moves to
 *                  `previousSlugs` and answers with a 301 to the new one
 *   status         draft | published; a published post with `publishedAt` in
 *                  the future is scheduled and appears by itself on that date
 */
const mongoose = require('mongoose');
const { seoSchema } = require('./shared');

const blogPostSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, trim: true, maxlength: 100 },
    previousSlugs: { type: [String], default: [] },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    excerpt: { type: String, trim: true, maxlength: 320, default: '' },
    bodyMd: { type: String, default: '' },
    bodyHtml: { type: String, default: '' },
    toc: {
      type: [new mongoose.Schema({ id: String, text: String, level: Number }, { _id: false })],
      default: [],
    },
    cover: {
      media: { type: mongoose.Schema.Types.ObjectId, ref: 'SiteMedia', default: null },
      alt: { type: String, trim: true, maxlength: 200, default: '' },
    },
    author: {
      name: { type: String, trim: true, maxlength: 80, default: '' },
      title: { type: String, trim: true, maxlength: 80, default: '' },
    },
    tags: { type: [String], default: [] },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    publishedAt: { type: Date, default: null },
    readingMinutes: { type: Number, default: 1 },
    seo: { type: seoSchema, default: () => ({}) },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, optimisticConcurrency: true, minimize: false }
);

blogPostSchema.index({ slug: 1 }, { unique: true });
blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ tags: 1, publishedAt: -1 });
blogPostSchema.index({ previousSlugs: 1 });

module.exports = mongoose.model('BlogPost', blogPostSchema);
