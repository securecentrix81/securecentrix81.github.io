const CACHE_NAME = "v1";

// 1. Pre-cache your core "shell" (Home page, etc.)
const addResourcesToCache = async (resources) => {
  const cache = await caches.open(CACHE_NAME);
  const additions = resources.map(async (url) => {
    try {
      return await cache.add(url);
    } catch (error) {
      console.error(`Failed to cache: ${url}`, error);
    }
  });
  await Promise.all(additions);
};

self.addEventListener("install", (event) => {
  event.waitUntil(addResourcesToCache(["/", "/index.html"]));
});

// 2. The Smart Hybrid Fetch Strategy
self.addEventListener("fetch", (event) => {
  const isHTML = event.request.mode === "navigate";

  if (isHTML) {
    // --- STRATEGY A: NETWORK-FIRST (For HTML/Pages) ---
    // Try to get fresh HTML from the server so updates show up.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => caches.match(event.request)) // Fallback to cache if offline
    );
  } else {
    // --- STRATEGY B: CACHE-FIRST (For Images, JS, CSS) ---
    // Load from disk immediately for speed.
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) return networkResponse;

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        });
      })
    );
  }
});
