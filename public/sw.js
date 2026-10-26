const CACHE_NAME = 'cabadra-pwa-v5';

// Four installable apps share this one worker: guest (/guest), staff
// (/reception), kitchen (/kitchen) and owner (/owner), each with its own
// manifest and scope so they install and open separately.
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest-staff.json',
  '/manifest-kitchen.json',
  '/manifest-owner.json',
  '/favicon.ico',
  '/icons/guest-192.png',
  '/icons/guest-512.png',
  '/icons/staff-192.png',
  '/icons/staff-512.png',
  '/icons/kitchen-192.png',
  '/icons/kitchen-512.png',
  '/icons/owner-192.png',
  '/icons/owner-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.allSettled(
          CORE_ASSETS.map(url => cache.add(url).catch(err => console.warn('PWA Cache item warning:', url, err)))
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Handle SPA navigation requests (e.g. /guest/..., /reception/...)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) return cachedResponse;
          const indexFallback = await caches.match('/index.html') || await caches.match('/');
          return indexFallback || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        })
    );
    return;
  }

  // App manifests and icons: always from the network (cache only when
  // offline), so an installed app picks up new colours and icons the next
  // time the phone checks, instead of being served an old cached copy.
  const url = new URL(event.request.url);
  if (/^\/manifest[^/]*\.json$/.test(url.pathname) || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-while-revalidate for assets
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse.ok && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
