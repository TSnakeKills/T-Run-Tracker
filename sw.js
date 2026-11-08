const CACHE_NAME = 'trun-tracker-v7';
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(CORE_ASSETS.map(url => new Request(url, { cache: 'reload' })));
        }).catch(() => {})
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

async function networkFirstWithFastFallback(request) {
    const cache = await caches.open(CACHE_NAME);
    const url = new URL(request.url);
    const isRootOrHtml = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
    const cacheKey = isRootOrHtml ? './index.html' : request;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    try {
        const networkResponse = await fetch(request, {
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (networkResponse && networkResponse.ok) {
            cache.put(cacheKey, networkResponse.clone());
            if (isRootOrHtml) {
                cache.put('./', networkResponse.clone());
            }
            return networkResponse;
        }
        throw new Error('Bad network status');
    } catch (err) {
        clearTimeout(timeoutId);
        const cachedResponse = await cache.match(cacheKey) || await cache.match(request) || await cache.match('./index.html');
        if (cachedResponse) {
            return cachedResponse;
        }
        throw err;
    }
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(networkFirstWithFastFallback(event.request));
});