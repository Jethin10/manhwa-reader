import * as dex from "./mangadex";
import * as asura from "./asura";
import * as comix from "./comix";
import type { SourceId } from "./sources";
export type {
  BrowseOptions,
  Chapter,
  Series,
  Stats,
  Tag,
  PageImage,
  SeriesType,
  LatestEntry,
} from "./mangadex";
export { getTags, getLatestUpdates } from "./mangadex";

export async function browseSeries(
  opts: dex.BrowseOptions & { source?: SourceId } = {},
) {
  const source = opts.source ?? "all";
  const providers =
    source === "all" ? ["asura", "mangadex", "comix"] : [source];
  const results = await Promise.allSettled(
    providers.map((p) =>
      p === "asura"
        ? asura.browseAsura(opts)
        : p === "comix"
          ? comix.browseComix(opts)
          : dex.browseSeries(opts),
    ),
  );
  const warnings: string[] = [];
  const good = results.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value];
    warnings.push(
      `${providers[i] === "asura" ? "Asura Scans" : providers[i] === "comix" ? "Comix" : "MangaDex"}: ${r.reason instanceof Error ? r.reason.message : "Source unavailable."}`,
    );
    return [];
  });
  // Interleave providers so smaller catalogs remain visible in all-source browsing.
  const series: dex.Series[] = [];
  for (let i = 0; i < Math.max(0, ...good.map((r) => r.series.length)); i++)
    for (const r of good) if (r.series[i]) series.push(r.series[i]);
  return {
    series,
    total: good.reduce((n, r) => n + r.total, 0),
    pages: Math.max(1, ...good.map((r) => r.pages)),
    page: opts.page ?? 1,
    warnings,
  };
}
export async function getSeries(id: string) {
  return id.startsWith("asura~")
    ? asura.getAsuraSeries(id)
    : id.startsWith("comix~")
      ? comix.getComixSeries(id)
      : dex.getSeries(id);
}
export async function getChapters(id: string) {
  return id.startsWith("asura~")
    ? asura.getAsuraChapters(id)
    : id.startsWith("comix~")
      ? comix.getComixChapters(id)
      : dex.getChapters(id);
}
export async function getAllUploads(id: string) {
  if (id.startsWith("comix~")) return comix.getComixUploads(id);
  return id.includes("~") ? getChapters(id) : dex.getAllUploads(id);
}
export async function getChapter(id: string) {
  return id.startsWith("asura~")
    ? asura.getAsuraChapter(id)
    : id.startsWith("comix~")
      ? comix.getComixChapter(id)
      : dex.getChapter(id);
}
export async function getPages(id: string) {
  return id.startsWith("asura~")
    ? asura.getAsuraPages(id)
    : id.startsWith("comix~")
      ? comix.getComixPages(id)
      : dex.getPages(id);
}
export async function getStats(ids: string[]) {
  const dexIds = ids.filter((id) => !id.includes("~"));
  const stats = dexIds.length
    ? await dex.getStats(dexIds).catch(() => ({}) as Record<string, dex.Stats>)
    : {};
  await Promise.allSettled(
    ids
      .filter((id) => id.startsWith("asura~"))
      .map(async (id) => {
        const s = await asura.asuraDetail(id);
        stats[id] = {
          rating: s.rating ?? null,
          follows: s.bookmark_count ?? 0,
        };
      }),
  );
  return stats;
}
