/**
 * Push notifications through Expo's push service.
 *
 * The phone registers an Expo push token (POST /api/devices). Expo forwards
 * to Firebase / APNs, so the server needs no Firebase credentials of its own.
 */
const config = require('../../config');
const Device = require('../models/Device');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const isExpoToken = (t) => /^Expo(nent)?PushToken\[.+\]$/.test(t);

/**
 * @param {Array<{to: string, title: string, body?: string, data?: object}>} messages
 */
async function sendPush(messages) {
  const valid = messages.filter((m) => isExpoToken(m.to));
  if (!valid.length || config.isTest) return;

  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (config.expoAccessToken) headers.Authorization = `Bearer ${config.expoAccessToken}`;

  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100).map((m) => ({
      to: m.to,
      title: m.title,
      body: m.body || undefined,
      data: m.data || {},
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(chunk) });
      const json = await res.json().catch(() => ({}));
      const tickets = Array.isArray(json.data) ? json.data : [];
      // Forget phones that uninstalled the app or revoked permission.
      const dead = tickets
        .map((t, idx) => (t?.details?.error === 'DeviceNotRegistered' ? chunk[idx].to : null))
        .filter(Boolean);
      if (dead.length) {
        await Device.deleteMany({ token: { $in: dead } });
      }
    } catch (err) {
      console.warn('[push] send failed:', err.message);
    }
  }
}

module.exports = { sendPush, isExpoToken };
