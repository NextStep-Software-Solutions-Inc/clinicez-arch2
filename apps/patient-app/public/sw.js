/**
 * ClinicEZ Patient Web Service Worker
 * 
 * PHI PROTECTION MANDATE:
 * Under RA 10173 (Philippine Data Privacy Act), patient health records (PHI)
 * and API responses MUST NEVER be stored in service worker CacheStorage.
 * All API routes, SSE/stream connections, and auth requests bypass this worker.
 */

const CACHE_NAME = 'clinicez-patient-v1';

// Static assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/clinic-ez_mark.svg',
  '/clinic-ez_logo.svg',
  '/sql-wasm.wasm',
  '/sql-wasm-browser.wasm'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching asset failed:', err);
      });
    })
  );
});

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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Only handle GET requests
  if (req.method !== 'GET') {
    return;
  }

  // 2. Only handle HTTP/HTTPS schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 3. STRICT PHI & AUTH BYPASS:
  // Never intercept or cache API calls, SSE streams, Clerk auth, or backend servers
  const isApiRoute = url.pathname.startsWith('/api/') || 
                     url.pathname.includes('/api/v1/') || 
                     url.pathname.includes('/stream') ||
                     url.hostname.includes('clerk') ||
                     url.hostname.includes('patient-api') ||
                     url.hostname.includes('clinic-api');

  if (isApiRoute) {
    return;
  }

  // 4. Navigation requests (HTML): Network first with cached index.html fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) || (await cache.match('/'));
      })
    );
    return;
  }

  // 5. Immutable static chunks & WASM: Cache-first
  const isImmutable = url.pathname.startsWith('/_expo/static/') ||
                      url.pathname.endsWith('.wasm') ||
                      url.pathname.endsWith('.svg');

  if (isImmutable) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // 6. General static resources: Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkRes;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
