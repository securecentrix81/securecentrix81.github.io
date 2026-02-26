const CACHE_NAME = "v2"; // Bump version to invalidate old caches

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/auth_immediate_ok",
  "/securecentrix81"
];

const OFFLINE_HTML = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offline</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f9;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        color: #333;
      }

      .container {
        background-color: #ffffff;
        padding: 40px;
        border-radius: 8px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        width: 100%;
        max-width: 400px;
        text-align: center;
      }

      h1 {
        font-size: 28px;
        margin-bottom: 20px;
        color: #2c3e50;
      }

      button {
        width: 100%;
        padding: 12px;
        background-color: #3498db;
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 16px;
        cursor: pointer;
        transition: background-color 0.3s ease;
      }

      button:hover {
        background-color: #2980b9;
      }

      p {
        margin-top: 20px;
        font-size: 18px;
      }

      a {
        color: #3498db;
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Offline</h1>
      <p>This page is not avaliable offline</p>
      <button onclick="location.href='/'" href="/">Go Home</button>
    </div>
  </body>
</html>
`;

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
        // 1. Try exact match
        let cachedResponse = await caches.match(event.request);

        // 2. If not found, try toggling the trailing slash
        if (!cachedResponse) {
          const url = new URL(event.request.url);
          const alternatePath = url.pathname.endsWith("/")
            ? url.pathname.slice(0, -1)
            : url.pathname + "/";
          cachedResponse = await caches.match(alternatePath);
        }

        if (cachedResponse) return cachedResponse;

        // Navigation requests get the offline page
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
