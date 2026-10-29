import "server-only";
import { load } from "cheerio";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// Hosts that just failed (unreachable, blocked, overloaded) are skipped for a while, so one
// dead source doesn't make every page wait for its timeout again.
const DOWN_FOR = 3 * 60_000;
const down = new Map<string, { until: number; message: string }>();

export async function sourceFetch(
  url: string,
  opts: { referer?: string; headers?: Record<string, string>; timeout?: number } = {},
) {
  const host = new URL(url).hostname;
  const known = down.get(host);
  if (known && known.until > Date.now()) throw new Error(known.message);
  const fail = (message: string) => {
    down.set(host, { until: Date.now() + DOWN_FOR, message });
    return new Error(message);
  };
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        ...(opts.referer ? { Referer: opts.referer } : {}),
        ...opts.headers,
      },
      signal: AbortSignal.timeout(opts.timeout ?? 18000),
    });
  } catch {
    throw fail(`${host} could not be reached. Try again or choose another source.`);
  }
  if (!res.ok) {
    const message = `${host} returned ${res.status}. Try again or choose another source.`;
    // A 404 is a missing title, not a sick host.
    if (res.status === 403 || res.status === 429 || res.status >= 500) throw fail(message);
    throw new Error(message);
  }
  down.delete(host);
  return res;
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
