/**
 * Web Push: notifications for the iPhone app.
 *
 * iPhones run the mobile app as a home-screen web app (web/public/iphone,
 * built from mobile/), which cannot hold an Expo push token. Since iOS 16.4
 * such an app can subscribe to Web Push instead: the phone hands over a
 * subscription (an endpoint on Apple's push service plus two keys), stored on
 * its Device row as `webPush`, and the server sends to it signed with its
 * VAPID key. services/push.js sends each device the way it can be reached.
 *
 * Keys: config.vapid (VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY) when set;
 * otherwise made once and kept in the WebPushKey collection.
 */
const crypto = require('crypto');
const webpush = require('web-push');
const config = require('../../config');
const Device = require('../models/Device');
const WebPushKey = require('../models/WebPushKey');

// Push services the server will POST to. A subscription comes from the
// client, so an endpoint anywhere else is refused rather than fetched.
const PUSH_HOSTS = [
  /^web\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

let keysPromise = null;

/** The VAPID key pair, from the environment or the database (made on first use). */
function getKeys() {
  if (!keysPromise) {
    keysPromise = (async () => {
      const { publicKey, privateKey } = config.vapid;
      if (publicKey && privateKey) return { publicKey: publicKey.trim(), privateKey: privateKey.trim() };
      const fresh = webpush.generateVAPIDKeys();
      // $setOnInsert: two instances starting together both end up with
      // whichever pair was written first, never one each.
      const doc = await WebPushKey.findOneAndUpdate(
        { singleton: 'vapid' },
        { $setOnInsert: { publicKey: fresh.publicKey, privateKey: fresh.privateKey } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();
      return { publicKey: doc.publicKey, privateKey: doc.privateKey };
    })();
    keysPromise.catch(() => {
      keysPromise = null;
    });
  }
  return keysPromise;
}

/** "mailto: <a@b.com>" (as an address is often written) → "mailto:a@b.com"; Apple refuses a malformed subject. */
function subject() {
  const raw = String(config.vapid.subject || '').trim();
  if (raw) {
    const mail = /^mailto:\s*<?\s*([^<>\s]+@[^<>\s]+)\s*>?$/i.exec(raw);
    return mail ? `mailto:${mail[1]}` : raw;
  }
  // Apple wants an https URL or a mailto:, and rejects localhost.
  return /^https:\/\//i.test(config.webUrl) && !/localhost|127\.0\.0\.1/i.test(config.webUrl)
    ? config.webUrl
    : 'https://taskpro-self.vercel.app';
}

/** @returns {Promise<string>} the public key a phone subscribes with */
async function publicKey() {
  return (await getKeys()).publicKey;
}

/**
 * Check a subscription sent by the app.
 * @param {*} sub PushSubscription.toJSON(): { endpoint, keys: { p256dh, auth } }
 * @returns {{ endpoint: string, p256dh: string, auth: string } | null}
 */
function cleanSubscription(sub) {
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : '';
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh.trim() : '';
  const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth.trim() : '';
  if (!endpoint || !p256dh || !auth || endpoint.length > 1000 || p256dh.length > 200 || auth.length > 100) return null;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((re) => re.test(url.hostname))) return null;
  return { endpoint, p256dh, auth };
}

/** The Device.token for a subscription: short, URL-safe, stable. */
function tokenFor(endpoint) {
  return `webpush:${crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 40)}`;
}

/**
 * Send to Web Push devices.
 * @param {Array<{ token: string, webPush: { endpoint: string, p256dh: string, auth: string } }>} devices
 * @param {{ title: string, body?: string, data?: object }} message
 * @sideEffects Calls the push services; forgets subscriptions they report gone (404 / 410).
 */
async function sendWebPush(devices, { title, body, data } = {}) {
  const list = (devices || []).filter((d) => d?.webPush?.endpoint);
  if (!list.length || config.isTest) return;
  let keys;
  try {
    keys = await getKeys();
  } catch (err) {
    console.warn('[web push] no VAPID keys:', err.message);
    return;
  }
  const payload = JSON.stringify({ title, body: body || '', data: data || {} });
  const options = {
    vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
    TTL: 24 * 60 * 60,
    urgency: 'high',
  };

  const gone = [];
  await Promise.all(
    list.map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.webPush.endpoint, keys: { p256dh: d.webPush.p256dh, auth: d.webPush.auth } }, payload, options);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) gone.push(d.token);
        else console.warn('[web push] send failed:', err.statusCode || '', err.body || err.message);
      }
    })
  );
  if (gone.length) await Device.deleteMany({ token: { $in: gone } });
}

module.exports = { publicKey, cleanSubscription, tokenFor, sendWebPush };
