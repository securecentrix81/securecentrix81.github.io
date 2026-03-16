const CACHE_NAME = "v2";

const CANONICAL_PAGES = [
  "/",
  "/auth_immediate_ok/",
  "/securecentrix81/",
];

const OFFLINE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline</title>
  <style>
    body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f4f4f9; color: #333; }
    .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    button { width: 100%; padding: 12px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Offline</h1>
    <p>This page is not available offline.</p>
    <button onclick="location.href='/'">Go Home</button>
  </div>
</body>
</html>
`;

const abs = (path) => new URL(path, self.location.origin).toString();

/**
 * Adds a trailing slash to paths that look like pages (not files).
 * /page      → /page/
 * /page/     → /page/   (unchanged)
 * /style.css → /style.css (unchanged, has extension)
 * /          → /         (unchanged)
 */
function normalizePath(pathname) {
  if (pathname === "/") return pathname;
  if (pathname.endsWith("/")) return pathname;
  // If the last segment has a dot, treat it as a file — don't add slash
  const lastSegment = pathname.split("/").pop();
  if (lastSegment && lastSegment.includes(".")) return pathname;
  return pathname + "/";
}

/**
 * Returns the version of the path with the slash toggled.
 * /page → /page/  |  /page/ → /page
 */
function getAltPath(pathname) {
  if (pathname === "/" || pathname === "") return null;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname + "/";
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  for (const path of CANONICAL_PAGES) {
    try {
      const response = await fetch(abs(path), {
        cache: "reload",
        redirect: "follow",
      });

      if (!response.ok) continue;

      await cache.put(abs(path), response.clone());

      const alt = getAltPath(path);
      if (alt) {
        await cache.put(abs(alt), response.clone());
      }
    } catch (err) {
      console.warn("Precache failed for", path, err);
    }
  }
}

async function cleanupOldCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precacheAppShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await cleanupOldCaches();
      await self.clients.claim();
    })()
  );
});

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(request.url);

  const originalPath = url.pathname;
  const normalizedPath = normalizePath(originalPath);
  const altPath = getAltPath(originalPath);

  try {
    // Always fetch the normalized (slash-appended) version to avoid redirect issues
    const response = await fetch(new Request(abs(normalizedPath), {
      cache: "no-cache",
      redirect: "follow",
    }));

    if (response.ok) {
      // Cache the normalized version
      await cache.put(abs(normalizedPath), response.clone());

      // Also cache the original (slashless) version so both work offline
      if (originalPath !== normalizedPath) {
        await cache.put(abs(originalPath), response.clone());
      }

      return response;
    }

    throw new Error("Network response not ok");
  } catch (err) {
    // Offline fallback — try all path variations
    const cachedResponse =
      (await cache.match(abs(originalPath))) ||
      (await cache.match(abs(normalizedPath))) ||
      (altPath ? await cache.match(abs(altPath)) : null);

    if (cachedResponse) return cachedResponse;

    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=UTF-8" },
    });
  }
}

async function handleSameOriginAsset(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request, { cache: "no-cache" })
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    });

  if (cached) {
    event.waitUntil(networkFetch.catch(() => {}));
    return cached;
  }

  try {
    return await networkFetch;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") {
      event.respondWith(handleNavigation(request));
    } else {
      event.respondWith(handleSameOriginAsset(request, event));
    }
  } else {
    event.respondWith(fetch(request).catch(() => Response.error()));
  }
});
