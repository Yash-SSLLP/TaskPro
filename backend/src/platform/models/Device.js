/**
 * A phone registered for push notifications: an Expo push token, or (the
 * iPhone home-screen app, platform 'web') a Web Push subscription, whose
 * `token` is then a hash of its endpoint (services/webPush.tokenFor).
 */
const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios', 'web', 'other'], default: 'android' },
    webPush: {
      endpoint: { type: String, default: undefined },
      p256dh: { type: String, default: undefined },
      auth: { type: String, default: undefined },
    },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Device', deviceSchema);
