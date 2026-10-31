// Manhwa service worker: instant repeat loads, offline shell, a bounded page/cover cache,
// and downloaded chapters (src/lib/downloads.ts) served offline.
const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;
const IMAGES = `images-${VERSION}`;
// Downloaded chapters outlive app updates; never versioned or trimmed here.
const DOWNLOADS = "downloads";
const MAX_IMAGES = 800;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) =>
        c.addAll([OFFLINE_URL, "/downloads", "/manifest.webmanifest", "/icons/icon-192.png"]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== DOWNLOADS && !k.endsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName) {
  // Any cache will do: a downloaded page lives in DOWNLOADS, a viewed one in IMAGES.
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, res.clone());
    if (cacheName === IMAGES) trim(IMAGES, MAX_IMAGES);
  }
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(request)) ??
      // The offline reader is /downloads?read=<chapter>.
      (await cache.match(request, { ignoreSearch: true })) ??
      (await cache.match(OFFLINE_URL)) ??
      Response.error()
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Video segments are large and already cached server-side.
  if (url.pathname.startsWith("/api/anime")) return;
  // The download manager stores pages itself.
  if (request.headers.get("x-mr-download")) return;
  if (url.pathname.startsWith("/api/img")) return event.respondWith(cacheFirst(request, IMAGES));
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))
    return event.respondWith(cacheFirst(request, STATIC));
  if (request.mode === "navigate") return event.respondWith(networkFirst(request));
});
