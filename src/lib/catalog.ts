import * as dex from "./mangadex";
import * as asura from "./asura";
import * as comix from "./comix";
import * as weebcentral from "./weebcentral";
import * as mangapill from "./mangapill";
import { PROVIDERS, providerOf, qualityOf, type ProviderId, type SourceId } from "./sources";
import { sameTitle } from "./titles";
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

type Page = { series: dex.Series[]; total: number; pages: number; page: number };
type Provider = {
  browse(opts: dex.BrowseOptions): Promise<Page>;
  series(id: string): Promise<dex.Series>;
  chapters(id: string): Promise<dex.Chapter[]>;
  uploads?(id: string): Promise<dex.Chapter[]>;
  chapter(id: string): Promise<{ mangaId: string | null; chapter: dex.Chapter }>;
  pages(id: string): Promise<dex.PageImage[]>;
};

export const providers: Record<ProviderId, Provider> = {
  mangadex: {
    browse: dex.browseSeries,
    series: dex.getSeries,
    chapters: dex.getChapters,
    uploads: dex.getAllUploads,
    chapter: dex.getChapter,
    pages: dex.getPages,
  },
  asura: {
    browse: asura.browseAsura,
    series: asura.getAsuraSeries,
    chapters: asura.getAsuraChapters,
    chapter: asura.getAsuraChapter,
    pages: asura.getAsuraPages,
  },
  comix: {
    browse: comix.browseComix,
    series: comix.getComixSeries,
    chapters: comix.getComixChapters,
    uploads: comix.getComixUploads,
    chapter: comix.getComixChapter,
    pages: comix.getComixPages,
  },
  weebcentral: {
    browse: weebcentral.browseWeebCentral,
    series: weebcentral.getWeebCentralSeries,
    chapters: weebcentral.getWeebCentralChapters,
    chapter: weebcentral.getWeebCentralChapter,
    pages: weebcentral.getWeebCentralPages,
  },
  mangapill: {
    browse: mangapill.browseMangaPill,
    series: mangapill.getMangaPillSeries,
    chapters: mangapill.getMangaPillChapters,
    chapter: mangapill.getMangaPillChapter,
    pages: mangapill.getMangaPillPages,
  },
};
const of = (id: string) => providers[providerOf(id)];
const nameOf = (p: ProviderId) => PROVIDERS.find((x) => x.id === p)!.name;

/** Rejects after `ms` so one slow source cannot hold up a page that merges several. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} took too long to respond.`)), ms),
    ),
  ]);
}

export async function browseSeries(opts: dex.BrowseOptions & { source?: SourceId } = {}) {
  const source = opts.source ?? "all";
  const all = source === "all";
  // MangaPill has no popularity sort, so it only joins all-source results for searches.
  const ids: ProviderId[] = all
    ? (["asura", "mangadex", "weebcentral", "comix", "mangapill"] as const).filter(
        (p) => p !== "mangapill" || !!opts.q,
      )
    : [source];
  const results = await Promise.allSettled(
    ids.map((p) => {
      const job = providers[p].browse(opts);
      return all ? withTimeout(job, 12000, nameOf(p)) : job;
    }),
  );
  const warnings: string[] = [];
  const good = results.flatMap((r, i) => {
    if (r.status === "fulfilled") return [r.value];
    warnings.push(
      `${nameOf(ids[i])}: ${r.reason instanceof Error ? r.reason.message : "Source unavailable."}`,
    );
    return [];
  });
  // Interleave providers so smaller catalogs stay visible, and show each title once,
  // from its highest-quality source.
  const series: dex.Series[] = [];
  for (let i = 0; i < Math.max(0, ...good.map((r) => r.series.length)); i++)
    for (const r of good) {
      const s = r.series[i];
      if (!s) continue;
      const dup = all ? series.findIndex((x) => sameTitle(x, s)) : -1;
      if (dup < 0) series.push(s);
      else if (qualityOf(s.id) > qualityOf(series[dup].id)) series[dup] = s;
    }
  return {
    series,
    total: good.reduce((n, r) => n + r.total, 0),
    pages: Math.max(1, ...good.map((r) => r.pages)),
    page: opts.page ?? 1,
    warnings,
  };
}
export const getSeries = (id: string) => of(id).series(id);
export const getChapters = (id: string) => of(id).chapters(id);
export const getAllUploads = (id: string) => {
  const p = of(id);
  return p.uploads ? p.uploads(id) : p.chapters(id);
};
export const getChapter = (id: string) => of(id).chapter(id);
export const getPages = (id: string) => of(id).pages(id);

export async function getStats(ids: string[]) {
  const dexIds = ids.filter((id) => providerOf(id) === "mangadex");
  const stats = dexIds.length
    ? await dex.getStats(dexIds).catch(() => ({}) as Record<string, dex.Stats>)
    : {};
  await Promise.allSettled(
    ids
      .filter((id) => providerOf(id) === "asura")
      .map(async (id) => {
        const s = await asura.asuraDetail(id);
        stats[id] = { rating: s.rating ?? null, follows: s.bookmark_count ?? 0 };
      }),
  );
  return stats;
}
