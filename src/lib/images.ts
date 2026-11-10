// CDNs that serve images to any page, with or without a Referer. These load straight from the
// CDN, which is faster than the proxy and costs the server nothing. MangaDex chapter pages
// (uploads and the at-home network nodes) allow hotlinking; PageImage already retries a
// failed page with a cache-buster before giving up.
const DIRECT = [/^cdn\.asurascans\.com$/, /^(?:i\d+\.)?mangakatana\.com$/, /^images\.metahub\.space$/, /^m\.media-amazon\.com$/, /^uploads\.mangadex\.org$/, /\.mangadex\.network$/];

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
  // MangaDex publishes 256px and 512px cover thumbnails, so covers never need resizing here.
  // Checked before DIRECT so covers keep using the small proxied thumbnails.
  if (opts.w && /^uploads\.mangadex\.org$/.test(host(url)) && url.includes("/covers/"))
    return `/api/img?u=${encodeURIComponent(`${url}.${opts.w <= 256 ? 256 : 512}.jpg`)}`;
  if (DIRECT.some((re) => re.test(host(url)))) return url;
  let out = `/api/img?u=${encodeURIComponent(url)}`;
  if (opts.w) out += `&w=${opts.w}`;
  // Without server-side processing the HD copy is the original, so reuse its URL (and cache).
  if (opts.hd && process.env.IMAGE_PROCESSING !== "off") out += "&hd=1";
  return out;
}

/** Resized cover from the full-resolution original. */
export function coverSrc(cover: string | null, w: number) {
  if (!cover) return "";
  // History saved by older builds stored already-proxied URLs.
  return cover.startsWith("/") ? cover : img(cover, { w });
}

export function coverSrcSet(cover: string | null, widths = [320, 640, 960]) {
  if (!cover || cover.startsWith("/")) return undefined;
  // One file serves every width when the image loads direct.
  if (!img(cover, { w: widths[0] }).startsWith("/api/img")) return undefined;
  return widths.map((w) => `${img(cover, { w })} ${w}w`).join(", ");
}

/** Cache-busting retry URL; direct CDN links may not have a query string yet. */
export function retryUrl(src: string, attempt: number) {
  return `${src}${src.includes("?") ? "&" : "?"}r=${attempt}`;
}
