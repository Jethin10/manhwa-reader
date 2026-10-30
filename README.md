# Manhwa

A manga, manhwa and anime app built with Next.js. It reads from five sources, opens each chapter from the best available copy, and installs on phones as a PWA or an Android app.

**Open it:** https://manhwa-reader-51fe.onrender.com

**Android app:** [download manhwa.apk](https://github.com/Jethin10/manhwa-reader/releases/latest/download/manhwa.apk) (latest release)

## Get the app

| Device | How | Updates |
| --- | --- | --- |
| iPhone or iPad | Open the site in Safari, then choose Share › Add to Home Screen. | Automatic. Every deploy is live the next time you open the app. |
| Android (PWA) | Open the site in Chrome, then choose Install app. | Automatic, as above. |
| Android (APK) | Download [manhwa.apk](https://github.com/Jethin10/manhwa-reader/releases/latest/download/manhwa.apk) and open it. You may need to allow installs from your browser. | Pages and features update with the site. When a new APK is released, the app shows **Update available**, and tapping **Update** downloads it. |

The APK opens the hosted server by default. To use another server, go to Settings › Server.

## Run

```powershell
npm install
npm run build
npm start -- -p 3123
```

For development, run `npm run dev -- -p 3123`.

## Reading

Open `/manga` for Japanese manga, or browse `/series` and pick a source. Five sources are connected, ranked by image quality:

| Source | Quality | Notes |
| --- | --- | --- |
| Asura Scans | 5 | Original-resolution webtoon scans. Premium and early-access chapters are omitted. |
| MangaDex | 4 | Uploader originals in many languages. |
| WeebCentral | 3 | Large English catalog. |
| MangaKatana | 2 | Broad catalog of manga and manhwa. |
| MangaPill | 1 | Fast manga releases. |

"All sources" searches every source at once and removes duplicates, keeping the copy from the higher-quality source.

A series page finds the same title on the other sources by matching its main and alternate titles. It then merges their chapter lists. For each chapter, the reader opens the best copy using this order:

1. Copies hosted on a source come before links to an official site.
2. Higher-quality sources come next.
3. The source you opened breaks ties.

If a source fails to load a chapter's pages, the reader moves to the next copy. The Sources card on each series lists every source that matched, how many chapters each one supplies, and any source that is currently down. A title missing from one site usually still opens from the others.

Every source is read over plain HTTP, so no browser is needed on the server. Site challenges or layout changes can interrupt a source. Catalog failures appear beside the results, and the other sources stay usable.

The reader follows Mihon (Tachiyomi). Reading modes are left to right, right to left, vertical, long strip, and long strip with gaps. Manga opens right to left and manhwa as a long strip, and a mode picked in the reader sticks to that series. Its settings sheet has the same three tabs as Mihon's:

- **Reading mode:** scale type (fit screen, stretch, fit width, fit height, original size, smart fit), zoom start position, double-page spreads (wide pages stay alone), splitting wide pages, tap to pan through large pages, tap zone layouts and inversion, page animations, double tap to zoom, and strip width and padding.
- **General:** background color, page number, keep screen on, long tap page actions (save, share, reload), volume keys in the Android app, preloading, and HD sharpening.
- **Filter:** brightness, contrast, color filters, grayscale and inverted colors.

Chapters are marked read when you reach the end, and the series page shows it the way Mihon does: read chapters dim, the one in progress shows how far you got, and the main button resumes or opens the next unread chapter. Filter the list to unread or downloaded chapters, or long press (or tap Select) to mark several read or unread, mark everything up to a chapter as read, or download or delete them together.

**Updates.** Library › Updates lists new chapters from every series in your library, newest first and grouped by day, with a burst of releases shown as one row. Covers in the Library show how many chapters are unread, the Library tab shows a dot when anything is new, and the library can sort by most unread or recently read. The check runs when the result is over half an hour old, or on demand.

**Downloads.** Any chapter downloads for offline reading: tap the icon beside it, use the download button above the list for the next 5 or 10 unread chapters, all unread, or everything, or tap the icon in the reader's top bar. Library › Downloads shows the queue with progress, storage used, and every saved chapter, which reads with no connection (the service worker serves the pages and the Downloads screen itself). In the Android app, the connect screen offers Open downloads when the server can't be reached.

A chapter reopens where you left it. Halfway through, the next chapter is fetched so it opens instantly, and the end of a chapter shows what comes next and any gap in the numbering. Pinch and double tap zoom, swipes, keyboard (arrows, Shift+arrows for chapters, M for the menu, F for full screen), and full screen are supported. Existing MangaDex bookmarks still work.

## Install on a phone

The interface follows Apple's design conventions:

- A large-title type scale.
- Grouped lists.
- A frosted bottom tab bar on phones and a top navigation bar on desktop.
- Support for safe areas around the notch and home indicator.

It is also an installable PWA. It has a manifest, icons, and a service worker that caches cover and page images and shows an offline screen. To install it:

- **iPhone or iPad:** open the site in Safari, then choose Share › Add to Home Screen.
- **Android:** use Chrome's Install app option.

Scraping and image processing need Node, so a server must run somewhere. To reach it from a phone on the same Wi-Fi:

```powershell
npm run build
npm run start:lan
```

`start:lan` prints the LAN address to open on your phone.

### Android app

`android/` contains a Capacitor shell. On first launch it asks for your server address, then loads that server full screen with native system bars and a splash screen. To change servers later, go to Settings › Server.

```powershell
$env:MANHWA_SERVER_URL = "http://192.168.1.20:3000"  # optional: pre-fill the connect screen
npm run mobile:apk
```

Building the APK needs JDK 21 and the Android SDK. The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

Releases are automatic. When a change to `android/`, `mobile/`, `capacitor.config.ts` or `package.json` reaches `main`, `.github/workflows/android.yml` builds a signed APK, numbers it `1.0.<run>`, and publishes it as the latest release. You can also start it by hand from the Actions tab. The release key lives in the repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS`. Every release must be signed with the same key, or it won't install over the previous one. Use `npm run mobile:open` to open the project in Android Studio. `npm run icons` regenerates the web and Android icons from `scripts/icon.svg`.

## Host it for free

The app runs at https://manhwa-reader-51fe.onrender.com on Render's free plan, and every push to `main` redeploys it. To set up your own copy, use `render.yaml`:

1. In the Render dashboard, choose **New › Blueprint** and pick this repository.
2. Render builds the app, generates `IMAGE_SIGNING_KEY`, and serves it at `https://<name>.onrender.com`.
3. In [UptimeRobot](https://uptimerobot.com), add an HTTP(s) monitor for `https://<name>.onrender.com/api/health` with a 5-minute interval.

Render's free plan puts an app to sleep after 15 minutes without traffic, and the next visit then takes about a minute to wake it. The UptimeRobot check every 5 minutes keeps the app awake. One app running all month uses about 744 of the 750 free hours, so keep no other free services in the same workspace. `/api/health` answers without contacting any source, so checks don't trigger scraping.

Other free options:

| Host | Fit |
| --- | --- |
| Oracle Cloud Always Free VM | The strongest free option: a server that never sleeps, with up to 4 ARM cores and 24 GB of memory. Run `npm run build && npm start` behind Caddy. Sign-up requires a card. |
| Cloudflare Tunnel from your PC | Free, and your home IP is less likely to be blocked by the sources. The app is only up while your PC is on. Run `cloudflared tunnel --url http://localhost:3000`. |
| Koyeb free instance | Similar to Render, with 512 MB of memory and sleep when idle. The same UptimeRobot trick applies. |

Vercel isn't recommended. Anime video streams through the app's own proxy, which would use up Vercel's free bandwidth and run into its function time limits. Each serverless instance also keeps its own disk cache.

For a local Android build, set `MANHWA_SERVER_URL` to the hosted address before running `npm run mobile:apk`. The release workflow already does this.

## Anime

Open `/anime` for popular titles, search, recently updated shows, airing titles, and dubs. Selecting a show opens a franchise strip with its linked main series, movies, and specials. Bleach includes the original series, all four Thousand-Year Blood War parts, four movies, and related specials. These are franchise relationships, not a blanket claim that every movie or special is canon. Entries with no linked season order are supplemented from the source catalog.

Adaptive HD uses the source's public HLS stream directly in the app. The player discovers actual renditions and supports Auto or manual resolution choices such as 480p, 720p, and 1080p when supplied. Smooth mode uses adaptive quality capped at 720p. It buffers ahead, decodes through the browser, retries interrupted playback, and switches to another verified delivery CDN when a CDN fails. Safari uses native HLS and automatic browser quality control.

Delivery servers are taken from the provider's published CDN list. The app samples a small byte range from a video segment on several hosts and chooses the fastest responding reachable host. The CDN selector also permits manual switching. These response measurements are a starting point, not a sustained throughput guarantee. HD-1 and the original embedded player remain alternatives. Availability checks identify currently unreachable player pages; successful page retrieval alone cannot guarantee successful video playback.

Episode/server metadata is cached and fetched concurrently. The browser deduplicates requests and can warm the next episode on navigation intent. Long lists display 50 episodes at a time with range selection and global episode search. Native playback saves timestamps, supports resume, and can automatically advance to the next episode.

`/api/anime/stream` serves only signed URLs on the playback host allowlist, rejects redirects, preserves HTTP Range responses, rewrites nested playlist URLs, and streams bytes through without transcoding. Manifests are briefly cached and recently played segments use a bounded 96 MiB memory cache. Disconnects cancel upstream transfers. The proxy supplies the public player's required referrer and does not expose arbitrary URL fetching. Media configuration is short-lived and cached; no account credentials or DRM extraction are involved.

Anime metadata and server links come from HiAnime.tr, an independent site using the HiAnime name. Maximum quality depends on the original upload and available bitrate. Auto mode can reduce stalls on weaker connections; forcing 1080p cannot make a connection sustain more video data than it can download.

## Images and local data

`/api/img` caches originals and resized versions in the OS temporary directory under `manhwa-reader-img`. Covers use the original image and pages can be served unchanged or with optional 2x sharpening. The proxy allows known source image hosts; rotating image hosts (WeebCentral) require a signature issued by the source adapter. Set `IMAGE_SIGNING_KEY` on hosted servers so signatures survive restarts. It rejects arbitrary unsigned hosts and redirects.

The Library combines manga, manhwa and anime with Planned, In progress, Completed, On hold and Dropped statuses, search, filters, sorting, grid/list display and recent-history removal. Completed/dropped titles leave Continue reading/watching while staying in the Library.

Open `/settings` for reader defaults, playback speed, seek step, preferred audio, subtitle text style, picture fitting, buffer budget, optional timestamped intro skipping, auto-next, pause-hidden, accent color and reduced motion. Native video shortcuts are Space/K, J/L or arrows, M, F, C and P. Changes persist without reloading playback. External embeds retain their own player behavior.

Versioned JSON backup/restore transfers local lists, reader presets, progress and preferences. Imports are validated before saving and merge saved lists. Data lives in browser localStorage; there is no account sync. No deployment is required.

See [RESEARCH.md](RESEARCH.md) for the Reddit findings, implementation decisions and 4K investigation. The quality menu exposes real 2160p when supplied; the three sampled streams topped out at 1080p. No upstream 4K stream has been verified.

## Checks

`npm run lint` and `npm run build` check the application. Reading and watching also need live source checks because upstream sites can change independently.
