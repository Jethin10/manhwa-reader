import "server-only";
import { cacheLife } from "next/cache";
import sharp from "sharp";
import { getPages } from "./catalog";
import { headerSize } from "./image-size";
import { imageHeaders, refererFor } from "./image-hosts";
import { relayEnabled, relayUrl } from "./relay";
import type { ProviderId } from "./sources";

/**
 * Measures how good a chapter copy really looks, from its images rather than what the source
 * claims: page width in pixels first, how hard the images are compressed second, and whether
 * the pages load at all. Sources are compared on the same chapters, so the score says which
 * source has the sharpest copy of this series.
 */

export type CopyQuality = {
  /** Median page width in pixels. */
  width: number;
  /** Median bytes per pixel, adjusted for format (WebP/AVIF pack more detail per byte). */
  density: number;
  format: string;
  pages: number;
  /** Pages are missing or unreadable (404, 403, not an image): never pick this copy while another works. */
  broken: boolean;
  /** Couldn't be measured right now (timeouts, server errors): rank this source as usual. */
  unmeasured?: boolean;
  score: number;
};

/** A failure that says nothing about the copy itself. */
class Transient extends Error {}

const SAMPLE_BYTES = 128 * 1024;

function originalUrl(src: string): URL | null {
  try {
    const url = new URL(src, "http://local");
    if (url.host === "local") {
      // Our proxy: the source image is its `u` parameter.
      const u = url.searchParams.get("u");
      return u ? new URL(u) : null;
    }
    return url;
  } catch {
    return null;
  }
}

