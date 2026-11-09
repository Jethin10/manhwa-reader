# Performance and reliability pass

## Request scheduling

Chapter uploads from the selected source start before mirror discovery. Rejections are handled immediately while mirror searches continue. Series titles and synopses render independently of chapter and rating requests; those sections stream behind their own Suspense boundaries.

Catalog deadlines clear their timers after success or failure. Explicit source browsing also has a deadline. Navigation does not automatically prefetch every media catalog, avoiding background scraping for sections the user has not opened.

Image requests use a bounded queue with six network jobs globally and three per host. Rotating MangaDex delivery hosts share a scheduling key. A busy host cannot monopolize the queue; queued jobs can expire or be cancelled. Retry backoff releases its slot. Direct attempts have eight-second limits, relay attempts six seconds, within a twenty-second download budget. Oversubscribed queues return a retryable response instead of growing indefinitely.

Identical originals share their in-flight request. Identical transformations share one decode/resize and publish one cache file, even when several clients request it together. Resolved entries remain reusable until their cache write finishes, while the first client receives its response without waiting for disk. Heavy transformations have two running slots and a bounded waiting list. Failed response bodies are cancelled so their connections can be reused. Images are limited to 32 MiB while streaming, with an 80-megapixel decode safeguard.

Original image bytes are unchanged. Existing WebP quality and HD JPEG/chroma settings are preserved. The changes limit competing work rather than lowering those quality settings.

## State and failure handling

The movie stall detector resets its time baseline after backward seeks, stops on explicit errors, and distinguishes paused playback from a real stall. History writes no longer invalidate unrelated preference subscribers.

Search suggestion failures remain failures rather than being cached as successful empty results. Abandoned responses cannot update the active suggestions. Image retry timers are cancelled on unmount, and a new source resets the retry state.

Chapter downloads have bounded individual requests, abortable retry delays and fail-fast handling of permanent HTTP errors. A failed page aborts its sibling workers; the chapter queue waits for them to settle before moving on. A chapter is only marked saved after its index is durably written. Failed index writes remain retryable jobs. Library status changes handle storage exhaustion without throwing, and backup imports invalidate the collection cache even while its UI is unmounted.

## Verification

```powershell
node --test scripts/test-reliability.mjs
node scripts/test-movies.mjs
npm run lint
npm run build
```

The reliability suite executes the actual modules and movie-frame effects with controlled network, storage, timer and pending-request fixtures. It covers primary/mirror overlap, streamed series details, backward seeks, pauses/stalls, pool fairness/cancellation/overload, timer cleanup, original-byte preservation, transform deduplication, durable download completion, worker settling, full storage, failed suggestions and selective preference notifications.

Passing these checks does not establish reliability of every third-party media host. Upstream catalogs, advertisements and live video availability remain outside the app's control. Movie embeds still do not expose downloadable files to the app.

## Integrated UI verification

The UI refinement simplifies discovery, detail, player recovery, playback settings, Library and Downloads. Search suggestions no longer clip behind the movie hero, narrow search tabs fit, and failed posters show their titles. Detailed controls remain available through disclosures.

The UI agent checked search, settings, provider switching and layouts at 320, 390 and 1280 pixels. Final integration checks confirmed movie watchlist persistence, a populated Library, Continue Watching with an isolated history fixture, Theater mode and browser fullscreen. Theater mode retained one iframe. Test fixtures were removed afterward. Both test suites, lint and the production build passed after integration.

Actual movie playback, an active download queue in the browser, and emulated system reduced motion were not established by this final UI check. The automated reliability tests cover download worker failures and storage errors. Downloads still require the app to remain running; this pass does not add an operating-system background download service.
