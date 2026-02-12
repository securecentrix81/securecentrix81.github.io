const CACHE_NAME = "v2"; // Bump version to invalidate old caches

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/auth_immediate_ok",
  "/securecentrix81",
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

        if (networkResponse.status === 200 || networkResponse.type === "opaque") {
          const responseToCache = networkResponse.clone();
          
          // Logic to handle trailing slashes
          const url = new URL(event.request.url);
          const isTrailing = url.pathname.endsWith('/');
          const altPathname = isTrailing 
            ? url.pathname.slice(0, -1) 
            : url.pathname + '/';
          
          // Create the alternative URL (keeping search params and hash)
          const altUrl = new URL(url.href);
          altUrl.pathname = altPathname;

          caches.open(CACHE_NAME).then((cache) => {
            // Store the original request
            cache.put(event.request, responseToCache);
            
            // Store the alternative version (cloning the response again)
            // We use altUrl.href as the key
            cache.put(altUrl.href, responseToCache.clone());
          });
        }

        return networkResponse;
      })
      .catch(async () => {
        // caches.match automatically handles finding the exact URL match
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

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
