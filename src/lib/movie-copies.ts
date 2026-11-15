import "server-only";
import { cacheLife } from "next/cache";
import {
  classifyRelease,
  judgeCopies,
  MOVIE_PROVIDERS,
  type CopyReports,
  type MovieCopies,
  type ReleaseStatus,
} from "./movie-providers";
import { movieProviderInfo } from "./movies";
import { isMovieId } from "./movie-types";
import { relayEnabled, relayUrl } from "./relay";

// A public index of release names. Only the names are read, to learn whether a real
// (web or disc) release of a movie exists yet; nothing is downloaded from it.
const RELEASE_INDEX = "https://torrentio.strem.fun/stream/movie";

async function getJson(url: string, ms: number) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(ms),
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

export async function releaseStatus(id: string): Promise<ReleaseStatus> {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 6 * 3600, expire: 24 * 3600 });
  if (!isMovieId(id)) return { status: "unknown" };
  const url = `${RELEASE_INDEX}/${id}.json`;
  let data: unknown;
  try {
    data = await getJson(url, 5000);
  } catch {
    if (!relayEnabled()) return { status: "unknown" };
    try {
      data = await getJson(relayUrl(url, { ttl: 300 }), 6000);
    } catch {
      return { status: "unknown" };
    }
  }
  const streams = (data as { streams?: unknown })?.streams;
  if (!Array.isArray(streams)) return { status: "unknown" };
  if (!streams.length) return { status: "none" };
  let real = 0,
    trusted = false,
    camera = 0,
    best = 0;
  for (const s of streams as Record<string, unknown>[]) {
    const title = String(s.title ?? "");
    const name = title.split("\n")[0] ?? "";
    const kind = classifyRelease(`${String(s.name ?? "")} ${name}`);
    if (kind === "camera") camera++;
    if (kind !== "real") continue;
    real++;
    // A lone fake "WEB-DL" shows up before some releases; trust it once people share it.
    const seeders = Number(/👤\s*(\d+)/.exec(title)?.[1] ?? 0);
    if (seeders >= 10) trusted = true;
    const res = /\b(2160p|4k|uhd)\b/i.test(name)
      ? 2160
      : /\b1080p\b/i.test(name)
        ? 1080
        : /\b720p\b/i.test(name)
          ? 720
          : 480;
    best = Math.max(best, res);
  }
  if (real >= 2 || trusted)
    return { status: "real", best: best >= 2160 ? "4K" : `${best}p` };
  if (camera) return { status: "camera" };
  return { status: "unknown" };
}

async function relayCall(init: RequestInit & { query?: string } = {}) {
  if (!relayEnabled()) throw new Error("Relay is not configured");
  const base = process.env.RELAY_URL!.replace(/\/+$/, "");
  const res = await fetch(`${base}/copies${init.query ?? ""}`, {
    ...init,
    signal: AbortSignal.timeout(4000),
    headers: {
      Authorization: `Bearer ${process.env.RELAY_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as CopyReports;
}

export async function copyReports(id: string): Promise<CopyReports> {
  try {
    return await relayCall({ query: `?movie=${id}` });
  } catch {
    return {};
  }
}

export async function reportCopy(
  movie: string,
  provider: string,
  verdict: "camera" | "ok" | "quality",
  height?: number,
) {
  return relayCall({
    method: "POST",
    body: JSON.stringify({ movie, provider, verdict, ...(height ? { height } : {}) }),
  });
}

export async function movieCopies(id: string): Promise<MovieCopies> {
  const [release, info, reports] = await Promise.all([
    releaseStatus(id),
    movieProviderInfo(id),
    copyReports(id),
  ]);
  return {
    release,
    providers: judgeCopies(
      MOVIE_PROVIDERS.map((p) => p.id),
      release,
      info.reportedQuality,
      reports,
    ),
  };
}
