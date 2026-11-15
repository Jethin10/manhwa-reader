// CDNs that serve images to any page that sends no Referer (the site-wide Referrer-Policy is
// no-referrer; Asura refuses other sites as Referer). These load straight from the CDN,
// which is faster than the proxy and costs the server nothing.
const DIRECT = [/^cdn\.asurascans\.com$/, /^(?:i\d+\.)?mangakatana\.com$/, /^images\.metahub\.space$/, /^m\.media-amazon\.com$/];

function host(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Image URL for the browser. Hotlink-friendly CDNs are used as is (the browser scales them);
 * the rest go through our proxy, which MangaDex and friends require.
 */
export function img(url: string, opts: { w?: number; hd?: boolean } = {}) {
  // Asura's covers are full-size (~140 KB each), so thumbnails go through the proxy to be
  // shrunk; its chapter pages still load direct.
  const shrink = !!opts.w && /^cdn\.asurascans\.com$/.test(host(url)) && url.includes("/covers/");
  if (!shrink && DIRECT.some((re) => re.test(host(url)))) return url;
  // MangaDex publishes 256px and 512px cover thumbnails: start from the right one, and let the
  // proxy turn it into a much smaller WebP at the asked width.
  if (opts.w && /^uploads\.mangadex\.org$/.test(host(url)) && url.includes("/covers/"))
    return `/api/img?u=${encodeURIComponent(`${url}.${opts.w <= 256 ? 256 : 512}.jpg`)}&w=${Math.min(opts.w, 512)}&v=3`;
  let out = `/api/img?u=${encodeURIComponent(url)}`;
  // v: bump when resized output changes; resized images are cached as immutable for a year.
  if (opts.w) out += `&w=${opts.w}&v=3`;
  // Without server-side processing the HD copy is the original, so reuse its URL (and cache).
  if (opts.hd && (process.env.IMAGE_PROCESSING ?? "on") === "on") out += "&hd=1";
  return out;
}

/** Resized cover from the full-resolution original. */
export function coverSrc(cover: string | null, w: number) {
  if (!cover) return "";
  // History saved by older builds stored already-proxied URLs.
  return cover.startsWith("/") ? cover : img(cover, { w });
}

export function coverSrcSet(cover: string | null, widths = [320, 480, 640, 960]) {
  if (!cover || cover.startsWith("/")) return undefined;
  // One file serves every width when the image loads direct.
  if (!img(cover, { w: widths[0] }).startsWith("/api/img")) return undefined;
  return widths.map((w) => `${img(cover, { w })} ${w}w`).join(", ");
}

/** Cache-busting retry URL; direct CDN links may not have a query string yet. */
export function retryUrl(src: string, attempt: number) {
  return `${src}${src.includes("?") ? "&" : "?"}r=${attempt}`;
}
