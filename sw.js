const CACHE_NAME = 't-run-tracker-v2';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json'
];

// Install event: cache core assets and skip waiting immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate event: clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Network-First strategy for HTML/JS/CSS to ensure fresh updates from GitHub
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If online and fetch succeeds, update cache and return response
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Fallback to cache if offline
        return caches.match(event.request);
      })
  );
});
