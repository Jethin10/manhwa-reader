import "server-only";
import { cacheLife } from "next/cache";
import { getAnimeServers } from "./anime";
import { sourceFetch } from "./source-http";
import { imageSignature, validImageSignature } from "./image-signing";
import { relayEnabled, relayUrl } from "./relay";
import type { PlaybackMedia } from "./anime-playback";

const HOSTS = [
  /^zokoanime\.video$/,
  /^hls\.dramahot\.top$/,
  /^hls\d*\.(?:drama[123]|proxy[12]|zoko\d+)\.cfd$/,
];
export function allowedStreamUrl(url: URL) {
  return (
    url.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    HOSTS.some((h) => h.test(url.hostname))
  );
}
function resolveStream(raw: string, base: string, edge: string) {
  const url = new URL(raw, base);
  if (!allowedStreamUrl(url))
    throw new Error("This media host is unsupported.");
  if (edge && url.pathname.startsWith("/s/")) url.host = new URL(edge).host;
  return url;
}
export function streamUrl(
  raw: string,
  base = "https://zokoanime.video",
  edge = "",
) {
  const url = resolveStream(raw, base, edge);
  return `/api/anime/stream?u=${encodeURIComponent(url.href)}&edge=${encodeURIComponent(edge)}&sig=${imageSignature(`stream|${url.href}|${edge}`)}`;
}
export function verifyStreamUrl(url: URL, signature: string, edge = "") {
  if (edge) {
    try {
      if (!allowedStreamUrl(new URL(edge))) return false;
    } catch {
      return false;
    }
  }
  return (
    allowedStreamUrl(url) &&
    validImageSignature(`stream|${url.href}|${edge}`, signature)
  );
}

