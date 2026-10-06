const CACHE_PREFIX = "wave-same-mind-shell-";
const CACHE = `${CACHE_PREFIX}v11`;
const SHELL = [
  "/",
  "/chat",
  "/app",
  "/command",
  "/agents",
  "/overview",
  "/manifest.webmanifest",
  "/assets/wave-logo.webp",
  "/assets/wave-bg-desktop.webp",
  "/assets/wave-bg-mobile.webp",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/workflows/") ||
    url.pathname.startsWith("/runs/")
  ) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          return (await caches.match("/")) || Response.error();
        }
        return Response.error();
      }),
  );
});
