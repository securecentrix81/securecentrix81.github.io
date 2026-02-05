const CACHE_NAME = "v2"; // Bump version to activate new SW

const PRECACHE_URLS = [
  "/",
  "/index.html",
  // Add other critical assets
];

const addResourcesToCache = async (resources) => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(resources);
};

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(addResourcesToCache(PRECACHE_URLS));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cache) => cache !== CACHE_NAME)
          .map((cache) => {
            console.log("Deleting old cache:", cache);
            return caches.delete(cache);
          })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((networkResponse) => {
        // Don't cache non-successful responses
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Clone and cache the response
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      })
      .catch(async () => {
        // Try to get from cache first
        const cachedResponse = await caches.match(event.request);

        if (cachedResponse) {
          return cachedResponse;
        }

        // For navigation requests (HTML pages), fall back to index.html
        // This is crucial for SPAs with client-side routing
        if (event.request.mode === "navigate") {
          const fallback = await caches.match("/index.html");
          if (fallback) {
            return fallback;
          }
        }

        // Return a proper offline response instead of undefined
        return new Response(
          "<h1>Offline</h1><p>This page is not available offline.</p>",
          {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/html" },
          }
        );
      })
  );
});
