/**
 * One counter per live KEY: how a screen learns that somebody else changed
 * what it shows, without a socket (./index.js has the whole design).
 *
 * `_id` IS THE KEY: `u:<userId>:<topic>` for one person (tasks, alerts,
 * calendar, people), or a shared one (`all:tasks`, `all:people`,
 * `bulk:<topic>`). Every write that changes what somebody sees adds one to
 * `v`; `at` is stamped by the DATABASE ($currentDate), so every server
 * writing here shares one clock.
 *
 * Read by `_id` only (GET /api/live asks for a handful of keys by name), so
 * the `_id` index is all it needs.
 */
const mongoose = require('mongoose');

const liveVersionSchema = new mongoose.Schema(
  {
    _id: { type: String },
    v: { type: Number, default: 0 },
    at: { type: Date },
  },
  { versionKey: false, collection: 'liveversions' }
);

module.exports = mongoose.model('LiveVersion', liveVersionSchema);
