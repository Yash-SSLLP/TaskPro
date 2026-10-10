/**
 * Web only (index.web.js, PushPrompt.js): push notifications for the iPhone
 * home-screen app through Web Push. The service worker (web-public/sw.js)
 * receives them; the backend's platform/services/webPush.js sends them.
 * iOS offers Web Push only to an app added to the home screen (iOS 16.4+).
 */

/** Opened from the home screen, not in a Safari tab. */
export function isStandalone() {
  return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

export function webPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** 'granted' | 'denied' | 'undetermined', as the phone app reports it; null when unsupported. */
export function webPushPermission() {
  if (!webPushSupported()) return null;
  return Notification.permission === 'default' ? 'undetermined' : Notification.permission;
}

function keyBytes(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const sameKey = (buf, bytes) => {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
};

let swPromise = null;
function serviceWorker() {
  if (!swPromise) {
    swPromise = navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href, { scope: './' });
    swPromise.catch(() => {
      swPromise = null;
    });
  }
  return swPromise;
}

/**
 * Subscribe this iPhone to Web Push and register it with the server. Never
 * asks for permission (iOS allows that only from a tap; see PushPrompt), so
 * without it this does nothing.
 * @param {{ getKey: () => Promise<string>, register: (subscription: object) => Promise<string|null> }} server
 *   passed in by push.js, so this file does not import the API client
 * @returns {Promise<string|null>} the device token the server stored
 */
export async function registerWebPush({ getKey, register }) {
  if (!webPushSupported() || Notification.permission !== 'granted') return null;
  const reg = await serviceWorker();
  const key = keyBytes(await getKey());
  let sub = await reg.pushManager.getSubscription();
  // Subscribed under another key (the server's keys were replaced): start over.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return register(sub.toJSON());
}

/** Ask for permission. MUST run inside the tap itself: iOS refuses one made after an await. */
export async function requestWebPushPermission() {
  if (!webPushSupported()) return false;
  return (await Notification.requestPermission()) === 'granted';
}

/**
 * Route notification taps and live pushes into the app.
 * @param {(data: object) => void} onTap a notification was tapped
 * @param {(data: object) => void} onReceive a push arrived while the app was open
 * @returns {() => void} unsubscribe
 */
export function listenWebPush(onTap, onReceive) {
  if (!webPushSupported()) return () => {};
  // Launched by tapping a notification while the app was closed (sw.js).
  const params = new URLSearchParams(window.location.search);
  const launched = params.get('push');
  if (launched) {
    params.delete('push');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    try {
      const data = JSON.parse(launched);
      setTimeout(() => onTap(data), 600);
    } catch {
      /* malformed: ignore */
    }
  }
  const onMessage = (e) => {
    if (e.data?.type === 'karo-push-tap') onTap(e.data.data || {});
    else if (e.data?.type === 'karo-push') onReceive?.(e.data.data || {});
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  return () => navigator.serviceWorker.removeEventListener('message', onMessage);
}
