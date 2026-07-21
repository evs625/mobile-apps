const CACHE_NAME = "catchum-mobile-v11";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./touch-controller.css",
  "./app.js",
  "./swipe-controller.js",
  "./visual-motion.js",
  "./engine.js",
  "./engine.js?original",
  "./engine-fixed.js",
  "./tilt.js",
  "./tilt.js?original",
  "./tilt-fixed.js",
  "./tilt-fixed.js?lateral",
  "./motion-controller.js",
  "./motion-controller.js?base",
  "./motion-controller-invert.js",
  "./motion-mode.js",
  "./rotation-invert.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();

    // A new app shell must replace any page still rendered from an older cache.
    // Reload each open CatChum window once when this worker activates.
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map(async (client) => {
      try {
        await client.navigate(client.url);
      } catch {
        // Navigation can fail while offline; the current page remains usable.
      }
    }));
  })());
});

async function fetchAndCache(request) {
  const response = await fetch(request, { cache: "no-cache" });
  if (response.ok && new URL(request.url).origin === self.location.origin) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      // Online loads always check the deployed app first, preventing stale menus
      // and mismatched HTML/JavaScript modules after an update.
      return await fetchAndCache(event.request);
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const fallback = await caches.match("./index.html");
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});
