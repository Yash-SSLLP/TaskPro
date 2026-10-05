/**
 * The daily digest's claim: one row per person per local day ("<userId>:<YYYY-MM-DD>").
 * Inserting it IS the lock, so a restart or a second server never sends two.
 */
const mongoose = require('mongoose');

const taskDigestSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

taskDigestSchema.index({ at: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

module.exports = mongoose.model('TaskDigest', taskDigestSchema);
