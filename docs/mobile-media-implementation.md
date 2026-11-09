# Mobile playback and offline episodes

The source research and platform constraints are recorded in `mobile-media-research.md`. This pass changes the PWA; no native download service is added.

## Playback

The direct anime player uses the stock hls.js loader. The old loader started future full-segment and one-byte requests, did not cancel those fetches, and replaced transfer timings with near-zero values. Removing it gives hls.js real bandwidth measurements, request cancellation and its normal ABR scheduling. The unmeasured 6 Mbps startup assumption is removed. Auto quality is size-aware; explicit resolution choices remain available, including 4K when the source supplies it. This does not establish smooth 4K decoding or network throughput on every phone.

Balanced forward buffering is 30 media seconds at 1x, generous buffering is 60, and data saver uses 15. The byte targets are 48, 100 and 15 MiB respectively; these settings are loading targets, not hard process memory ceilings. The back buffer is 15 seconds. Explicit data saver and optional browser save-data/2G hints also suppress next-episode warming.

Known direct media returns before CDN probing. Optional alternatives are fetched after actual playback begins and added without remounting the video engine. Shared media requests have deadlines, identity-safe cache eviction, and per-consumer cancellation so pausing a download does not cancel work shared with playback.

Playback settings use a native dialog sheet with 44px controls rather than overlaying several selectors across the video. The sheet escapes the short mobile video's clipping box. Waiting, paused and finished states are separate; a stalled fetch alone is not reported as stalled playback while future frames remain available.

## Offline episodes

On an anime title, Download offers the current episode, next episodes, a range, or all episodes in that title. Quality and available audio are checked before queueing. Bulk batches are limited to 200 and skip identical saved or queued selections. Other franchise entries are opened from Seasons; the app does not invent season grouping from episode numbers.

Supported direct VOD sources are packaged into a separate `video-downloads` cache with a durable index and paused queue restoration. The packager selects one video rendition, its associated audio, supported subtitles, init segments and ordinary AES-128 identity keys, and rewrites all dependencies to local `/offline-media/` URLs. It rejects live, DRM, byte-range and unsupported resource-bearing formats rather than declaring an incomplete package saved. Known resolution ceilings are enforced; unlisted resolutions are labeled source quality. Movie embeds still have no downloadable media contract.

Two bounded asset workers download one episode at a time. Completed resources are reused after pause or failure. The app checks quota/headroom, validates every required cache key, and commits the completed index only after all files exist. Direct playback yields new download requests until paused. Cancel/delete remove the job and package. Missing offline files produce a recovery message without falling through to network.

The service worker preserves video packages across updates and handles complete and byte-range reads. The download flow also prepares the offline Downloads screen and player chunks. HTTPS or trusted localhost, CacheStorage and an active service worker are required. Keep the app open for large transfers; PWA execution can be suspended by the OS. Offline storage belongs to the server origin and can be cleared by the user/browser. Video bytes and package manifests are not part of JSON backup.

Chapter downloads now have pause/resume, retained pages and a queue restored paused on reopening. Bulk chapter choices are in a dialog with counts and a confirmation action. Already saved/queued chapters are excluded from the next-unread batch.

## Ads

The direct app player loads media, not a provider's HTML player or advertising scripts. Anime fallback frames restrict popups/top navigation. New movie preferences do the same by default. These restrictions cannot remove advertisements rendered inside a foreign frame or stitched into a source video. Some providers will refuse restricted frames. This pass cannot promise ad-free arbitrary movie embeds.

## Verification

Run `node --test scripts/test-mobile-media.mjs scripts/test-video-downloads.mjs scripts/test-reliability.mjs`, `node scripts/test-movies.mjs`, `npm run lint`, and `npm run build`.

Browser QA uses a production PWA on trusted localhost. A generated five-second HLS fixture exercises actual decoding, the saved-video screen and service-worker asset reads. Reloading the offline player with both the application and fixture servers stopped plays the fixture through. Mobile settings fit at 320px with 44px controls and no horizontal overflow. Download selection is checked on a real anime title; full queue/download tests use controlled fixtures rather than claiming every third-party stream works. Physical-phone 4K, Safari/native HLS and OS-suspended background transfers remain unverified.
