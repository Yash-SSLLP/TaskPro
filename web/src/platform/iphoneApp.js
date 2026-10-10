/**
 * iPhones get the mobile app, not the website.
 *
 * There is no App Store build, so iPhones run the SAME app as Android,
 * exported for the web into public/iphone/ (mobile/scripts/build-iphone.js)
 * and added to the home screen from Safari (Share › Add to Home Screen), where
 * it opens full screen without Safari's bars.
 *
 * On an iPhone, every page of the site goes there instead, except the few that
 * only exist here (privacy, account deletion, password reset). An invite or a
 * task link goes along as ?open=, and the app opens it once signed in.
 * iPads and every other device keep the website, and so does anyone who
 * opened the site with ?desktop=1 (remembered on that phone until ?desktop=0).
 */

// The file itself, not the folder: hosts differ on folder index rules.
export const IPHONE_APP_PATH = '/iphone/index.html';

const WEB_ONLY = ['/privacy', '/delete-account', '/reset-password', '/forgot-password'];
const OPT_OUT_KEY = 'taskpro.fullSite';

export const isIphone = () => /iPhone|iPod/.test(navigator.userAgent || '');

/** The app link a website address carries: an invite or a task, else none. */
function appLink(pathname, search) {
  if (/^\/(join|tasks)\/[^/]+/.test(pathname)) return pathname + search;
  return '';
}

/**
 * Send an iPhone visitor to the app before the website renders.
 * @returns {boolean} true when the page is navigating away (skip rendering)
 */
export function redirectIphoneToApp() {
  if (typeof window === 'undefined' || !isIphone()) return false;
  const params = new URLSearchParams(window.location.search);
  try {
    if (params.get('desktop') === '1') localStorage.setItem(OPT_OUT_KEY, '1');
    if (params.get('desktop') === '0') localStorage.removeItem(OPT_OUT_KEY);
    if (localStorage.getItem(OPT_OUT_KEY) === '1') return false;
  } catch {
    /* storage blocked: go to the app as normal */
  }
  const { pathname, search } = window.location;
  if (WEB_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  const link = appLink(pathname, search);
  window.location.replace(link ? `${IPHONE_APP_PATH}?open=${encodeURIComponent(link)}` : IPHONE_APP_PATH);
  return true;
}

/**
 * Make "Add to Home Screen" from ANY page install the iPhone app, full screen.
 * An icon added from a page without these tags is a plain Safari bookmark,
 * which opens with the address bar on top and back / share / reload along the
 * bottom (the HRMS lesson, 2026-10-10). Added from script, for iPhones only: a
 * manifest on every page would make desktop Chrome offer to install the
 * website as the iPhone app.
 */
export function advertiseIphoneApp() {
  if (typeof document === 'undefined' || !isIphone()) return;
  const add = (tag, attrs) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    document.head.appendChild(el);
  };
  add('link', { rel: 'manifest', href: '/iphone/manifest.json' });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'KARO' });
}
