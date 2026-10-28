/** Wraps a remote image URL in our proxy (MangaDex blocks hotlinking). */
export function img(url: string, opts: { w?: number; hd?: boolean } = {}) {
  let out = `/api/img?u=${encodeURIComponent(url)}`;
  if (opts.w) out += `&w=${opts.w}`;
  if (opts.hd) out += "&hd=1";
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
  return widths.map((w) => `${img(cover, { w })} ${w}w`).join(", ");
}
