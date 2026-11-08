const CACHE_NAME = 'trun-tracker-v9';
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            for (const url of CORE_ASSETS) {
                try {
                    const res = await fetch(new Request(url, { cache: 'reload' }));
                    if (res && res.ok) {
                        await cache.put(url, res);
                        continue;
                    }
                } catch (_) {}
                const priorMatch = await caches.match(url, { ignoreSearch: true });
                if (priorMatch) {
                    await cache.put(url, priorMatch);
                }
            }
        })()
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const currentCache = await caches.open(CACHE_NAME);
            const hasIndex = await currentCache.match('./index.html', { ignoreSearch: true });

            if (!hasIndex) {
                const allKeys = await caches.keys();
                for (const key of allKeys) {
                    if (key !== CACHE_NAME) {
                        const oldCache = await caches.open(key);
                        const oldIndex = await oldCache.match('./index.html', { ignoreSearch: true });
                        if (oldIndex) {
                            await currentCache.put('./index.html', oldIndex.clone());
                            await currentCache.put('./', oldIndex.clone());
                            break;
                        }
                    }
                }
            }

            const keys = await caches.keys();
            await Promise.all(
                keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

async function handleAppRequest(event) {
    const request = event.request;
    const cache = await caches.open(CACHE_NAME);
    const url = new URL(request.url);
    const isRootOrHtml = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html') || request.mode === 'navigate';
    const cacheKey = isRootOrHtml ? './index.html' : request;

    const cachedResponse =
        (await cache.match(cacheKey, { ignoreSearch: true })) ||
        (await cache.match(request, { ignoreSearch: true })) ||
        (isRootOrHtml ? await cache.match('./', { ignoreSearch: true }) : null);

    const networkPromise = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2200);
        try {
            const response = await fetch(request, {
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timer);
            if (response && response.ok) {
                const clone1 = response.clone();
                const clone2 = isRootOrHtml ? response.clone() : null;
                event.waitUntil(
                    Promise.all([
                        cache.put(cacheKey, clone1),
                        clone2 ? cache.put('./', clone2) : Promise.resolve()
                    ]).catch(() => {})
                );
                return response;
            }
            throw new Error('Bad status');
        } catch (err) {
            clearTimeout(timer);
            throw err;
        }
    })();

    networkPromise.catch(() => {});

    if (cachedResponse) {
        const timeoutFallback = new Promise((resolve) => {
            setTimeout(() => resolve(cachedResponse), 1000);
        });
        try {
            return await Promise.race([
                networkPromise.catch(() => cachedResponse),
                timeoutFallback
            ]);
        } catch (_) {
            return cachedResponse;
        }
    }

    return networkPromise;
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    if (url.searchParams.has('_gh_cb')) return;

    event.respondWith(handleAppRequest(event));
});