/* eslint-disable @typescript-eslint/no-explicit-any -- raw MangaDex JSON is mapped into typed shapes below */
import { cacheLife } from "next/cache";
import { img } from "./images";

const API = "https://api.mangadex.org";
const UA = "manhwa-reader/0.1 (personal reader)";

export const CONTENT_RATINGS = ["safe", "suggestive"];
export const LANG = "en";

export type SeriesType = "manhwa" | "manga" | "manhua" | "all";

export const TYPE_LANGS: Record<Exclude<SeriesType, "all">, string[]> = {
  manhwa: ["ko"],
  manga: ["ja"],
  manhua: ["zh", "zh-hk"],
};

export type Tag = { id: string; name: string; group: string };

export type Series = {
  id: string;
  title: string;
  altTitles: string[];
  description: string;
  status: string;
  year: number | null;
  type: string;
  contentRating: string;
  tags: Tag[];
  /** Original full-resolution cover URL (pass through coverSrc before rendering). */
  cover: string | null;
  authors: string[];
  artists: string[];
  lastChapter: string | null;
  updatedAt: string;
};

export type Chapter = {
  id: string;
  number: string | null;
  volume: string | null;
  title: string | null;
  pages: number;
  externalUrl: string | null;
  readableAt: string;
  group: string | null;
  /** Source name, set when chapters from several sources are merged into one list. */
  source?: string;
};

export type Stats = { rating: number | null; follows: number };

type Rel = { id: string; type: string; attributes?: Record<string, unknown> };
type RawManga = {
  id: string;
  attributes: Record<string, any>;
  relationships: Rel[];
};
type RawChapter = {
  id: string;
  attributes: Record<string, any>;
  relationships: Rel[];
};

function qs(
  params: Record<
    string,
    string | number | boolean | (string | number)[] | undefined
  >,
) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(`${k}[]`, String(x)));
    else sp.append(k, String(v));
  }
  return sp.toString();
}

async function api<T>(
  path: string,
  params: Parameters<typeof qs>[0] = {},
): Promise<T> {
  const q = qs(params);
  const url = `${API}${path}${q ? `?${q}` : ""}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    let retryable = true;
    let wait = 250 * (attempt + 1);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        retryable = res.status === 429 || res.status >= 500;
        if (res.status === 429) wait = 1000 * (attempt + 1);
        await res.body?.cancel();
        throw new Error(`MangaDex ${res.status} on ${path}`);
      }
      // Await the body here so interrupted transfers also get a bounded retry.
      return (await res.json()) as T;
    } catch (error) {
      if (!retryable || attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  throw new Error(`MangaDex could not load ${path}. Try again shortly.`);
}

function pickTitle(a: Record<string, any>): string {
  const t = a.title ?? {};
  if (t.en) return t.en;
  const enAlt = (a.altTitles ?? []).find(
    (x: Record<string, string>) => x.en,
  )?.en;
  if (enAlt) return enAlt;
  return (Object.values(t)[0] as string) ?? "Untitled";
}

function typeFromLang(lang: string) {
  if (lang === "ko") return "Manhwa";
  if (lang === "ja") return "Manga";
  if (lang?.startsWith("zh")) return "Manhua";
  return "Comic";
}

function toSeries(m: RawManga): Series {
  const a = m.attributes;
  const coverRel = m.relationships.find((r) => r.type === "cover_art");
  const file = coverRel?.attributes?.fileName as string | undefined;
  const coverUrl = file
    ? `https://uploads.mangadex.org/covers/${m.id}/${file}`
    : null;
  const names = (type: string) =>
    m.relationships
      .filter((r) => r.type === type && r.attributes?.name)
      .map((r) => r.attributes!.name as string);
  const title = pickTitle(a);
  return {
    id: m.id,
    title,
    altTitles: (a.altTitles ?? [])
      .map((x: Record<string, string>) => Object.values(x)[0])
      .filter((x: string) => x && x !== title)
      .slice(0, 6),
    description: (a.description?.en ??
      Object.values(a.description ?? {})[0] ??
      "") as string,
    status: a.status ?? "unknown",
    year: a.year ?? null,
    type: typeFromLang(a.originalLanguage),
    contentRating: a.contentRating,
    tags: (a.tags ?? []).map((t: any) => ({
      id: t.id,
      name: t.attributes.name.en,
      group: t.attributes.group,
    })),
    cover: coverUrl,
    authors: names("author"),
    artists: names("artist"),
    lastChapter: a.lastChapter || null,
    updatedAt: a.updatedAt,
  };
}

