# Reader and playback research

Checked 29 October 2026. This is a targeted qualitative review of public reader/player discussions, not a survey or a popularity ranking. Threads were selected for concrete problems; commenters disagree on preferred defaults. Source availability was checked separately from user opinion.

## Requests that informed this update

| User need | Evidence | Implementation |
| --- | --- | --- |
| Correct manga direction and spreads | [MangaDex RTL/spread discussion](https://www.reddit.com/r/mangadex/comments/1k3hqrn/any_way_to_get_the_reader_to_load_the_pages/) and [single-page preference](https://www.reddit.com/r/mangadex/comments/r13ofn/two_page_layout/) | Independent scroll/single/spread and RTL/LTR controls, first-page offset, keyboard/swipe/tap turns. Automatic uses paged RTL for manga and scrolling for manhwa. |
| Portable lists and progress | [Exporting a MangaDex list](https://www.reddit.com/r/mangadex/comments/1228p7i/exporting_mangadex_list/) and [community export tool](https://www.reddit.com/r/mangadex/comments/1kqbi8m/export_librarymdlist_bookmarklet/) | Versioned JSON export/import for local lists, reading/watching history, positions, preferences and title presets. Validated before writes; restore merges saved lists. |
| Finished titles should leave Continue watching | [Complete option request](https://www.reddit.com/r/Crunchyroll/comments/14vlrp2/is_there_a_complete_option_for_when_you_finish/) | Planned, In progress, Completed, On hold, Dropped lists; completed/dropped items stay saved but leave Continue reading/watching. Search, media/status filters, grid/list display, history removal. |
| Reading comfort and subtitle accessibility | [Webtoon dark surrounds](https://www.reddit.com/r/webtoons/comments/1d527x8/dark_mode/) and [subtitle size/style](https://www.reddit.com/r/Crunchyroll/comments/197tkss/subtitle_size_and_style/) | Black/dim/paper/sepia surrounds, width/height fit, brightness/contrast, gaps, title presets, text subtitle size/color/background, reduced motion and accent options. Artwork is not inverted. |
| Remembered playback speed and familiar controls | [Speed discussion](https://www.reddit.com/r/Crunchyroll/comments/1nclsgu/playback_speed/) and [keyboard request](https://www.reddit.com/r/Crunchyroll/comments/1sq6qki/crunchyroll_60_keyboard/) | Remembered 0.5-2x speed, 5/10/30s seek step, Space/K, J/L, arrows, M/F/C/P, preferred audio, pause-hidden option. Both faster and slower speeds are useful to different readers. |
| Accurate, optional skipping | [Inaccurate recap skips](https://www.reddit.com/r/anime/comments/1vm9r2g/whats_the_most_egregious_skip_recap_button_youve/) | Manual intro/outro skip buttons only for supplied, valid episode ranges; intro auto-skip and auto-next are opt-in. No fixed 90-second guess. |

## Is 4K possible?

Yes as a playback format, when the actual source supplies a compatible 2160p stream and the device can decode it. Apple's [HLS authoring specification](https://developer.apple.com/streaming/hls-authoring-specification-for-apple-devices.html) includes 3840x2160 variants and codec/device requirements. The player derives its quality menu from real HLS levels, exposes 2160p/4K when present, and passes source media through without a video transcode. A 2160p manifest describes encoded dimensions; it does not establish that the artwork was mastered natively at 4K.

Native 4K anime exists: Netflix describes [Sol Levante](https://about.netflix.com/en/news/4-k-short-sol-levante-combines-art-and-technology-to-deliver-best-in-class-anime) as an experimental 4K/HDR production. Older film restorations are another case: Bandai's [AKIRA UHD announcement](https://www.bandainamco.co.jp/cgi-bin/releases/index.cgi/press/9764?entry_id=6830) describes a 4K scan of the original film. Neither establishes 4K availability on this app's current providers.

Live source sample, using the app's media endpoint and master manifests:

| Stream sampled | Encoded levels found |
| --- | --- |
| Bleach episode 1 | 480p, 720p, 1080p |
| Attack on Titan episode 1 | 1080p |
| Bleach: Thousand-Year Blood War first available episode | 360p, 720p, 1080p |

No 2160p level was found in this three-stream sample. This is a point-in-time sample, not a claim about every title or future availability. Reproduction and raw dimensions: `artifacts/research/check-4k.cjs` and `artifacts/research/source-resolution-sample.json`. A real upstream 4K playback test remains unavailable because none of the sampled streams offers it. Browser support also depends on the supplied codec. HDR and 4K are separate capabilities; the app does not promise HDR.

## Smoothness choices and tradeoffs

- Auto quality adapts to measured bandwidth. Smooth mode caps automatic playback at 720p. Fixed resolution remains a user override and can buffer on an insufficient connection.
- Existing signed same-origin streaming, bounded segment cache, CDN probes/failover and retry handling remain in place. Probes estimate current delivery responsiveness, not a permanent best server.
- Added HLS frame-drop level capping, balanced/generous buffer budgets and stable preference updates that do not reload the video. Generous buffering uses more memory/data; the configured duration is a target, not a guarantee.
- MangaDex metadata requests retry interrupted connections, incomplete response bodies, rate limits and temporary server errors, with a three-attempt bound and an eight-second timeout per attempt. Permanent 4xx failures return immediately.
- Reader page visibility uses IntersectionObserver instead of measuring every page on each scroll. Paged mode mounts the visible spread with bounded ahead loading; continuous reading defers images and offscreen rendering. HD sharpening can fall back to the original image on failure.
- High resolution requires sufficient average throughput or enough download time before watching. A player cannot guarantee highest quality and zero buffering on arbitrarily slow internet. Upscaling cannot recover missing original detail.

## Scope and remaining limits

The manga route, source filters, search, library and reader now support Japanese manga alongside manhwa/manhua. This is access to the connected providers' available catalogs, not every published work. Source outages, removals, region restrictions and bot challenges remain external constraints. Some MangaDex entries link to external licensed chapters instead of supplying pages. Text subtitle customization cannot alter subtitles burned into a video. Preferences and progress are local to this browser; backup/restore is manual cross-device transfer, not account sync. Offline video downloads, casting and background release notifications were not added in this update.
