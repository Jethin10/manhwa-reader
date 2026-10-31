import type {
  FragmentLoaderContext,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderStats,
} from "hls.js";

type Levels = { details?: { startSN: number; fragments: { url: string }[] } }[];

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
 * hls.js asks. `ahead()` sets how many segments to fetch early.
 */
export function prefetchingLoader(levels: () => Levels, ahead: () => number) {
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
      const details = levels()[context.frag.level]?.details;
      const sn = context.frag.sn;
      if (!ranged && details && typeof sn === "number")
        for (let k = 1; k <= ahead(); k++) {
          const next = details.fragments[sn - details.startSN + k];
          if (next) grab(next.url);
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