function toChapter(c: RawChapter): Chapter {
  const a = c.attributes;
  const group = c.relationships.find((r) => r.type === "scanlation_group");
  return {
    id: c.id,
    number: a.chapter ?? null,
    volume: a.volume ?? null,
    title: a.title || null,
    pages: a.pages ?? 0,
    externalUrl: a.externalUrl ?? null,
    readableAt: a.readableAt,
    group: (group?.attributes?.name as string) ?? null,
  };
}

function langsFor(type: SeriesType) {
  return type === "all" ? undefined : TYPE_LANGS[type];
}

// ---------- Series lists ----------

export type BrowseOptions = {
  q?: string;
  type?: SeriesType;
  tags?: string[];
  status?: string;
  order?:
    | "followedCount"
    | "latestUploadedChapter"
    | "rating"
    | "createdAt"
    | "relevance"
    | "title";
  page?: number;
  limit?: number;
};

export async function browseSeries(opts: BrowseOptions = {}) {
  "use cache";
  cacheLife("minutes");
  const limit = opts.limit ?? 24;
  const page = Math.max(1, opts.page ?? 1);
  const order = opts.order ?? (opts.q ? "relevance" : "followedCount");
  const res = await api<{ data: RawManga[]; total: number }>("/manga", {
    title: opts.q,
    limit,
    offset: (page - 1) * limit,
    originalLanguage: langsFor(opts.type ?? "manhwa"),
    includedTags: opts.tags?.length ? opts.tags : undefined,
    status: opts.status ? [opts.status] : undefined,
    availableTranslatedLanguage: [LANG],
    hasAvailableChapters: "true",
    contentRating: CONTENT_RATINGS,
    includes: ["cover_art"],
    [`order[${order}]`]: order === "title" ? "asc" : "desc",
  });
  // MangaDex caps offset+limit at 10000
  const total = Math.min(res.total, 10000);
  return {
    series: res.data.map(toSeries),
    total,
    pages: Math.ceil(total / limit),
    page,
  };
}

export async function getSeries(id: string) {
  "use cache";
  cacheLife("hours");
  const res = await api<{ data: RawManga }>(`/manga/${id}`, {
    includes: ["cover_art", "author", "artist"],
  });
  return toSeries(res.data);
}

export async function getStats(ids: string[]): Promise<Record<string, Stats>> {
  "use cache";
  cacheLife("hours");
  if (!ids.length) return {};
  const res = await api<{ statistics: Record<string, any> }>(
    "/statistics/manga",
    { manga: ids },
  );
  const out: Record<string, Stats> = {};
  for (const [id, s] of Object.entries(res.statistics)) {
    out[id] = {
      rating: s.rating?.bayesian ? Number(s.rating.bayesian.toFixed(2)) : null,
      follows: s.follows ?? 0,
    };
  }
  return out;
}

