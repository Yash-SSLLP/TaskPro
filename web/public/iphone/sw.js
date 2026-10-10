/* Service worker for the iPhone home-screen app (served at /iphone/sw.js,
 * scope /iphone/). Its only job is push notifications. It caches nothing, so
 * a new build is picked up exactly as the website's is.
 *
 * Payload (backend platform/services/webPush.js): { title, body, data }.
 * iOS revokes a subscription that receives a push without showing a
 * notification, so every push shows one.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch (e) {
    p = { body: event.data ? event.data.text() : '' };
  }
  const data = p.data || {};
  event.waitUntil((async () => {
    await self.registration.showNotification(p.title || 'KARO', {
      body: p.body || '',
      data,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
    });
    // An open app refreshes what is on screen, as the phone app does on a push.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach((w) => w.postMessage({ type: 'karo-push', data }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins[0];
    if (win) {
      await win.focus().catch(() => {});
      win.postMessage({ type: 'karo-push-tap', data });
      return;
    }
    // Not running: open it, carrying the notification for the app to follow.
    await self.clients.openWindow(`index.html?push=${encodeURIComponent(JSON.stringify(data))}`);
  })());
});