export async function getStreamPlaylist(raw: string) {
  "use cache";
  cacheLife({ stale: 15, revalidate: 30, expire: 60 });
  const url = new URL(raw);
  if (!allowedStreamUrl(url)) throw new Error("Stream not allowed.");
  const res = await fetch(url, {
    headers: {
      Referer: "https://zokoanime.video/",
      "User-Agent": "Mozilla/5.0",
    },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("Playback host is unavailable.");
  const text = await res.text();
  if (!text.startsWith("#EXTM3U"))
    throw new Error("Invalid playback playlist.");
  return text;
}

async function getEdges() {
  "use cache";
  cacheLife("hours");
  const data = (await (
    await sourceFetch("https://zokoanime.video/api/stream/edges")
  ).json()) as { enabled?: boolean; hosts?: { key: string; base: string }[] };
  return data.enabled
    ? (data.hosts ?? []).filter((h) => {
        try {
          return allowedStreamUrl(new URL(h.base));
        } catch {
          return false;
        }
      })
    : [];
}
async function probeEdges(src: string) {
  try {
    const base = new URL(src, "https://zokoanime.video");
    const headers = {
      Referer: "https://zokoanime.video/",
      "User-Agent": "Mozilla/5.0",
    };
    const edgePromise = getEdges().catch(() => []);
    const text = await getStreamPlaylist(base.href);
    if (!text.startsWith("#EXTM3U")) return [];
    let playlist = text,
      playlistUrl = base;
    if (text.includes("#EXT-X-STREAM-INF")) {
      playlistUrl = new URL(
        text.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#"))!,
        base,
      );
      if (!allowedStreamUrl(playlistUrl)) return [];
      playlist = await getStreamPlaylist(playlistUrl.href);
    }
    const line = playlist
      .split(/\r?\n/)
      .find((l) => l.trim() && !l.startsWith("#"));
    if (!line) return [];
    const segment = new URL(line, playlistUrl);
    if (!allowedStreamUrl(segment) || !segment.pathname.startsWith("/s/"))
      return [];
    const edges = await edgePromise;
    const candidates = [
      ...edges.filter((e) => e.key !== "o").slice(0, 3),
      { key: "o", base: segment.origin },
    ];
    const results = await Promise.all(
      candidates.map(async (e) => {
        const target = new URL(segment);
        target.host = new URL(e.base).host;
        const start = performance.now();
        try {
          const res = await fetch(target, {
            headers: { ...headers, Range: "bytes=0-1023" },
            redirect: "error",
            signal: AbortSignal.timeout(1500),
          });
          await res.body?.cancel();
          return res.ok
            ? {
                id: e.key,
                label: e.key === "o" ? "Original CDN" : `CDN ${e.key}`,
                src: streamUrl(src, base.href, e.base),
                latencyMs: Math.round(performance.now() - start),
              }
            : null;
        } catch {
          return null;
        }
      }),
    );
    return results
      .filter((r) => r !== null)
      .sort((a, b) => a.latencyMs - b.latencyMs);
  } catch {
    return [];
  }
}

export async function getAnimeMedia(
  episode: string,
  language: "sub" | "dub",
): Promise<PlaybackMedia> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 240 });
  const servers = await getAnimeServers(episode);
  const server = servers.find(
    (s) =>
      s.language === language && new URL(s.url).hostname === "zokoanime.video",
  );
  if (!server)
    throw new Error(
      "Direct playback is unavailable for this audio. Try the alternate player.",
    );
  const html = await (await sourceFetch(server.url)).text();
  const encoded = html.match(/window\.__P\s*=\s*"([A-Za-z0-9+/=]+)"/)?.[1];
  if (!encoded)
    throw new Error(
      "The direct stream is unavailable. Try the alternate player.",
    );
  // The public player shell serializes its ordinary HLS configuration this way.
  // This is its metadata encoding, not DRM or an account credential.
  // https://zokoanime.video/core/obfuscate.js
  const bytes = Buffer.from(encoded, "base64"),
    encoding = Buffer.from("otaku-embed-v1");
  for (let i = 0; i < bytes.length; i++)
    bytes[i] ^= encoding[i % encoding.length];
  const data = JSON.parse(bytes.toString("utf8")) as {
    skip?: PlaybackMedia["skip"];
    src?: string;
    poster?: string;
    subtitles?: {
      src: string;
      label?: string;
      lang?: string;
      default?: boolean;
    }[];
  };
  if (!data.src)
    throw new Error("No playable stream was supplied. Try another server.");
  const deliveryServers = await probeEdges(data.src);
  const skip: NonNullable<PlaybackMedia["skip"]> = {};
  for (const key of ["intro", "outro"] as const) {
    const range = data.skip?.[key];
    if (
      range &&
      Number.isFinite(range.start) &&
      Number.isFinite(range.end) &&
      range.start >= 0 &&
      range.end > range.start &&
      range.end < 86400
    )
      skip[key] = range;
  }
  return {
    src: deliveryServers[0]?.src ?? streamUrl(data.src),
    servers: deliveryServers,
    skip,
    poster: data.poster,
    tracks: (data.subtitles ?? []).flatMap((t) => {
      try {
        return [
          {
            src: streamUrl(t.src),
            label: t.label ?? t.lang ?? "Subtitles",
            language: t.lang ?? "en",
            default: !!t.default,
          },
        ];
      } catch {
        return [];
      }
    }),
  };
}

export function rewritePlaylist(text: string, base: string, edge = "") {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return line;
      if (!line.startsWith("#")) {
        // Segments are the heavy part: with a relay they stream from Cloudflare, not this server.
        const url = resolveStream(line.trim(), base, edge);
        if (relayEnabled() && !url.pathname.endsWith(".m3u8"))
          return relayUrl(url.href, { referer: "https://zokoanime.video/" });
        return streamUrl(line.trim(), base, edge);
      }
      return line.replace(
        /URI="([^"]+)"/g,
        (_, uri: string) => `URI="${streamUrl(uri, base, edge)}"`,
      );
    })
    .join("\n");
}
