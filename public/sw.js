// Manhwa service worker: instant repeat loads, offline shell, a bounded page/cover cache,
// and downloaded chapters (src/lib/downloads.ts) served offline.
const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;
const IMAGES = `images-${VERSION}`;
// Downloaded chapters outlive app updates; never versioned or trimmed here.
const DOWNLOADS = "downloads";
const VIDEO_DOWNLOADS = "video-downloads";
const MAX_IMAGES = 800;
const MAX_SHELL = 50;
const OFFLINE_URL = "/offline";

// The downloads manager (src/lib/downloads.ts) names its caches after this version.
self.addEventListener("message", (event) => {
  if (event.data?.type === "mr:get-cache-version")
    event.source?.postMessage({ type: "mr:cache-version", version: VERSION });
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) =>
        c.addAll([
          OFFLINE_URL,
          "/downloads",
          "/manifest.webmanifest",
          "/icons/icon-192.png",
        ]),
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
            .filter(
              (k) =>
                k !== DOWNLOADS &&
                k !== VIDEO_DOWNLOADS &&
                !k.endsWith(VERSION),
            )
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

async function cacheFirst(request, cacheName, event) {
  // Any cache will do: a downloaded page lives in DOWNLOADS, a viewed one in IMAGES.
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok)
    // The response goes back now; the cache write and trim finish in the background.
    event.waitUntil(
      caches
        .open(cacheName)
        .then((cache) => cache.put(request, res.clone()))
        .then(() =>
          cacheName === IMAGES ? trim(IMAGES, MAX_IMAGES) : undefined,
        )
        .catch(() => {}),
    );
  return res;
}

async function networkFirst(request, event) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    // Search results are one-off URLs; caching them would flood the shell cache.
    if (res.ok && new URL(request.url).pathname !== "/search")
      event.waitUntil(
        cache
          .put(request, res.clone())
          .then(() => trim(SHELL, MAX_SHELL))
          .catch(() => {}),
      );
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

async function offlineMedia(request) {
  const cache = await caches.open(VIDEO_DOWNLOADS);
  const response = await cache.match(request);
  if (!response)
    return new Response(
      "Downloaded media is missing. Download this episode again.",
      { status: 404 },
    );
  const range = request.headers.get("range");
  if (!range) return response;
  const blob = await response.blob();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  let start = match?.[1] ? Number(match[1]) : 0;
  let end = match?.[2] ? Number(match[2]) : blob.size - 1;
  if (match && !match[1] && match[2]) {
    start = Math.max(0, blob.size - Number(match[2]));
    end = blob.size - 1;
  }
  if (!match || (!match[1] && !match[2]) || start > end || start >= blob.size)
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${blob.size}` },
    });
  end = Math.min(end, blob.size - 1);
  const headers = new Headers(response.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${blob.size}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Accept-Ranges", "bytes");
  return new Response(blob.slice(start, end + 1), { status: 206, headers });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Offline packages never fall through to the network or a newly signed source URL.
  if (url.pathname.startsWith("/offline-media/"))
    return event.respondWith(offlineMedia(request));
  // Video segments are large and already cached server-side.
  if (url.pathname.startsWith("/api/anime")) return;
  // The download manager stores pages itself.
  if (request.headers.get("x-mr-download")) return;
  if (url.pathname.startsWith("/api/img"))
    return event.respondWith(cacheFirst(request, IMAGES, event));
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  )
    return event.respondWith(cacheFirst(request, STATIC, event));
  if (request.mode === "navigate")
    return event.respondWith(networkFirst(request, event));
});
