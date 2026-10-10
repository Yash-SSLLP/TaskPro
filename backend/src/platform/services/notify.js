/**
 * Tell people something happened: an in-app alert, mirrored as a push.
 *
 * Fire-and-forget by design. A failed alert must never fail the action that
 * caused it, so errors are logged and swallowed.
 */
const Notification = require('../models/Notification');
const Device = require('../models/Device');
const { sendPush } = require('./push');
const { sendWebPush } = require('./webPush');

// Notification.title / body have maxlength 140 / 400. Clip instead of letting
// one long title fail validation and silently drop the alert for everyone.
const clip = (s, max) => {
  const text = String(s ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * @param {Array<ObjectId|string>} userIds  who to tell (duplicates removed)
 * @param {{ title: string, body?: string, link?: string, kind?: string, exclude?: ObjectId|string }} msg
 */
async function notify(userIds, { title, body = '', link = '', kind = 'info', exclude } = {}) {
  try {
    const skip = exclude ? String(exclude) : null;
    const ids = [...new Set((userIds || []).filter(Boolean).map(String))].filter((id) => id !== skip);
    if (!ids.length) return;
    title = clip(title, 140);
    body = clip(body, 400);

    await Notification.insertMany(ids.map((user) => ({ user, title, body, link, kind })));

    // Each phone the way it can be reached: an Expo token, or (the iPhone
    // home-screen app) a Web Push subscription.
    const devices = await Device.find({ user: { $in: ids } }).select('token webPush').lean();
    const web = devices.filter((d) => d.webPush?.endpoint);
    const expo = devices.filter((d) => !d.webPush?.endpoint);
    await Promise.all([
      expo.length ? sendPush(expo.map((d) => ({ to: d.token, title, body, data: { link } }))) : null,
      web.length ? sendWebPush(web, { title, body, data: { link } }) : null,
    ]);
  } catch (err) {
    console.warn('[notify] failed:', err.message);
  }
}

module.exports = { notify };
