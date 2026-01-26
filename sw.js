const addResourcesToCache = async (resources) => {
  const cache = await caches.open("v1");
  
  const additions = resources.map(async (url) => {
    try {
      return await cache.add(url);
    } catch (error) {
      console.error(`Failed to cache: ${url}`, error);
    }
  });

  await Promise.all(additions);
};

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // 1. Return cached file if found
      if (response) return response;

      // 2. Otherwise, fetch from network
      return fetch(event.request).then((networkResponse) => {
        // Don't cache if not a success or if it's a POST request
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;

        // 3. Add to cache for next time
        const responseToCache = networkResponse.clone();
        caches.open("dynamic-assets").then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });
    })
  );
});
