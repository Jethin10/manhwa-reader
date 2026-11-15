import "server-only";

/** Hosts that refuse images without their own site as Referer. */
export const REFERERS: [RegExp, string][] = [
  [/asurascans\.com$/, "https://asurascans.com/"],
  [/^hianime\.tr$/, "https://hianime.tr/"],
  [/readdetectiveconan\.com$/, "https://mangapill.com/"],
];
export const UA = "manhwa-reader/0.1 (personal reader)";
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export const refererFor = (host: string) =>
  REFERERS.find(([re]) => re.test(host))?.[1];

/** Headers an image host expects: MangaDex wants an honest UA, others a browser and Referer. */
export function imageHeaders(target: URL): Record<string, string> {
  const referer = refererFor(target.hostname);
  return {
    "User-Agent": /mangadex\.(org|network)$/.test(target.hostname) ? UA : BROWSER_UA,
    ...(referer ? { Referer: referer } : {}),
  };
}
