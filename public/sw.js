/* TROSA PROPI - Service Worker */

const CACHE_NAME = "trosa-propi-v1";
const STATIC_ASSETS = [
  "/", "/index.html", "/css/style.css",
  "/js/constants.js", "/js/rules.js", "/js/ai.js",
  "/js/ui.js", "/js/local.js", "/js/online.js", "/js/main.js",
  "/manifest.json", "/icons/icon.svg"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/socket.io")) return;
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        if (resp && resp.status === 200 && resp.type === "basic") {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return resp;
      }).catch(() => {
        if (event.request.mode === "navigate") return caches.match("/index.html");
      });
    })
  );
});
