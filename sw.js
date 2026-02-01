const CACHE_NAME = "v2"; // Change version when you update code

const addResourcesToCache = async (resources) => {
  const cache = await caches.open(CACHE_NAME);
  // Using cache.addAll is more efficient for the install step
  await cache.addAll(resources);
};

self.addEventListener("install", (event) => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  event.waitUntil(addResourcesToCache(["/", "/index.html"]));
});

self.addEventListener("activate", (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("Deleting old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  // Take control of the page immediately without a reload
  return self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    // 1. TRY NETWORK FIRST
    // Added { cache: 'no-cache' } or a timestamp to bypass browser HTTP cache
    fetch(event.request, { cache: "no-cache" }) 
      .then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          if (event.request.method === "GET") {
            cache.put(event.request, responseToCache);
          }
        });

        return networkResponse;
      })
      .catch(() => {
        // 2. FALLBACK TO CACHE IF OFFLINE
        return caches.match(event.request);
      })
  );
});
