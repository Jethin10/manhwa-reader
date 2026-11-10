import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { validImageSignature } from "@/lib/image-signing";
import { relayEnabled, relayUrl } from "@/lib/relay";
import { taskPool, QueueFullError } from "@/lib/concurrency";

const ALLOWED = [
  /^uploads\.mangadex\.org$/,
  /\.mangadex\.network$/,
  /^cdn\.asurascans\.com$/,
  /^(?:i\d+\.)?mangakatana\.com$/,
  /^hianime\.tr$/,
  /^cdn\.anipixcdn\.co$/,
  /^cdn\.myanimelist\.net$/,
  /^temp\.compsci88\.com$/,
  /^cdn\.readdetectiveconan\.com$/,
];
// Hosts that refuse images without their own site as Referer.
const REFERERS: [RegExp, string][] = [
  [/asurascans\.com$/, "https://asurascans.com/"],
  [/^hianime\.tr$/, "https://hianime.tr/"],
  [/readdetectiveconan\.com$/, "https://mangapill.com/"],
];
const UA = "manhwa-reader/0.1 (personal reader)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const CACHE_DIR = join(tmpdir(), "manhwa-reader-img");
const CACHE_MAX_FILES = 4000;
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
};

// Keep heavy resizes from starving the server, and don't hammer MangaDex with parallel downloads.
const withResize = taskPool(2, 2, 32);
const withDownload = taskPool(6, 3);
const DOWNLOAD_BUDGET = 20000;
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

function mimeFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The disk cache has no natural eviction; bound it like the page cache in source-http.ts,
// pruning the oldest files by mtime every so many writes.
let cacheWrites = 0;
function noteCacheWrite() {
  if (++cacheWrites % 200 === 0)
    void pruneImageCache().catch(() => {
      // best effort
    });
}
async function pruneImageCache() {
  const names = await readdir(CACHE_DIR);
  if (names.length <= CACHE_MAX_FILES) return;
  const files = await Promise.all(
    names.map(async (n) => ({
      n,
      t: (await stat(join(CACHE_DIR, n))).mtimeMs,
    })),
  );
  files.sort((a, b) => a.t - b.t);
  await Promise.all(
    files
      .slice(0, files.length - CACHE_MAX_FILES)
      .map((f) => rm(join(CACHE_DIR, f.n), { force: true })),
  );
}
const inflight = new Map<string, Promise<Buffer>>();
const transformations = new Map<string, Promise<Buffer>>();

async function imageBody(response: Response): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES)
    throw new Error("Image exceeds the download limit.");
  if (!response.body) throw new Error("Image body is empty.");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMAGE_BYTES)
        throw new Error("Image exceeds the download limit.");
      chunks.push(
        Buffer.from(value.buffer, value.byteOffset, value.byteLength),
      );
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!bytes) throw new Error("Image body is empty.");
  return Buffer.concat(chunks, bytes);
}

function imageFailure(error: unknown) {
  return new Response("Image temporarily unavailable", {
    status: error instanceof QueueFullError ? 503 : 502,
    headers: { "Cache-Control": "no-store", "Retry-After": "2" },
  });
}

/** Downloads an original once: deduped in flight, cached on disk, retried on dropped connections. */
function getOriginal(target: URL, stableKey: string): Promise<Buffer> {
  const existing = inflight.get(stableKey);
  if (existing) return existing;
  const file = join(
    CACHE_DIR,
    `${createHash("sha1").update(`src|${stableKey}`).digest("hex")}.bin`,
  );
  let writing = false;
  const job = (async () => {
    try {
      return await readFile(file);
    } catch {
      // not cached yet
    }
    const deadline = Date.now() + DOWNLOAD_BUDGET;
    const host = target.hostname.endsWith(".mangadex.network")
      ? "mangadex.network"
      : target.hostname;
    const referer = REFERERS.find(([re]) => re.test(target.hostname))?.[1];
    const attemptDownload = (viaRelay: boolean) =>
      withDownload(
        host,
        async () => {
          const remaining = deadline - Date.now();
          if (remaining <= 0) throw new Error("Image request timed out.");
          const response = await fetch(
            viaRelay ? relayUrl(target.href, { referer, ttl: 300 }) : target,
            {
              headers: viaRelay
                ? {}
                : {
                    "User-Agent": /mangadex\.(org|network)$/.test(
                      target.hostname,
                    )
                      ? UA
                      : BROWSER_UA,
                    ...(referer ? { Referer: referer } : {}),
                  },
              redirect: "error",
              signal: AbortSignal.timeout(
                Math.min(remaining, viaRelay ? 6000 : 8000),
              ),
            },
          );
          if (!response.ok) {
            await response.body?.cancel().catch(() => {});
            return { status: response.status, buffer: null };
          }
          return { status: response.status, buffer: await imageBody(response) };
        },
        AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      );
    const buf = await (async () => {
      let lastErr: unknown;
      let missing = false;
      for (let attempt = 0; attempt < 2 && Date.now() < deadline; attempt++) {
        try {
          const result = await attemptDownload(false);
          if (result.buffer) return result.buffer;
          lastErr = new Error(`upstream ${result.status}`);
          if (result.status === 403) break;
          if (result.status < 500 && result.status !== 429) {
            missing = true;
            break;
          }
        } catch (e) {
          if (e instanceof QueueFullError) throw e;
          lastErr = e;
        }
        // Retry delays must not reserve a network slot.
        if (attempt === 0) await sleep(250);
      }
      // Hosts that refuse this server's IP may still serve Cloudflare's.
      if (!missing && relayEnabled() && Date.now() < deadline) {
        const result = await attemptDownload(true).catch(() => null);
        if (result?.buffer) return result.buffer;
      }
      throw lastErr;
    })();
    writing = true;
    void mkdir(CACHE_DIR, { recursive: true })
      .then(() => writeFile(file, buf))
      .then(() => noteCacheWrite())
      .catch(() => {})
      .finally(() => inflight.delete(stableKey));
    return buf;
  })().finally(() => {
    if (!writing) inflight.delete(stableKey);
  });
  inflight.set(stableKey, job);
  return job;
}