export async function getTags(): Promise<Tag[]> {
  "use cache";
  cacheLife("days");
  const res = await api<{ data: any[] }>("/manga/tag");
  return res.data
    .map((t) => ({
      id: t.id,
      name: t.attributes.name.en as string,
      group: t.attributes.group as string,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Chapters ----------

function chapterNum(c: Chapter) {
  const n = parseFloat(c.number ?? "");
  return Number.isFinite(n) ? n : -1;
}

/** Every English upload, including duplicate releases of the same chapter by different groups. */
export async function getAllUploads(mangaId: string): Promise<Chapter[]> {
  "use cache";
  cacheLife("minutes");
  const all: Chapter[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const res = await api<{ data: RawChapter[]; total: number }>(
      `/manga/${mangaId}/feed`,
      {
        limit: 500,
        offset,
        translatedLanguage: [LANG],
        contentRating: [...CONTENT_RATINGS, "erotica", "pornographic"],
        includes: ["scanlation_group"],
        "order[chapter]": "desc",
        "order[readableAt]": "desc",
      },
    );
    all.push(...res.data.map(toChapter));
    if (offset + 500 >= res.total) break;
  }
  return all;
}

/** One entry per chapter number, newest first. Prefers hosted uploads over external links. */
export async function getChapters(mangaId: string): Promise<Chapter[]> {
  const all = await getAllUploads(mangaId);
  const byNum = new Map<string, Chapter>();
  for (const c of all) {
    const key = c.number ?? c.id;
    const prev = byNum.get(key);
    if (!prev || (prev.externalUrl && !c.externalUrl)) byNum.set(key, c);
  }
  return [...byNum.values()].sort((a, b) => chapterNum(b) - chapterNum(a));
}

export async function getChapter(id: string) {
  "use cache";
  cacheLife("hours");
  const res = await api<{ data: RawChapter }>(`/chapter/${id}`, {
    includes: ["scanlation_group", "manga"],
  });
  const manga = res.data.relationships.find((r) => r.type === "manga");
  return { chapter: toChapter(res.data), mangaId: manga?.id ?? null };
}

export type PageImage = { src: string; hd: string };

/** Original-quality page URLs (MangaDex@Home base URLs are valid ~15 min). */
export async function getPages(chapterId: string): Promise<PageImage[]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 300, expire: 600 });
  const res = await api<{
    baseUrl: string;
    chapter: { hash: string; data: string[] | null } | null;
  }>(`/at-home/server/${chapterId}`);
  // External (licensed) chapters come back without a page list.
  if (!res.baseUrl || !res.chapter?.data?.length) return [];
  return res.chapter.data.map((f: string) => {
    const url = `${res.baseUrl}/data/${res.chapter!.hash}/${f}`;
    return { src: img(url), hd: img(url, { hd: true }) };
  });
}

// ---------- Home feed ----------

export type LatestEntry = { series: Series; chapters: Chapter[] };

export async function getLatestUpdates(
  type: SeriesType = "manhwa",
): Promise<LatestEntry[]> {
  "use cache";
  cacheLife("minutes");
  const wanted = 24;
  // Recent chapters across the whole site, grouped into series in upload order.
  const grouped = new Map<string, Chapter[]>();
  for (let offset = 0; offset < 400 && grouped.size < wanted; offset += 100) {
    const res = await api<{ data: RawChapter[] }>("/chapter", {
      limit: 100,
      offset,
      originalLanguage: langsFor(type),
      translatedLanguage: [LANG],
      contentRating: CONTENT_RATINGS,
      includeExternalUrl: 0,
      includeFuturePublishAt: 0,
      "order[readableAt]": "desc",
    });
    for (const c of res.data) {
      const mid = c.relationships.find((r) => r.type === "manga")?.id;
      if (!mid) continue;
      if (!grouped.has(mid) && grouped.size >= wanted) continue;
      const list = grouped.get(mid) ?? [];
      const ch = toChapter(c);
      if (list.length < 3 && !list.some((x) => x.number === ch.number))
        list.push(ch);
      grouped.set(mid, list);
    }
    if (res.data.length < 100) break;
  }
  if (!grouped.size) return [];
  const mangaRes = await api<{ data: RawManga[] }>("/manga", {
    limit: grouped.size,
    ids: [...grouped.keys()],
    contentRating: CONTENT_RATINGS,
    includes: ["cover_art"],
  });
  const byId = new Map(mangaRes.data.map((m) => [m.id, toSeries(m)]));
  return [...grouped.entries()]
    .filter(([id]) => byId.has(id))
    .map(([id, chapters]) => ({ series: byId.get(id)!, chapters }));
}
