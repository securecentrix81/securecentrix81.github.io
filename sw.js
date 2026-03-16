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

function hasExtension(pathname) {
  const lastSegment = pathname.split("/").filter(Boolean).pop() || "";
  return lastSegment.includes(".");
}

/**
 * Returns the version of the path with the slash toggled.
 * /page -> /page/
 * /page/ -> /page
 */
function getAltPath(pathname) {
  if (pathname === "/" || pathname === "") return null;
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname + "/";
}

/**
 * For navigation requests, try common equivalent URL forms.
 * Examples:
 *   /versions       -> /versions, /versions/, /versions.html, /versions.html/
 *   /versions/      -> /versions/, /versions, /versions.html, /versions.html/
 *   /versions.html  -> /versions.html, /versions.html/, /versions, /versions/
 *   /versions.html/ -> /versions.html/, /versions.html, /versions, /versions/
 */
function getNavigationCandidatePaths(pathname) {
  const out = [];
  const add = (p) => {
    if (p && !out.includes(p)) out.push(p);
  };

  add(pathname);

  if (pathname === "/") return out;

  if (/\.html\/$/i.test(pathname)) {
    const htmlPath = pathname.slice(0, -1);
    const noHtml = htmlPath.replace(/\.html$/i, "");
    add(htmlPath);
    add(noHtml);
    add(noHtml + "/");
    return out;
  }

  if (/\.html$/i.test(pathname)) {
    const noHtml = pathname.replace(/\.html$/i, "");
    add(pathname + "/");
    add(noHtml);
    add(noHtml + "/");
    return out;
  }

  if (pathname.endsWith("/")) {
    const base = pathname.slice(0, -1);
    add(base);
    if (!hasExtension(base)) {
      add(base + ".html");
      add(base + ".html/");
    }
    return out;
  }

  if (!hasExtension(pathname)) {
    add(pathname + "/");
    add(pathname + ".html");
    add(pathname + ".html/");
  }

  return out;
}

function getNavigationCandidateUrls(url) {
  return getNavigationCandidatePaths(url.pathname).map(
    (pathname) => url.origin + pathname + url.search
  );
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
        await cache.put(abs(alt), Response.redirect(abs(path), 308));
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

async function cacheResolvedNavigation(cache, attemptedUrls, finalUrl, response) {
  const writes = [cache.put(finalUrl, response.clone())];

  for (const attemptedUrl of attemptedUrls) {
    if (attemptedUrl !== finalUrl) {
      writes.push(cache.put(attemptedUrl, Response.redirect(finalUrl, 308)));
    }
  }

  await Promise.allSettled(writes);
}

async function handleNavigation(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE_NAME);
  const candidates = getNavigationCandidateUrls(url);

  let firstFailure = null;
  const attempted = [];

  for (const candidateUrl of candidates) {
    attempted.push(candidateUrl);

    try {
      const response = await fetch(candidateUrl, {
        credentials: "same-origin",
        redirect: "follow",
      });

      if (!response.ok) {
        if (!firstFailure) firstFailure = response;
        continue;
      }

      const finalUrl = response.url || candidateUrl;

      await cacheResolvedNavigation(cache, attempted, finalUrl, response);

      if (finalUrl !== request.url) {
        return Response.redirect(finalUrl, 308);
      }

      return response;
    } catch {
      // Try the next candidate
    }
  }

  // Offline/cache fallback
  for (const candidateUrl of candidates) {
    const cached = await cache.match(candidateUrl);
    if (!cached) continue;

    if (candidateUrl !== request.url) {
      return Response.redirect(candidateUrl, 308);
    }

    return cached;
  }

  if (firstFailure) return firstFailure;

  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8" },
  });
}

async function handleSameOriginAsset(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request, { cache: "no-cache" }).then(async (response) => {
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