async function head(target: URL, viaRelay: boolean) {
  const res = await fetch(
    viaRelay ? relayUrl(target.href, { referer: refererFor(target.hostname), ttl: 300 }) : target,
    {
      headers: { ...(viaRelay ? {} : imageHeaders(target)), Range: `bytes=0-${SAMPLE_BYTES - 1}` },
      redirect: "follow",
      // Generous: measuring mostly runs in the background, and some hosts are slow to start.
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    if (res.status >= 500 || res.status === 429) throw new Transient(`HTTP ${res.status}`);
    throw new Error(`HTTP ${res.status}`);
  }
  const range = res.headers.get("content-range");
  const total = range?.includes("/")
    ? Number(range.split("/").pop())
    : Number(res.headers.get("content-length")) || 0;
  // Read only the sample, even when the host ignored the Range header.
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (got < SAMPLE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return { buf: Buffer.concat(chunks), total: total || got };
}

/** Width, height, format and file size of one page, from its first bytes. */
async function probePage(src: string) {
  const target = originalUrl(src);
  if (!target) throw new Error("Unknown image");
  let sample;
  try {
    sample = await head(target, false).catch(async (e) => {
      // One retry: a page that loads on the second try isn't a broken copy.
      if (e instanceof Transient || !(e instanceof Error) || /timeout|aborted|fetch failed/i.test(e.message))
        return head(target, false);
      throw e;
    });
  } catch (e) {
    if (!relayEnabled()) throw asTransient(e);
    sample = await head(target, true).catch((err) => {
      throw asTransient(err);
    });
  }
  // Only the start of the file was read; sharp refuses a cut-off WebP, so read the header.
  const size =
    headerSize(sample.buf) ??
    (await sharp(sample.buf, { failOn: "none" })
      .metadata()
      .then((m) => (m.width && m.height ? { width: m.width, height: m.height, format: m.format ?? "" } : null))
      .catch(() => null));
  if (!size) throw new Error("Unreadable image");
  return { ...size, bytes: sample.total };
}


/** Timeouts and network errors are transient; an HTTP 4xx is a real answer. */
function asTransient(e: unknown) {
  if (e instanceof Transient) return e;
  if (e instanceof Error && /^HTTP 4/.test(e.message)) return e;
  return new Transient(e instanceof Error ? e.message : String(e));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
// Modern formats keep more detail per byte; scale so densities compare across formats.
const FORMAT_EFFICIENCY: Record<string, number> = { webp: 1.4, avif: 1.8, heif: 1.8, png: 1, jpeg: 1, jpg: 1 };

/** Sharpness score: width dominates; compression only separates copies of similar width. */
export function qualityScore(width: number, density: number, format: string) {
  // PNG is lossless, so its detail is complete whatever its size.
  const detail = format === "png" ? 1 : Math.min(1, density / 0.12);
  return Math.round(width * (0.85 + 0.15 * detail));
}

export async function measureChapter(chapterId: string): Promise<CopyQuality> {
  "use cache: remote";
  const result = await measure(chapterId);
  // Uploaded images don't change. A broken copy is checked again within the hour, and one
  // that couldn't be measured within minutes.
  cacheLife(
    result.unmeasured
      ? { stale: 60, revalidate: 300, expire: 600 }
      : result.broken
        ? { stale: 300, revalidate: 3600, expire: 7200 }
        : { stale: 86400, revalidate: 30 * 86400, expire: 60 * 86400 },
  );
  return result;
}

async function measure(chapterId: string): Promise<CopyQuality> {
  const broken = (pages: number): CopyQuality => ({
    width: 0,
    density: 0,
    format: "",
    pages,
    broken: true,
    score: -1,
  });
  const unmeasured = (pages: number): CopyQuality => ({
    ...broken(pages),
    broken: false,
    unmeasured: true,
  });
  let pages: { src: string }[];
  try {
    pages = await getPages(chapterId);
  } catch {
    // The source didn't answer; that's not proof its copy is bad.
    return unmeasured(0);
  }
  if (!pages.length) return broken(0);
  // Skip the first page (often a credits page); spread the rest across the chapter.
  const n = pages.length;
  const picks = [
    ...new Set(
      [1, Math.floor(n / 2), Math.floor((n * 3) / 4)].map((i) =>
        Math.min(n - 1, i),
      ),
    ),
  ];
  const results = await Promise.allSettled(
    picks.map((i) => probePage(pages[i].src)),
  );
  const ok = results.flatMap((r) =>
    r.status === "fulfilled" ? [r.value] : [],
  );
  if (ok.length < Math.ceil(picks.length / 2)) {
    const transient = results.some(
      (r) => r.status === "rejected" && r.reason instanceof Transient,
    );
    return transient ? unmeasured(n) : broken(n);
  }
  const width = median(ok.map((p) => p.width));
  const format = ok[0].format;
  const density = median(
    ok.map(
      (p) =>
        (p.bytes / (p.width * p.height)) * (FORMAT_EFFICIENCY[p.format] ?? 1),
    ),
  );
  return {
    width,
    density: Math.round(density * 1000) / 1000,
    format,
    pages: n,
    broken: false,
    score: qualityScore(width, density, format),
  };
}

export type SourceQuality = Partial<Record<ProviderId, CopyQuality>>;

/**
 * Each source's quality for one series, measured on the same chapters across sources.
 * `samples` lists, per source, its copies of those chapters.
 */
export async function measureSources(
  seriesId: string,
  samples: { provider: ProviderId; chapterId: string }[],
): Promise<SourceQuality> {
  "use cache: remote";
  void seriesId; // part of the cache key
  const measured = await Promise.all(
    samples.map(async (s) => ({ ...s, q: await measureChapter(s.chapterId) })),
  );
  // Partly measured comparisons are redone soon; complete ones last days.
  cacheLife(
    measured.some((m) => m.q.unmeasured)
      ? { stale: 60, revalidate: 300, expire: 900 }
      : { stale: 86400, revalidate: 3 * 86400, expire: 14 * 86400 },
  );
  const out: SourceQuality = {};
  for (const provider of new Set(samples.map((s) => s.provider))) {
    const qs = measured
      .filter((m) => m.provider === provider && !m.q.unmeasured)
      .map((m) => m.q);
    // Nothing measured yet: leave it out, so it keeps its usual rank.
    if (!qs.length) continue;
    const working = qs.filter((q) => !q.broken);
    if (!working.length) {
      out[provider] = qs[0];
      continue;
    }
    const best = working.sort((a, b) => b.score - a.score)[Math.floor(working.length / 2)];
    out[provider] = best;
  }
  return out;
}
