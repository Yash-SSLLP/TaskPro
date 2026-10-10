/**
 * The website's settings: one document, `_id: 'site'`. Everything the header,
 * the footer and every page's <head> read that is not a page of its own.
 *
 *   siteUrl    the address canonical links and the sitemap use ("" = SITE_URL,
 *              else the address the page was asked on)
 *   indexing   let search engines index the site (SITE_INDEXING=on forces it);
 *              only ever on the siteUrl's own host (site/seo.js)
 *   redirects  old site addresses → new ones, applied before any page
 *   seedVersion  how much of site/defaults.js has been written once (so a
 *              page or post the Super Admin deleted is not put back)
 */
const mongoose = require('mongoose');
const { linkSchema } = require('./shared');

const columnSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 60, default: '' },
    links: { type: [linkSchema], default: [] },
  },
  { _id: false }
);

const redirectSchema = new mongoose.Schema(
  {
    from: { type: String, trim: true, maxlength: 300, required: true },
    to: { type: String, trim: true, maxlength: 500, required: true },
    status: { type: Number, enum: [301, 302], default: 301 },
  },
  { _id: false }
);

const text = (max, value = '') => ({ type: String, trim: true, maxlength: max, default: value });

const siteSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'site' },
    brandName: text(60, 'Karo'),
    tagline: text(200),
    siteUrl: text(200),
    indexing: { type: Boolean, default: false },
    seo: {
      titleTemplate: text(80, '%s · Karo'),
      defaultDescription: text(320),
      defaultOgImage: { type: mongoose.Schema.Types.ObjectId, ref: 'SiteMedia', default: null },
      googleSiteVerification: text(200),
    },
    nav: { type: [linkSchema], default: [] },
    headerCta: {
      login: { type: linkSchema, default: () => ({ label: 'Log in', href: '/sign-in' }) },
      register: { type: linkSchema, default: () => ({ label: 'Register free', href: '/sign-up' }) },
    },
    footer: {
      columns: { type: [columnSchema], default: [] },
      note: text(300),
    },
    socials: {
      instagram: text(300),
      youtube: text(300),
      linkedin: text(300),
      x: text(300),
      facebook: text(300),
      whatsapp: text(300),
    },
    contact: {
      email: text(200),
      phone: text(40),
      whatsapp: text(40),
      address: text(300),
    },
    announcement: {
      enabled: { type: Boolean, default: false },
      text: text(200),
      href: text(500),
    },
    blog: {
      title: text(120, 'The Karo blog'),
      description: text(320),
      // The box at the end of every post ("" = the built-in words).
      cta: {
        title: text(160),
        text: text(500),
        primary: { type: linkSchema, default: () => ({}) },
        secondary: { type: linkSchema, default: () => ({}) },
      },
    },
    // The 404 page's heading and line ("" = the built-in words).
    notFound: {
      title: text(160),
      text: text(500),
    },
    redirects: { type: [redirectSchema], default: [] },
    seedVersion: { type: Number, default: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, optimisticConcurrency: true, minimize: false }
);

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
