# Movies

## User experience

- Movies appears in desktop navigation, mobile tabs, Search and Library.
- Popular, current-year and Featured catalogs paginate in Cinemeta's 50-slot windows. Some windows contain fewer than 50 entries; pagination continues until an empty result rather than assuming a short window is the last page.
- Telugu and Indian picks are explicitly curated. They are not language-filtered complete catalogs. Their first render uses verified IDs and titles without waiting for a dozen synopsis requests.
- Title search combines Cinemeta and IMDb movie suggestions, deduplicated by IMDb ID. One catalog can fail while the other still returns results. Users can also search an IMDb ID directly.
- Movie details include cast, director, synopsis and a library status picker. Supported provider progress appears in Continue watching and Library activity.
- `/movies/providers` configures provider preference/enabled fallbacks, autoplay, resolution preference, subtitle preference, seek interval, loading reminder and local progress retention.

## Playback boundary

Ten fixed-origin embed adapters are registered in `src/lib/movie-providers.ts`. TMDB-only adapters require a numeric mapping from movie metadata. The player list updates when a mapping arrives without remounting an already selected provider.

Only one iframe mounts at a time, after the user chooses Watch movie or resumes from history. Every frame is sandboxed without popup or top-navigation rights; this is not a setting, and older saved preferences are ignored. If the frame itself navigates (a second load event), the player is restored, and after repeated attempts the provider is treated as failed. Some providers reject sandboxed frames. Provider advertising may still appear inside a frame, and parent CSS cannot remove it. There is deliberately no open-in-new-tab link, since that would leave the sandbox.

An iframe load event only confirms that a document loaded. CineSrc, VidLink and VidSrc.sh have separate event decoders. Events must come from both the exact configured origin and the active iframe window. Progress values and supplied movie IDs are validated. Unknown statuses do not confirm playback.

Automatic fallback handles explicit provider errors. For providers reporting playback events, a watchdog also detects a playing video whose time stops advancing for the configured interval. Paused players are not treated as stalled. Failed providers are excluded from subsequent automatic attempts, making retries finite. Silent providers get a non-blocking reminder with visible Retry and Try next provider controls; a paused player is not discarded merely because it awaits a gesture.

CineSrc's documented remote-control protocol is used for optional play, pause, seek and volume controls. Browser activation rules or source overlays can still require an initial interaction inside the provider frame.

## Quality and downloads

Adaptive quality is the default for startup speed. CineSrc accepts a requested resolution; providers without a documented equivalent use their own quality menus. A request for 2160p is a preference, not proof of native 4K availability. VidSrc.sh's reported quality is labeled as provider metadata, not measured resolution.

These integrations return HTML players, not direct media URLs. They do not support movie downloads through this app. The comic download queue has separate reliability improvements documented in `performance-reliability.md`. Regional sources for which only research/community adapters were found appear in a separate directory, clearly marked as awaiting integration.

## Persistence and performance

Movie history and preferences use bounded `mr:movie-history` and `mr:movie-preferences` stores. History is capped at 100 movies. Playback writes are throttled to about five seconds and flushed on pause, exit and provider changes. Completion survives subsequent pause events. Switching to an unconfirmed provider does not make it the history default.

Both stores are included in backup v1 alongside movie library entries. Import validates IDs, normalizes settings, merges history newest-first, and invalidates in-memory snapshots even when movie components are unmounted.

Catalog/detail requests use Next Cache Components with explicit lifetimes and bounded network timeouts. Search providers run in parallel. The video player chunk loads on demand, artwork is lazy-loaded, and only the first 30 result cards render until Show more is requested. Provider scripts and video segments stay outside the app's server and chapter caches.

## Verification

Run:

```powershell
node scripts/test-movies.mjs
npm run lint
npm run build
```

The dependency-free checks execute the real TypeScript modules using the project's TypeScript compiler. They cover invalid events/IDs, fixed provider origins, disabled/mapping-dependent providers, settings normalization, backup merge limits and export/import roundtrips.

Browser QA exercises mobile discovery, title search, watchlist persistence, Library's Movies filter, provider switching/closing and preference persistence/reset. External provider playback results must be reported separately from passing app UI checks. Neither one successful film nor a metadata response establishes catalog-wide reliability.
