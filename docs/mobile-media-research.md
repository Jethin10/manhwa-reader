# Mobile playback and download research

Researched 2026-11-09 against official project documentation, standards and platform documentation. Research only. No application changes or device performance measurements. Recommendations below are implementation proposals, not measured speed gains.

## What the current code supports

| Area | Evidence in this checkout | Consequence |
| --- | --- | --- |
| Direct anime | `src/components/AdaptiveVideo.tsx`, `src/lib/anime-playback.ts`, `src/lib/anime-media.ts`, `src/app/api/anime/{media,stream}/route.ts` | App controls HLS loading, quality and available audio tracks for the supported direct source. |
| Anime fallback | `src/components/AnimePlayer.tsx` | Other sources use an unsandboxed cross-origin iframe. Direct-player tuning cannot affect these players. |
| Movies | `src/lib/movie-providers.ts`, `src/components/MoviePlayer.tsx` | Fixed-origin embeds with some provider messages and URL preferences. No direct movie media/download contract. Existing UI correctly explains this. |
| Offline comics | `src/lib/downloads.ts`, `src/components/Downloads.tsx`, `public/sw.js` | Chapter images use CacheStorage, metadata uses localStorage, active queue uses memory. Persistence requests and quota display already exist. Video is explicitly excluded from the service worker. |
| Native shell | `capacitor.config.ts`, `android/app/src/main/java/com/jethin/manhwa/MainActivity.java` | Capacitor opens a selected server. Download links open the external browser. Script popup suppression exists; no Media3 downloader/player or background download service exists in the inspected native code/build file. |
| Versions | `package.json`, installed `node_modules/hls.js/package.json` | Next 16.4.3, React 19.3, Capacitor 8, installed hls.js 1.7.4. No dependency upgrade is needed for the first recommendations. |

## Priorities for the current implementation

### P0: Let hls.js measure and schedule segment downloads

Change `src/components/AdaptiveVideo.tsx` to use the stock fragment loader first. Stop selecting `prefetchingLoader` from `src/lib/hls-prefetch.ts` on mobile/save-data connections; removing the override everywhere is the simplest baseline to evaluate.

Local evidence in the custom loader:

