/*
 * Karo website: runs in <head>, before the page is drawn (a file, because the
 * site's CSP allows no inline script).
 *
 *  - Inter, loaded so it never blocks the first paint.
 *  - Light / dark from the app's own choice (localStorage 'taskpro.theme',
 *    as web/index.html does), so the site never flashes the wrong colours.
 *  - Signed in on this browser (localStorage 'taskpro.session.v2' has a
 *    token): the home page goes straight to the app (add ?home=1 to see it);
 *    every other page swaps Log in / Register for one "Open Karo" button.
 *  - A dismissed announcement stays hidden (localStorage 'taskpro.site.announce').
 *  - iPhones: "Add to Home Screen" installs the Karo app, full screen (as
 *    web/src/platform/iphoneApp.js advertiseIphoneApp does in the app).
 */
(function () {
  var root = document.documentElement;
  root.classList.add('js');

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  // Inter, without holding up the first paint: the page preloads its CSS
  // (<link rel=preload data-font>); added from a script it never blocks.
  var font = document.querySelector('link[data-font]');
  if (font) {
    var sheet = document.createElement('link');
    sheet.rel = 'stylesheet';
    sheet.href = font.href;
    document.head.appendChild(sheet);
  }

  var mode = read('taskpro.theme');
  var dark = mode === 'dark' || (mode !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) root.classList.add('dark');

  var session = null;
  try {
    session = JSON.parse(read('taskpro.session.v2') || 'null');
  } catch (e) {
    session = null;
  }
  if (session && session.token) {
    var home = session.user && session.user.role === 'superadmin' ? '/console' : '/tasks';
    if (location.pathname === '/' && !/[?&]home=1(&|$)/.test(location.search)) {
      location.replace(home);
      return;
    }
    root.classList.add('signed-in');
    root.setAttribute('data-home', home);
  }

  var announce = document.querySelector('meta[name="karo-announce"]');
  if (announce && read('taskpro.site.announce') === announce.getAttribute('content')) root.classList.add('no-announce');

  if (/iPhone|iPod/.test(navigator.userAgent || '')) {
    var add = function (tag, attrs) {
      var el = document.createElement(tag);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      document.head.appendChild(el);
    };
    add('link', { rel: 'manifest', href: '/iphone/manifest.json' });
    add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    add('meta', { name: 'apple-mobile-web-app-title', content: 'Karo' });
  }
})();
