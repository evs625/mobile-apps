const CACHE_NAME = "particle-system-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
  "./src/main.js",
  "./src/render/WebGLRenderer.js",
  "./src/simulation/Simulation.js",
  "./src/simulation/SpatialHash.js",
  "./src/simulation/config.js",
  "./src/simulation/force.js",
  "./src/simulation/math.js",
  "./src/simulation/touch.js",
  "./src/simulation/types.js",
  "./src/ui/Controls.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });

      return cached || network.catch(() => caches.match("./index.html"));
    }),
  );
});
