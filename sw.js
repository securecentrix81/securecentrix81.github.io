const CACHE_NAME = "v1";

// 1. Pre-cache your core "shell"
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

// 2. The Network-First Strategy (for EVERYTHING)
self.addEventListener("fetch", (event) => {
  event.respondWith(
    // TRY NETWORK FIRST
    fetch(event.request)
      .then((networkResponse) => {
        // If we are here, we are ONLINE and the server responded.

        // Check if we received a valid response
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Clone the response because it's a stream and can only be consumed once
        const responseToCache = networkResponse.clone();

        // Update the cache in the background with this fresh version
        caches.open(CACHE_NAME).then((cache) => {
          // Only cache GET requests (POST/PUT cannot be cached)
          if (event.request.method === "GET") {
            cache.put(event.request, responseToCache);
          }
        });

        // Return the fresh network response to the browser
        return networkResponse;
      })
      .catch(() => {
        // If we are here, the network failed (we are OFFLINE).
        // Fallback to cache.
        console.error("debugging: " + event.request)
        return caches.match(event.request);
      })
  );
});
