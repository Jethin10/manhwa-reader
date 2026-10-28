import "server-only";
import { load } from "cheerio";

export async function sourceFetch(url: string, referer?: string) {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...(referer ? { Referer: referer } : {}),
      },
      signal: AbortSignal.timeout(18000),
    });
  } catch {
    throw new Error(
      `${new URL(url).hostname} could not be reached. Try again or choose another source.`,
    );
  }
  if (!res.ok)
    throw new Error(
      `${new URL(url).hostname} returned ${res.status}. Try again or choose another source.`,
    );
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
