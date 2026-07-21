const CACHE_NAME = "catchum-mobile-v9";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
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
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      });
      return cached || network.catch(() => caches.match("./index.html"));
    }),
  );
});
