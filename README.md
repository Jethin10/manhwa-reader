# Manhwa

A local manga reader and anime watch app, built with Next.js.

## Run

```powershell
npm install
npx playwright install chromium
npm run build
npm start -- -p 3123
```

For development, run `npm run dev -- -p 3123`.

## Reading

Open `/manga` for Japanese manga, or browse `/series` and choose Asura Scans, Comix, MangaDex, or all connected sources. Results keep their source labels, chapter IDs, bookmarks, and reading history separate. Series pages link to searches on the other sources.

Asura supplies its public catalog and free chapters. Premium and early-access chapters are omitted. Comix uses a local headless Chromium session to load its public website. It is slower on first visits, especially while collecting the chapter list and page URLs. It requires the Playwright browser installed above. Site challenges or layout changes can interrupt a source; catalog failures appear beside the results and other sources remain usable.

The immersive reader offers continuous scroll, single pages, and double-page spreads; independent RTL/LTR direction; spread offset; width/height fitting; black/dim/paper/sepia surrounds; image brightness/contrast; gaps; configurable preloading; and title-specific presets. Manga defaults to single-page RTL; manhwa defaults to continuous scroll. Keyboard, edge taps, swipes, chapter navigation, translation choices and saved positions are supported. Original-quality pages remain available with optional HD sharpening. Existing MangaDex bookmarks still work.

## Anime

Open `/anime` for popular titles, search, recently updated shows, airing titles, and dubs. Selecting a show opens a franchise strip with its linked main series, movies, and specials. Bleach includes the original series, all four Thousand-Year Blood War parts, four movies, and related specials. These are franchise relationships, not a blanket claim that every movie or special is canon. Entries with no linked season order are supplemented from the source catalog.

Adaptive HD uses the source's public HLS stream directly in the app. The player discovers actual renditions and supports Auto or manual resolution choices such as 480p, 720p, and 1080p when supplied. Smooth mode uses adaptive quality capped at 720p. It buffers ahead, decodes through the browser, retries interrupted playback, and switches to another verified delivery CDN when a CDN fails. Safari uses native HLS and automatic browser quality control.

Delivery servers are taken from the provider's published CDN list. The app samples a small byte range from a video segment on several hosts and chooses the fastest responding reachable host. The CDN selector also permits manual switching. These response measurements are a starting point, not a sustained throughput guarantee. HD-1 and the original embedded player remain alternatives. Availability checks identify currently unreachable player pages; successful page retrieval alone cannot guarantee successful video playback.

Episode/server metadata is cached and fetched concurrently. The browser deduplicates requests and can warm the next episode on navigation intent. Long lists display 50 episodes at a time with range selection and global episode search. Native playback saves timestamps, supports resume, and can automatically advance to the next episode.

`/api/anime/stream` serves only signed URLs on the playback host allowlist, rejects redirects, preserves HTTP Range responses, rewrites nested playlist URLs, and streams bytes through without transcoding. Manifests are briefly cached and recently played segments use a bounded 96 MiB memory cache. Disconnects cancel upstream transfers. The proxy supplies the public player's required referrer and does not expose arbitrary URL fetching. Media configuration is short-lived and cached; no account credentials or DRM extraction are involved.

Anime metadata and server links come from HiAnime.tr, an independent site using the HiAnime name. Maximum quality depends on the original upload and available bitrate. Auto mode can reduce stalls on weaker connections; forcing 1080p cannot make a connection sustain more video data than it can download.

## Images and local data

`/api/img` caches originals and resized versions in the OS temporary directory under `manhwa-reader-img`. Covers use the original image and pages can be served unchanged or with optional 2x sharpening. The proxy allows known source image hosts; rotating Comix image URLs require a signature issued by the source adapter. It rejects arbitrary unsigned hosts and redirects.

The Library combines manga, manhwa and anime with Planned, In progress, Completed, On hold and Dropped statuses, search, filters, sorting, grid/list display and recent-history removal. Completed/dropped titles leave Continue reading/watching while staying in the Library.

Open `/settings` for reader defaults, playback speed, seek step, preferred audio, subtitle text style, picture fitting, buffer budget, optional timestamped intro skipping, auto-next, pause-hidden, accent color and reduced motion. Native video shortcuts are Space/K, J/L or arrows, M, F, C and P. Changes persist without reloading playback. External embeds retain their own player behavior.

Versioned JSON backup/restore transfers local lists, reader presets, progress and preferences. Imports are validated before saving and merge saved lists. Data lives in browser localStorage; there is no account sync. No deployment is required.

See [RESEARCH.md](RESEARCH.md) for the Reddit findings, implementation decisions and 4K investigation. The quality menu exposes real 2160p when supplied; the three sampled streams topped out at 1080p. No upstream 4K stream has been verified.

## Checks

`npm run lint` and `npm run build` check the application. Reading and watching also need live source checks because upstream sites can change independently.
