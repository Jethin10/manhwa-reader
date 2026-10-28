import {
  getStreamPlaylist,
  rewritePlaylist,
  verifyStreamUrl,
} from "@/lib/anime-media";

const MAX_CACHE = 96 * 1024 * 1024,
  MAX_ITEM = 8 * 1024 * 1024;
const cache = new Map<
  string,
  { bytes: Uint8Array; type: string; at: number }
>();
let cacheSize = 0;
function keep(key: string, bytes: Uint8Array, type: string) {
  if (bytes.byteLength > MAX_ITEM || cache.has(key)) return;
  while (cacheSize + bytes.byteLength > MAX_CACHE && cache.size) {
    const first = cache.keys().next().value!;
    cacheSize -= cache.get(first)!.bytes.byteLength;
    cache.delete(first);
  }
  cache.set(key, { bytes, type, at: Date.now() });
  cacheSize += bytes.byteLength;
}
async function remember(
  body: ReadableStream<Uint8Array>,
  key: string,
  type: string,
) {
  const reader = body.getReader(),
    parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_ITEM) {
        await reader.cancel();
        return;
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    keep(key, bytes, type);
  } catch {
    /* A cancelled transfer is not cached. */
  }
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let url: URL;
  try {
    url = new URL(params.get("u") ?? "");
  } catch {
    return new Response("Invalid stream URL", { status: 400 });
  }
  const edge = params.get("edge") ?? "";
  if (!verifyStreamUrl(url, params.get("sig") ?? "", edge))
    return new Response("Stream not allowed", { status: 403 });
  const range = request.headers.get("Range");
  const hit = !range ? cache.get(url.href) : undefined;
  if (hit && Date.now() - hit.at < 120000) {
    cache.delete(url.href);
    cache.set(url.href, hit);
    return new Response(new Uint8Array(hit.bytes), {
      headers: {
        "Content-Type": hit.type,
        "Cache-Control": "private, max-age=120",
        "X-Stream-Cache": "HIT",
      },
    });
  }
  if (hit) {
    cacheSize -= hit.bytes.byteLength;
    cache.delete(url.href);
  }
  try {
    if (url.pathname.endsWith(".m3u8"))
      return new Response(
        rewritePlaylist(await getStreamPlaylist(url.href), url.href, edge),
        {
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "private, max-age=15",
          },
        },
      );
    const upstream = await fetch(url, {
      headers: {
        Referer: "https://zokoanime.video/",
        "User-Agent": "Mozilla/5.0",
        ...(range ? { Range: range } : {}),
      },
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25000)]),
    });
    if (!upstream.ok || !upstream.body)
      return new Response("Playback host is unavailable", {
        status: upstream.status === 404 || upstream.status === 410 ? 404 : 502,
      });
    const type =
      upstream.headers.get("Content-Type") ?? "application/octet-stream";
    if (/mpegurl/i.test(type) || url.pathname.endsWith(".m3u8")) {
      const text = await upstream.text();
      if (!text.startsWith("#EXTM3U"))
        return new Response("Invalid playlist", { status: 502 });
      return new Response(rewritePlaylist(text, url.href, edge), {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "private, max-age=15",
        },
      });
    }
    const headers = new Headers({
      "Content-Type": type,
      "Cache-Control": "private, max-age=120",
    });
    for (const key of ["Content-Length", "Content-Range", "Accept-Ranges"]) {
      const v = upstream.headers.get(key);
      if (v) headers.set(key, v);
    }
    if (!range && upstream.status === 200) {
      const [client, memory] = upstream.body.tee();
      void remember(memory, url.href, type);
      return new Response(client, { status: upstream.status, headers });
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response("Playback connection interrupted", { status: 502 });
  }
}
