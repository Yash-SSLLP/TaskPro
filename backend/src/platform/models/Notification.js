/**
 * An in-app alert (the bell). Push notifications mirror these.
 */
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 140 },
    body: { type: String, maxlength: 400, default: '' },
    // In-app route to open, e.g. "/tasks/<id>". Both apps understand it.
    link: { type: String, default: '' },
    kind: { type: String, default: 'info' },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ user: 1, createdAt: -1 });
// Alerts clean themselves up after 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('Notification', notificationSchema);
