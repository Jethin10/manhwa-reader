import "server-only";
import { cacheLife } from "next/cache";
import { cache } from "react";
import {
  getAllUploads,
  getSeries,
  providers,
  withTimeout,
  type Chapter,
} from "./catalog";
import { PROVIDERS, providerOf, qualityOf, sourceOf, type ProviderId } from "./sources";
import { chapterKey, sameTitle } from "./titles";

export type SourceSummary = {
  id: string;
  provider: ProviderId;
  name: string;
  chapters: number;
  latest: string | null;
  primary: boolean;
  /** Chapters this source supplies to the merged list. */
  used: number;
  error?: string;
};

const latin = (t: string) => /^[\x20-\x7e]+$/.test(t);

/** The same title on every other source, found by title search and matched on normalized titles. */
export async function findMirrors(id: string): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const series = await getSeries(id);
  const queries = [series.title, ...series.altTitles.filter(latin).slice(0, 2)];
  const found = await Promise.allSettled(
    PROVIDERS.filter((p) => p.id !== providerOf(id)).map(async (p) => {
      for (const q of queries) {
        const page = await withTimeout(
          providers[p.id].browse({ q, type: "all", limit: 12 }),
          10000,
          p.name,
        );
        const hit = page.series.find((s) => sameTitle(s, series));
        if (hit) return hit.id;
      }
      return null;
    }),
  );
  return found.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}

function rank(c: Chapter, primary: string) {
  // Hosted pages beat links to official sites; then image quality; then the series' own source.
  return (c.externalUrl ? 0 : 100) + qualityOf(c.id) * 2 + (providerOf(c.id) === providerOf(primary) ? 1 : 0);
}

/**
 * One chapter list built from every source that carries the title. Each chapter comes from the
 * best-quality source that has it, and every other copy stays available as an alternate version.
 */
export const getMergedChapters = cache(async (id: string) => {
  const mirrors = await findMirrors(id).catch(() => [] as string[]);
  const ids = [id, ...mirrors];
  const lists = await Promise.allSettled(
    ids.map((x) => withTimeout(getAllUploads(x), 20000, sourceOf(x))),
  );
  const uploads: Chapter[] = [];
  const sources: SourceSummary[] = ids.map((x, i) => {
    const r = lists[i];
    const list = r.status === "fulfilled" ? r.value : [];
    for (const c of list) uploads.push({ ...c, source: sourceOf(x) });
    const numbers = list.map((c) => parseFloat(c.number ?? "")).filter(Number.isFinite);
    return {
      id: x,
      provider: providerOf(x),
      name: sourceOf(x),
      chapters: new Set(list.map((c) => chapterKey(c.number) ?? c.id)).size,
      latest: numbers.length ? String(Math.max(...numbers)) : null,
      primary: x === id,
      used: 0,
      error: r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : "Unavailable") : undefined,
    };
  });
  if (lists[0].status === "rejected" && !uploads.length) throw lists[0].reason;

  const best = new Map<string, Chapter>();
  for (const c of uploads) {
    // Unnumbered extras only make sense within their own source.
    const key = chapterKey(c.number) ?? (providerOf(c.id) === providerOf(id) ? c.id : null);
    if (!key) continue;
    const prev = best.get(key);
    if (!prev || rank(c, id) > rank(prev, id)) best.set(key, c);
  }
  const chapters = [...best.values()].sort(
    (a, b) => (parseFloat(b.number ?? "") || -1) - (parseFloat(a.number ?? "") || -1),
  );
  for (const c of chapters) {
    const s = sources.find((x) => x.provider === providerOf(c.id));
    if (s) s.used++;
  }
  return { chapters, uploads, sources: sources.sort((a, b) => b.chapters - a.chapters) };
});

/** Every readable copy of one chapter number, best first. */
export function versionsOf(uploads: Chapter[], number: string | null, primary: string) {
  const key = chapterKey(number);
  if (!key) return [];
  return uploads
    .filter((u) => !u.externalUrl && chapterKey(u.number) === key)
    .sort((a, b) => rank(b, primary) - rank(a, primary));
}