- Each requested fragment starts three full future fetches, or four at higher speed, before requesting the current fragment. Eight more URLs receive `Range: bytes=0-0` warming requests.
- Warming and later full fetches are separate requests. There is no evidence that a one-byte fetch populates the upstream CDN with a reusable full segment. Servers may also ignore a range request. Do not describe warming as a proven speed optimization.
- `abort()` and `destroy()` suppress callbacks but never abort the underlying fetches. Timeout and cache eviction also leave requests running. Episode changes, seeks and quality switches can therefore waste transfer.
- Promise entries are capped by count rather than bytes. Old-quality speculative work survives a quality switch. Full-file and byte-range paths do not share request identity.
- The loader fabricates first-byte/end timestamps at completion and supplies no incremental byte progress. The standard ABR controller uses loader timing and loaded bytes for bandwidth samples and emergency downswitch decisions. Cached handoffs can therefore look much faster than their actual network transfer. This is a code-based risk, not a measured claim that every session selects excessive quality. [Official 1.7.4 ABR implementation](https://raw.githubusercontent.com/video-dev/hls.js/v1.7.4/src/controller/abr-controller.ts)

If parallel loading is retained later, require AbortController cancellation, truthful network timings, bounded bytes/concurrency, correct URL plus byte-range keys and cancellation on source/level changes. Prefer fixing measured origin latency to rebuilding hls.js loader behavior.

### P0: Trial a conservative mobile playback policy

In `src/components/AdaptiveVideo.tsx`, remove the explicit `abrEwmaDefaultEstimate: 6_000_000`. The official 1.7.4 configuration starts at 500,000 bits/s. Keep ABR enabled and the existing worker/FPS-drop protection. hls.js already accounts for playback rate in starvation calculations. [Official configuration](https://raw.githubusercontent.com/video-dev/hls.js/v1.7.4/src/config.ts), [ABR implementation](https://raw.githubusercontent.com/video-dev/hls.js/v1.7.4/src/controller/abr-controller.ts)

Suggested experiment values, chosen for this app rather than prescribed by a standard:

| Setting | Mobile baseline to trial | Save-data baseline to trial |
| --- | --- | --- |
| Forward target | 20-30 media seconds at 1x | 10-15 media seconds |
| Maximum forward duration | 40-60 seconds | 20-30 seconds |
| Byte target | 20-30 MiB | 10-15 MiB |
| Back buffer | 10-15 seconds | 5-10 seconds |
| Auto resolution | Size-aware cap or existing Smooth mode | Existing Smooth cap, up to 720p |
| Speculative segments/range warming | Off | Off |

The current balanced plan requests 60 seconds times playback speed; generous requests 90. Buffer duration is a loading target, not a startup gate. Reducing it primarily reduces background transfer/memory, and may increase rebuffering on unstable links. `maxBufferSize` is not a hard process-memory ceiling; `maxBufferLength` takes precedence, and `maxMaxBufferLength` constrains duration. `startLevel: -1` performs automatic bandwidth-based startup. `capLevelToPlayerSize` can constrain auto choices. Keep an explicit quality override. [Version-matched hls.js API](https://raw.githubusercontent.com/video-dev/hls.js/v1.7.4/docs/API.md)

Add an explicit data-saver preference in `src/lib/preferences.ts` and `src/components/PreferenceControls.tsx`. Treat optional `navigator.connection.saveData` as an additional signal; absent information must not mean unlimited data or Wi-Fi. Listen for connection changes where supported. This API is a WICG draft, so feature detection and a user setting matter. [Network Information specification](https://wicg.github.io/netinfo/)

In `src/components/AnimePlayer.tsx`, gate `warmNext()` under data saver. It currently runs on next-button pointer entry/focus and calls `loadMedia`, not a browser segment download. However, `getAnimeMedia()` in `src/lib/anime-media.ts` fetches playlists and awaits up to four server-side CDN range probes before returning media. These probes add startup dependency and upstream traffic, even though they are not all mobile payload bytes. A later change can return the known original source promptly and discover alternatives lazily. Preserve host allowlists, signatures, redirect restrictions and finite timeouts.

Changing only `<video preload>` will not stop hls.js from loading. An explicit tap-to-start/save-data policy must also control `autoStartLoad`/`startLoad`, mounting and `play()`. Do not put a new heavy capability probe or CDN race on the critical path. [hls.js API](https://raw.githubusercontent.com/video-dev/hls.js/v1.7.4/docs/API.md)

### P1: Make playback state truthful on native and MSE paths

`AdaptiveVideo.tsx` already handles `playing`, `waiting` and `stalled`; preserve that work. Use `playing` as the success signal. `loadedmetadata` only establishes metadata. `waiting` means playback lacks future data; `stalled` describes interrupted fetching and does not alone mean playback has stopped. Calculate buffered time using the range containing `currentTime`, as the current code already attempts. Clear stale buffering messages on pause/end/source change and distinguish autoplay rejection from a network failure. Avoid waiting for `canplaythrough`, which is an estimate. [HTML media processing and events](https://html.spec.whatwg.org/multipage/media.html)

Preserve native Safari HLS and `playsInline`. Prefer capability checks with a documented native-HLS preference over relying exclusively on the current Safari user-agent regex, especially for WKWebView. Native selection must remain separate from hls.js quality/audio controls; `engine.current` is null there. Safari supports metadata preload, but audible autoplay generally needs a user gesture. Keep the existing rejected-play fallback actionable. [Apple Safari delivery guide](https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari)

### P1: Keep 4K optional and capability-aware

The API takes exact MIME/codec, width, height, bitrate and frame rate and returns `supported`, `smooth`, `powerEfficient`. Use `media-source` for MSE and `file` for ordinary file playback. Feature-detect, catch rejection and avoid inventing missing codec metadata. These are decoding estimates, not bandwidth guarantees; there is no universal mobile 4K cutoff. A positive result cannot guarantee sustained thermal performance. [W3C Media Capabilities](https://w3c.github.io/media-capabilities/)

hls.js 1.7.4 already enables `useMediaCapabilities` in the full build, with selective queries implemented in its helper. Keep that enabled before adding a duplicate application query. Existing `capLevelOnFPSDrop` is useful. A conservative auto cap can coexist with explicit 2160p selection when the rendition actually exists; never label all 4K streams as smooth or available. [Official helper implementation](https://raw.githubusercontent.com/video-dev/hls.js/v1.7.4/src/utils/mediacapabilities-helper.ts), [configuration](https://raw.githubusercontent.com/video-dev/hls.js/v1.7.4/src/config.ts)

## Offline downloads: achievable work and missing prerequisites

### Browser downloads require a complete offline package

HLS is a playlist graph, not an MP4 file. An offline package must include a selected video rendition, chosen audio/subtitles, every referenced segment, initialization sections, byte ranges and applicable keys. Rewrite references to stable local identities and publish completion only after validation. Do not cache only the master playlist or allow offline ABR to request uncached renditions. DRM would require a separate supported license workflow; the inspected code establishes no such workflow. [HLS format specification, RFC 8216](https://www.rfc-editor.org/rfc/rfc8216)

For a real progressive MP4 source, explicitly download the complete file and serve range requests for seeking. A playback session normally fetches partial content, so runtime playback caching does not establish a complete download. The official Workbox recipe explains this and range handling; adopting Workbox itself is optional. [Chrome cached media guide](https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video)

`public/sw.js` bypasses all `/api/anime` traffic and foreign origins. `rewritePlaylist()` can emit relay URLs, so an offline implementation must cover both proxy and relay resources. The API's in-process segment cache is server memory, not offline device storage. Signed/source URLs may change across sessions or server configuration changes; offline identity should not depend on a newly generated online URL.

Do not repurpose the comic image cache implicitly. Add a separate media cache/index and resumable jobs if browser video downloads become a scoped feature. The current `PlaybackMedia` has no download-size, variant or durable offline-package contract, and the player assumes HLS rather than exposing an MP4 path.

### Storage and native-shell constraints

`navigator.storage.estimate()` returns approximate quota/usage. Check before and during a large download, retain headroom, handle quota failures, clean partial entries and validate cached bytes when listing completed downloads. `persist()` can be denied and users can still clear storage. Existing comics already request persistence and show quota; extend those behaviors rather than duplicating them. Browser quotas are origin-scoped, so a changed server hostname/port can expose a different download library. [WHATWG Storage](https://storage.spec.whatwg.org/)

Service workers require a secure context. A plain HTTP LAN address is not generally equivalent to trusted localhost. The shell explicitly supports HTTP servers; its HTTPS Android asset scheme does not make an arbitrary remote HTTP server trustworthy. Feature-detect secure context, CacheStorage and service-worker control on the actual loaded page. Do not promise offline web media everywhere the current connect screen works. [Secure Contexts standard](https://www.w3.org/TR/secure-contexts/), [Service Worker specification](https://w3c.github.io/ServiceWorker/)

### Android background downloads need native implementation

Media3 provides `DownloadService`, persistent `DownloadIndex`, `DownloadManager`, an optional scheduler and foreground progress notifications. `DownloadHelper` selects adaptive tracks; offline playback must use corresponding stream keys and the same download cache. A Media3 cache is not automatically readable by HTMLVideoElement/hls.js. Choose native playback or design and test an explicit local-serving bridge. This is a separate feature, not a small JavaScript queue patch. [Android media downloads](https://developer.android.com/media/media3/exoplayer/downloading-media)

Future files would include native plugin/service classes beside `MainActivity.java`, plus `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`, a typed web bridge and download UI. Configure required foreground service permissions/type and notifications. Use requirements such as `NETWORK_UNMETERED`, optionally charging, and `DEVICE_STORAGE_NOT_LOW`; allow user cancellation and persist state. Unmetered is a billing classification, not proof of Wi-Fi. [Media3 Requirements](https://developer.android.com/reference/androidx/media3/exoplayer/scheduler/Requirements)

WorkManager can run long transfers through a foreground service but Android 16 long-running workers can consume job quota. Android recommends considering user-initiated data transfer jobs for long user-triggered transfers, or a directly launched foreground service where appropriate. Select an OS-aware approach and test background starts, process death and notification behavior. It is not an unrestricted execution guarantee. [Long-running workers](https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running), [user-initiated transfers](https://developer.android.com/develop/background-work/background-tasks/uidt)

Native iOS has a different path through AVFoundation asset download sessions and media selections. Android work does not implement it. [Apple offline playback and storage](https://developer.apple.com/documentation/avfoundation/offline-playback-and-storage)

### Intuitive download scope

For a future direct-source implementation, offer episode / selected episodes / all available episodes, then available audio language, subtitles and quality, an estimated size and an explicit Download action. Season grouping needs actual season metadata; current anime `Episode` has id/number/title/filler and franchise entries are separate titles. Do not infer every franchise title is a season.

Persist job identity by content plus episode plus audio selection plus rendition. Show queued/downloading/paused/failed/complete states, progress, retry, cancel and delete. Resolve only selected items with bounded concurrency. Record chosen audio tracks, because `sub`/`dub` alone does not describe every language in a multilingual HLS source. Whole-movie and movie-season downloads remain unavailable until a direct media provider contract exists.

## Ads and cross-origin embed limits

Parent JavaScript cannot inspect or remove cross-origin iframe DOM or read its media URLs. Provider `postMessage` events grant only the information the provider deliberately exposes. Keep `MoviePlayer.tsx` checks for exact origin and active iframe window. Parent CSS and the app service worker do not provide a general ad filter inside these providers. This follows the cross-origin access model and the current service-worker routing. [HTML cross-origin objects](https://html.spec.whatwg.org/multipage/browsers.html#cross-origin-objects)

`MoviePlayer.tsx` already offers `isolatePlayer`; its default in `src/lib/movie-library.ts` is false. Isolation permits scripts/same-origin/forms/presentation but withholds popups and top navigation. That can block popup behavior while retaining inline overlays, ad requests and in-stream ads. Removing scripts may break playback; removing same-origin can break provider storage/authentication. `allow-same-origin` preserves the provider's origin, not access to the app origin. Scripts plus same-origin are especially unsafe if untrusted content is hosted on the app's own origin. Apply changes through a remount/reload. [HTML iframe sandbox](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox)

Low-risk actions are to explain isolation accurately, offer it consistently for anime fallback embeds, keep provider switching explicit and retain native popup suppression. Test compatibility before changing the default. Do not label a provider's claimed ad-free mode as verified. Android URL interception is a possible later native feature, but has request/redirect coverage limits and cannot guarantee removal of same-origin or stitched ads. [Android WebViewClient](https://developer.android.com/reference/android/webkit/WebViewClient#shouldInterceptRequest(android.webkit.WebView,%20android.webkit.WebResourceRequest))

## Bounded implementation and verification handoff

1. First patch `AdaptiveVideo.tsx` to use stock loading, a conservative mobile policy and clear playback states. Gate `AnimePlayer.tsx` warming with the same preference. No download claims are needed for this patch.
2. Measure click-to-first-`playing`, rebuffer duration/count, bytes transferred before playback and after a source change, quality switches and dropped frames. Compare stock and current loading on the same stream, cold/warm cache, constrained network and 1x/2x playback. Confirm save-data triggers no speculative requests.
3. Exercise seek, episode/language/delivery switch, autoplay rejection and hidden-page behavior. Test Android WebView and actual Safari separately. Desktop browser emulation cannot establish mobile decoding or background reliability.
4. Keep movie downloads unavailable with an explanation. Plan direct-source offline packaging and native background work separately. Test offline launch with the server disconnected, seek/audio/subtitles, partial failure, quota exhaustion, app restart and missing cached resources before claiming offline support.

No app build/lint or device benchmark was run because this task changes only this research document. Source access and local code inspection establish the recommendations; they do not establish a playback-speed result.
