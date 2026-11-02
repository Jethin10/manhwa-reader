import type {
  Fragment,
  FragmentLoaderContext,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderStats,
} from "hls.js";

type Details = { startSN: number; fragments: { url: string }[] };

function newStats(): LoaderStats {
  const timing = { start: 0, first: 0, end: 0, executeStart: 0, executeEnd: 0 };
  return {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { ...timing },
    parsing: { start: 0, end: 0 },
    buffering: { ...timing },
  };
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/**
 * hls.js fetches one segment at a time, so on a long round trip (a far-away server) the
 * stream can't keep up at 1080p and 2x. This fragment loader also downloads the next few
 * segments in parallel while the current one plays, and hands them over the moment
 * hls.js asks. `ahead()` sets how many segments to fetch early, and `detailsOf` finds the
 * playlist a fragment belongs to (a video level or an audio track).
 */
export function prefetchingLoader(
  detailsOf: (frag: Fragment) => Details | undefined,
  ahead: () => number,
) {
  const MAX_CACHED = 10;
  const cache = new Map<string, Promise<ArrayBuffer>>();

  const grab = (url: string) => {
    let data = cache.get(url);
    if (!data) {
      data = fetch(url).then((res) => {
        if (!res.ok) throw new HttpError(res.status);
        return res.arrayBuffer();
      });
      cache.set(url, data);
      data.catch(() => cache.delete(url));
      while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
    }
    return data;
  };

  // The source CDN is slow the first time each segment is requested (cache miss at its
  // origin). A one-byte range request makes it fetch the segment early, so the full
  // download a few seconds later is a fast cache hit.
  const WARM_AHEAD = 8;
  const warmed = new Set<string>();
  const warm = (url: string) => {
    if (warmed.has(url) || cache.has(url)) return;
    warmed.add(url);
    if (warmed.size > 400) warmed.delete(warmed.values().next().value!);
    fetch(url, { headers: { Range: "bytes=0-0" } })
      .then((res) => res.body?.cancel())
      .catch(() => {});
  };

  return class PrefetchLoader implements Loader<FragmentLoaderContext> {
    context: FragmentLoaderContext | null = null;
    stats: LoaderStats = newStats();
    private live = true;

    load(
      context: FragmentLoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<FragmentLoaderContext>,
    ) {
      this.context = context;
      const stats = this.stats;
      stats.loading.start = performance.now();

      // Byte-range segments are rare and can't share a cache entry; load them as asked.
      // (hls.js sets the range fields to 0 for whole-file segments.)
      const ranged = !!context.rangeEnd;
      const details = detailsOf(context.frag);
      const sn = context.frag.sn;
      if (!ranged && details && typeof sn === "number") {
        const at = sn - details.startSN;
        const n = ahead();
        for (let k = 1; k <= n; k++) {
          const next = details.fragments[at + k];
          if (next) grab(next.url);
        }
        for (let k = n + 1; k <= n + WARM_AHEAD; k++) {
          const later = details.fragments[at + k];
          if (later) warm(later.url);
        }
      }

      const data = ranged
        ? fetch(context.url, {
            headers: {
              Range: `bytes=${context.rangeStart ?? 0}-${context.rangeEnd ? context.rangeEnd - 1 : ""}`,
            },
          }).then((res) => {
            if (!res.ok) throw new HttpError(res.status);
            return res.arrayBuffer();
          })
        : grab(context.url);

      const limit = config.loadPolicy.maxLoadTimeMs;
      const timer = limit
        ? setTimeout(() => {
            if (!this.live) return;
            this.live = false;
            cache.delete(context.url);
            callbacks.onTimeout(stats, context, null);
          }, limit)
        : undefined;

      data.then(
        (buf) => {
          clearTimeout(timer);
          if (!this.live) return;
          // Handed over: drop it from the cache so memory follows the playhead.
          cache.delete(context.url);
          const now = performance.now();
          // Keep the timing non-zero: the bandwidth estimate divides by it.
          stats.loading.first = Math.max(stats.loading.start, now - 1);
          stats.loading.end = Math.max(now, stats.loading.first + 1);
          stats.loaded = stats.total = buf.byteLength;
          callbacks.onSuccess({ url: context.url, data: buf }, stats, context, null);
        },
        (error: unknown) => {
          clearTimeout(timer);
          if (!this.live) return;
          callbacks.onError(
            {
              code: error instanceof HttpError ? error.status : 0,
              text: error instanceof Error ? error.message : "Network error",
            },
            context,
            null,
            stats,
          );
        },
      );
    }

    abort() {
      this.live = false;
      this.stats.aborted = true;
    }

    destroy() {
      this.live = false;
      this.context = null;
    }
  };
}
