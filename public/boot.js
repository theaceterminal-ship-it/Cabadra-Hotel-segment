// Runs before the app loads (see index.html). Kept in its own file, not inline, so the site's
// content policy can forbid inline scripts.
// One manifest per app, picked from the path before React loads, so the
// guest app, staff app, kitchen screen and owner dashboard install as
// separate apps (each manifest is scoped to its own path). Elsewhere (the
// website) there's nothing to install. src/hooks/usePwaManifest.ts keeps it
// right after in-app navigation.
(function () {
  var apps = [
    ['/guest', '/manifest.json', '/icons/guest-192.png', 'Cabadra Guest'],
    ['/reception', '/manifest-staff.json', '/icons/staff-192.png', 'Cabadra Staff'],
    ['/kitchen', '/manifest-kitchen.json', '/icons/kitchen-192.png', 'Kitchen'],
    ['/owner', '/manifest-owner.json', '/icons/owner-192.png', 'Cabadra Owner']
  ];
  var path = window.location.pathname;
  var link = document.querySelector('link[rel="manifest"]');
  for (var i = 0; i < apps.length; i++) {
    if (path === apps[i][0] || path.indexOf(apps[i][0] + '/') === 0) {
      link.href = apps[i][1];
      document.querySelector('link[rel="apple-touch-icon"]').href = apps[i][2];
      document.querySelector('meta[name="apple-mobile-web-app-title"]').content = apps[i][3];
      return;
    }
  }
  link.parentNode.removeChild(link);
})();

// The apps use the website's palette (.theme-site), switched on here before
// React loads so the first frames, and the phone's status and navigation
// bars, are never the old lavender. The guest app follows the phone's dark
// mode. No logo of our own here: the phone's launch screen already shows
// one, and a second one at a different height read as a jump.
(function () {
  var path = window.location.pathname;
  var isApp = /^\/(guest|reception|kitchen|owner|display|task|access|bill|partner)(\/|$)/.test(path);
  if (!isApp) return;
  var root = document.documentElement;
  root.classList.add('theme-site');
  var dark = /^\/guest(\/|$)/.test(path) && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) { root.classList.remove('light'); root.classList.add('dark'); }
  var bg = dark ? '#0e100e' : '#eef0ec';
  root.style.background = bg;
  document.querySelector('meta[name="theme-color"]').content = bg;
})();
