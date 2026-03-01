// Enso Service Worker — caches app shell for offline startup.
// Does NOT cache API responses or media.

const CACHE_NAME = "enso-shell-v1";
const SHELL_URLS = ["/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only cache same-origin navigation and static assets
  if (url.origin !== location.origin) return;
  // Never cache WS, API, media, or upload endpoints
  if (url.pathname.startsWith("/ws") || url.pathname.startsWith("/media/") || url.pathname.startsWith("/upload") || url.pathname.startsWith("/health")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful GET responses for static assets
        if (event.request.method === "GET" && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
