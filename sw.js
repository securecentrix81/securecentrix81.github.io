const CACHE_NAME = "v2"; // Bump version to invalidate old caches

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/auth_immediate_ok",
  "/securecentrix81"
];

const OFFLINE_HTML = `
<!DOCTYPE html>
<html><head><title>Offline</title></head>
<body><h1>Offline</h1><p>This page is not available offline.</p></body>
</html>`;

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
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim()) // ✅ Properly chained
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((networkResponse) => {
        if (!networkResponse) return networkResponse;

        // Cache both normal 200 and opaque (cross-origin) responses
        if (
          networkResponse.status === 200 ||
          networkResponse.type === "opaque"
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }

        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        // Navigation requests get the offline page, NOT index.html
        if (event.request.mode === "navigate") {
          return new Response(OFFLINE_HTML, {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/html" },
          });
        }

        return new Response("", { status: 503 });
      })
  );
});
