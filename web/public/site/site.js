/*
 * Karo website: the little that needs script, after the page has loaded
 * (deferred). Everything works without it; the menu then shows as a row.
 *
 *  - The phone menu: open / close, Escape, a tap on a link, growing wider.
 *  - The header: clear at the top of the page, frosted once it scrolls.
 *  - Dismissing the announcement bar (remembered on this browser).
 *  - "Open Karo" goes to the signed-in person's own home (boot.js found it).
 */
(function () {
  var root = document.documentElement;

  var button = document.querySelector('[data-menu]');
  var nav = document.getElementById('site-nav');
  function setOpen(open) {
    root.classList.toggle('nav-open', open);
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (button && nav) {
    button.addEventListener('click', function () {
      setOpen(!root.classList.contains('nav-open'));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('nav-open')) {
        setOpen(false);
        button.focus();
      }
    });
    var wide = window.matchMedia('(min-width: 960px)');
    var onWide = function () {
      if (wide.matches) setOpen(false);
    };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
  }

  // The header turns frosted once the page moves under it.
  var ticking = false;
  function onScroll() {
    ticking = false;
    root.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(onScroll);
      }
    },
    { passive: true }
  );
  onScroll();

  var close = document.querySelector('[data-announce-close]');
  var id = document.querySelector('meta[name="karo-announce"]');
  if (close && id) {
    close.addEventListener('click', function () {
      root.classList.add('no-announce');
      try {
        localStorage.setItem('taskpro.site.announce', id.getAttribute('content'));
      } catch (e) {
        /* hidden for this visit only */
      }
    });
  }

  var home = root.getAttribute('data-home');
  if (home) {
    var links = document.querySelectorAll('[data-cta="open"]');
    for (var i = 0; i < links.length; i++) links[i].setAttribute('href', home);
  }
})();