/**
 * GET /api/img?u=<mangadex url>
 *   &w=<px>      resize covers to this width (webp, never enlarged)
 *   &hd=1        reader pages: 2x Lanczos upscale + light sharpening (capped at 1600px wide)
 * With neither flag the original file is streamed byte-for-byte.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let target: URL;
  try {
    target = new URL(params.get("u") ?? "");
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.port ||
    (!ALLOWED.some((re) => re.test(target.hostname)) &&
      !validImageSignature(target.href, params.get("sig") ?? ""))
  ) {
    return new Response("Host not allowed", { status: 403 });
  }

  // Small hosts (IMAGE_PROCESSING=off) pass originals through: resizing and upscaling with
  // sharp would queue every page behind a fraction of a CPU.
  // &dl=<name> saves the page (the reader's long-press menu) instead of showing it.
  const dl = (params.get("dl") ?? "").replace(/[^\w .-]+/g, "").slice(0, 120);
  const headersFor = (type: string): HeadersInit => ({
    "Content-Type": type,
    ...CACHE_HEADERS,
    ...(dl
      ? {
          "Content-Disposition": `attachment; filename="${dl}.${type.split("/")[1].replace("jpeg", "jpg")}"`,
        }
      : {}),
  });
  const processing = process.env.IMAGE_PROCESSING !== "off";
  const width = processing
    ? Math.min(2000, Math.max(0, parseInt(params.get("w") ?? "") || 0))
    : 0;
  const hd = processing && params.get("hd") === "1";

  // At-home hosts rotate, so key page images by their path (hash + filename), not the host.
  const stableKey = target.hostname.endsWith("mangadex.network")
    ? target.pathname.replace(/^.*\/data\//, "/data/")
    : target.href;

  if (!width && !hd) {
    try {
      const buf = await getOriginal(target, stableKey);
      return new Response(new Uint8Array(buf), {
        headers: headersFor(mimeFor(target.pathname)),
      });
    } catch (error) {
      return imageFailure(error);
    }
  }

  const key = createHash("sha1")
    .update(`${stableKey}|w${width}|hd${hd ? 1 : 0}|v2`)
    .digest("hex");
  const file = join(CACHE_DIR, `${key}.${hd ? "jpg" : "webp"}`);
  const type = hd ? "image/jpeg" : "image/webp";

  try {
    return new Response(new Uint8Array(await readFile(file)), {
      headers: headersFor(type),
    });
  } catch {
    // cache miss
  }

  let input: Buffer;
  try {
    input = await getOriginal(target, stableKey);
  } catch (error) {
    return imageFailure(error);
  }

  let transform = transformations.get(key);
  if (!transform) {
    transform = withResize("resize", async () => {
      const img = sharp(input, { limitInputPixels: 80_000_000 });
      if (hd) {
        const meta = await img.metadata();
        const src = meta.width ?? 0;
        const target = Math.min(1600, src * 2);
        if (!src || target <= src) {
          // Already high-res: keep pixels, just re-encode losslessly-ish.
          return img
            .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
            .toBuffer();
        }
        return img
          .resize({ width: target, kernel: "lanczos3" })
          .sharpen({ sigma: 0.9, m1: 0.6, m2: 2.5 })
          .jpeg({ quality: 93, chromaSubsampling: "4:4:4" })
          .toBuffer();
      }
      return img
        .resize({ width, withoutEnlargement: true, kernel: "lanczos3" })
        .webp({ quality: 90 })
        .toBuffer();
    }).then(
      (out) => {
        // Publish once per transform and keep the resolved single-flight entry until the
        // file is available, without making the first client wait for disk I/O.
        void mkdir(CACHE_DIR, { recursive: true })
          .then(() => writeFile(file, out))
          .then(() => noteCacheWrite())
          .catch(() => {})
          .finally(() => transformations.delete(key));
        return out;
      },
      (error) => {
        transformations.delete(key);
        throw error;
      },
    );
    transformations.set(key, transform);
  }
  let out: Buffer;
  try {
    out = await transform;
  } catch (error) {
    return imageFailure(error);
  }

  return new Response(new Uint8Array(out), {
    headers: headersFor(type),
  });
}
