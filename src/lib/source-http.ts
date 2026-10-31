import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "cheerio";
import { relayEnabled, relayUrl } from "./relay";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// Hosts that just failed (unreachable, blocked, overloaded) skip the direct route for a while:
// with a relay they go straight through it, without one they fail fast, so one dead source
// doesn't make every page wait for its timeout again.
const DOWN_FOR = 3 * 60_000;
const down = new Map<string, { until: number; message: string }>();

// Last good copy of each page, served when every route fails, so a source that drops out
// for a while keeps working for anything already visited.
const STALE_DIR = join(tmpdir(), "manhwa-reader-pages");
const STALE_MAX_FILES = 4000;
const STALE_MAX_BYTES = 3 * 1024 * 1024;
let writes = 0;
const staleFile = (url: string) =>
  join(STALE_DIR, `${createHash("sha1").update(url).digest("hex")}.bin`);

async function saveStale(url: string, res: Response) {
  try {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > STALE_MAX_BYTES) return;
    await mkdir(STALE_DIR, { recursive: true });
    await writeFile(staleFile(url), buf);
    if (++writes % 200 === 0) await pruneStale();
  } catch {
    // best effort
  }
}
async function pruneStale() {
  const names = await readdir(STALE_DIR);
  if (names.length <= STALE_MAX_FILES) return;
  const files = await Promise.all(
    names.map(async (n) => ({ n, t: (await stat(join(STALE_DIR, n))).mtimeMs })),
  );
  files.sort((a, b) => a.t - b.t);
  await Promise.all(
    files.slice(0, files.length - STALE_MAX_FILES).map((f) => rm(join(STALE_DIR, f.n), { force: true })),
  );
}

type Opts = { referer?: string; headers?: Record<string, string>; timeout?: number };

class HostError extends Error {
  // Whether the host itself looks sick (worth the relay or a pause), versus a plain miss like 404.
  constructor(message: string, readonly sick: boolean) {
    super(message);
  }
}

async function attempt(url: string, opts: Opts, viaRelay: boolean) {
  const host = new URL(url).hostname;
  let res: Response;
  try {
    res = await fetch(
      viaRelay ? relayUrl(url, { referer: opts.referer, headers: opts.headers, ttl: 300 }) : url,
      {
        headers: viaRelay
          ? {}
          : {
              "User-Agent": BROWSER_UA,
              ...(opts.referer ? { Referer: opts.referer } : {}),
              ...opts.headers,
            },
        signal: AbortSignal.timeout(opts.timeout ?? (viaRelay ? 20000 : 15000)),
      },
    );
  } catch {
    throw new HostError(`${host} could not be reached. Try again or choose another source.`, true);
  }
  if (!res.ok) {
    const status = Number(res.headers.get("X-Upstream-Status")) || res.status;
    throw new HostError(
      `${host} returned ${status}. Try again or choose another source.`,
      // A 404 is a missing title, not a sick host.
      status === 403 || status === 429 || status >= 500,
    );
  }
  return res;
}

export async function sourceFetch(url: string, opts: Opts = {}) {
  const host = new URL(url).hostname;
  const relay = relayEnabled();
  const known = down.get(host);
  const skipDirect = !!known && known.until > Date.now();
  if (skipDirect && !relay) throw new Error(known.message);

  let error: HostError | undefined;
  for (const viaRelay of skipDirect ? [true] : relay ? [false, true] : [false]) {
    try {
      const res = await attempt(url, opts, viaRelay);
      if (!viaRelay) down.delete(host);
      void saveStale(url, res.clone());
      return res;
    } catch (e) {
      error = e as HostError;
      if (!error.sick) throw error;
      if (!viaRelay) down.set(host, { until: Date.now() + DOWN_FOR, message: error.message });
    }
  }
  try {
    return new Response(new Uint8Array(await readFile(staleFile(url))), {
      headers: { "X-Stale": "1" },
    });
  } catch {
    throw error!;
  }
}
export function plainText(html: string) {
  return load(html.replace(/<\/(p|div)>|<br\s*\/?>/gi, "\n"))("body")
    .text()
    .trim();
}

// Astro serializes every value as a [type, value] tuple.
export function unwrapAstro(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (typeof value[0] === "number") {
      if (value.length === 1) return null;
      if (value[0] === 1) return (value[1] as unknown[]).map(unwrapAstro);
      return unwrapAstro(value[1]);
    }
    return value.map(unwrapAstro);
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, unwrapAstro(v)]),
    );
  return value;
}

export function astroProps<T>(html: string, key: string): T {
  const $ = load(html);
  for (const el of $("astro-island[props]").toArray()) {
    const props = JSON.parse($(el).attr("props")!);
    if (key in props) return unwrapAstro(props) as T;
  }
  throw new Error(
    "The source changed its page format. Please try another source.",
  );
}
