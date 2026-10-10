/**
 * A picture in the website's library. The bytes are in GridFS (platform
 * services/files.js) with `metadata.ref = { kind: 'site', id: <this _id> }`,
 * which is what lets GET /media/:id serve them to anyone: no other file can
 * be opened that way.
 *
 *   file / thumb   GridFS ids: the picture (≤ 1600 px wide, sent resized by
 *                  the browser) and an optional small copy (≤ 640 px)
 */
const mongoose = require('mongoose');

const siteMediaSchema = new mongoose.Schema(
  {
    file: { type: mongoose.Schema.Types.ObjectId, required: true },
    thumb: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, trim: true, maxlength: 120, default: 'image' },
    mime: { type: String, trim: true, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    size: { type: Number, default: 0 },
    alt: { type: String, trim: true, maxlength: 200, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, optimisticConcurrency: true }
);

module.exports = mongoose.model('SiteMedia', siteMediaSchema);
