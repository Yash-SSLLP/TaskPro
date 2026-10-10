/**
 * The VAPID key pair the server signs Web Push with (services/webPush.js).
 *
 * One document, made the first time it is needed, so iPhone notifications
 * work on a deployment nobody has configured keys for. The pair must not
 * change once phones have subscribed with the public half (they would stop
 * receiving until the app re-subscribes on its next open), which is why it is
 * stored and not made per process. VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, when
 * set, win and this is never read. Its own collection, as the private key
 * must never reach a client.
 */
const mongoose = require('mongoose');

const webPushKeySchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'vapid', unique: true },
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebPushKey', webPushKeySchema);
