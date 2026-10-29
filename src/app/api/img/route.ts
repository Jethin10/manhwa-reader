import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { validImageSignature } from "@/lib/image-signing";

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
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
};

function limiter(max: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return async function <T>(fn: () => Promise<T>): Promise<T> {
    if (running >= max) await new Promise<void>((r) => queue.push(r));
    running++;
    try {
      return await fn();
    } finally {
      running--;
      queue.shift()?.();
    }
  };
}

// Keep heavy resizes from starving the server, and don't hammer MangaDex with parallel downloads.
const withSlot = limiter(4);
const withDownload = limiter(6);

function mimeFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inflight = new Map<string, Promise<Buffer>>();

/** Downloads an original once: deduped in flight, cached on disk, retried on dropped connections. */
function getOriginal(target: URL, stableKey: string): Promise<Buffer> {
  const existing = inflight.get(stableKey);
  if (existing) return existing;
  const file = join(
    CACHE_DIR,
    `${createHash("sha1").update(`src|${stableKey}`).digest("hex")}.bin`,
  );
  const job = (async () => {
    try {
      return await readFile(file);
    } catch {
      // not cached yet
    }
    const buf = await withDownload(async () => {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const referer = REFERERS.find(([re]) => re.test(target.hostname))?.[1];
          const res = await fetch(target, {
            headers: {
              // MangaDex asks clients to identify themselves; other CDNs expect a browser.
              "User-Agent": /mangadex\.(org|network)$/.test(target.hostname) ? UA : BROWSER_UA,
              ...(referer ? { Referer: referer } : {}),
            },
            redirect: "error",
            signal: AbortSignal.timeout(20000),
          });
          if (res.ok) return Buffer.from(await res.arrayBuffer());
          lastErr = new Error(`upstream ${res.status}`);
          if (res.status < 500 && res.status !== 429) break;
        } catch (e) {
          lastErr = e;
        }
        await sleep(400 * 2 ** attempt);
      }
      throw lastErr;
    });
    mkdir(CACHE_DIR, { recursive: true })
      .then(() => writeFile(file, buf))
      .catch(() => {});
    return buf;
  })().finally(() => inflight.delete(stableKey));
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

  const width = Math.min(
    2000,
    Math.max(0, parseInt(params.get("w") ?? "") || 0),
  );
  const hd = params.get("hd") === "1";

  // At-home hosts rotate, so key page images by their path (hash + filename), not the host.
  const stableKey = target.hostname.endsWith("mangadex.network")
    ? target.pathname.replace(/^.*\/data\//, "/data/")
    : target.href;

  if (!width && !hd) {
    try {
      const buf = await getOriginal(target, stableKey);
      return new Response(new Uint8Array(buf), {
        headers: { "Content-Type": mimeFor(target.pathname), ...CACHE_HEADERS },
      });
    } catch {
      return new Response("Upstream error", { status: 502 });
    }
  }

  const key = createHash("sha1")
    .update(`${stableKey}|w${width}|hd${hd ? 1 : 0}|v2`)
    .digest("hex");
  const file = join(CACHE_DIR, `${key}.${hd ? "jpg" : "webp"}`);
  const type = hd ? "image/jpeg" : "image/webp";

  try {
    return new Response(new Uint8Array(await readFile(file)), {
      headers: { "Content-Type": type, ...CACHE_HEADERS },
    });
  } catch {
    // cache miss
  }

  let input: Buffer;
  try {
    input = await getOriginal(target, stableKey);
  } catch {
    return new Response("Upstream error", { status: 502 });
  }

  const out = await withSlot(async () => {
    const img = sharp(input, { limitInputPixels: false });
    if (hd) {
      const meta = await img.metadata();
      const src = meta.width ?? 0;
      const target = Math.min(1600, src * 2);
      if (!src || target <= src) {
        // Already high-res: keep pixels, just re-encode losslessly-ish.
        return img.jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
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
  });

  mkdir(CACHE_DIR, { recursive: true })
    .then(() => writeFile(file, out))
    .catch(() => {});

  return new Response(new Uint8Array(out), {
    headers: { "Content-Type": type, ...CACHE_HEADERS },
  });
}
