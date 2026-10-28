import "server-only";
import { cacheLife } from "next/cache";
import type { BrowseOptions, Chapter, Series } from "./mangadex";
import { astroProps, plainText, sourceFetch } from "./source-http";
import { img } from "./images";

const API = "https://api.asurascans.com/api";
const SITE = "https://asurascans.com";
type RawSeries = {
  slug: string;
  title: string;
  description?: string;
  cover: string;
  status: string;
  type: string;
  release_year?: number;
  genres?: { slug: string; name: string }[];
  author?: string;
  artist?: string;
  alternative_titles?: string;
  updated_at: string;
  rating?: number;
  bookmark_count?: number;
  public_url: string;
};
type RawChapter = {
  number: number;
  title?: string;
  page_count: number;
  is_premium?: boolean;
  early_access_until?: string;
  published_at: string;
};
const slugOf = (id: string) => {
  const slug = id.split("~")[1];
  if (!slug || !/^[a-z0-9-]+$/.test(slug))
    throw new Error("Invalid Asura series.");
  return slug;
};
function mapSeries(s: RawSeries): Series {
  return {
    id: `asura~${s.slug}`,
    title: s.title,
    description: plainText(s.description ?? ""),
    cover: s.cover,
    status: s.status,
    type: s.type[0].toUpperCase() + s.type.slice(1),
    year: s.release_year ?? null,
    tags: (s.genres ?? []).map((g) => ({
      id: g.slug,
      name: g.name,
      group: "genre",
    })),
    authors: s.author ? [s.author] : [],
    artists: s.artist ? [s.artist] : [],
    altTitles:
      s.alternative_titles
        ?.split("•")
        .map((x) => x.trim())
        .slice(0, 6) ?? [],
    contentRating: "safe",
    lastChapter: null,
    updatedAt: s.updated_at,
  };
}
export async function browseAsura(opts: BrowseOptions) {
  "use cache";
  cacheLife("minutes");
  const page = opts.page ?? 1,
    limit = opts.limit ?? 24;
  const p = new URLSearchParams({
    offset: String((page - 1) * limit),
    limit: String(limit),
    sort:
      opts.order === "latestUploadedChapter"
        ? "latest"
        : opts.order === "createdAt"
          ? "update"
          : opts.order === "title"
            ? "title"
            : opts.order === "rating"
              ? "rating"
              : "popular",
  });
  p.set("order", opts.order === "title" ? "asc" : "desc");
  if (opts.q) p.set("search", opts.q);
  if (opts.type && opts.type !== "all") p.set("type", opts.type);
  if (opts.status)
    p.set("status", opts.status === "cancelled" ? "dropped" : opts.status);
  const data = (await (await sourceFetch(`${API}/series?${p}`)).json()) as {
    data: RawSeries[];
    meta: { total: number };
  };
  return {
    series: data.data.map(mapSeries),
    total: data.meta.total,
    pages: Math.ceil(data.meta.total / limit),
    page,
  };
}
export async function asuraDetail(id: string) {
  "use cache";
  cacheLife("minutes");
  const data = (await (
    await sourceFetch(`${API}/series/${slugOf(id)}`)
  ).json()) as { series?: RawSeries; data?: { series?: RawSeries } };
  const series = data.series ?? data.data?.series;
  if (!series?.slug || !series.public_url) throw new Error("Asura Scans did not return this series. Try another source.");
  return series;
}
export async function getAsuraSeries(id: string) {
  return mapSeries(await asuraDetail(id));
}
export async function getAsuraChapters(id: string): Promise<Chapter[]> {
  "use cache";
  cacheLife("minutes");
  const s = await asuraDetail(id);
  const html = await (await sourceFetch(`${SITE}${s.public_url}`)).text();
  const data = astroProps<{ chapters: RawChapter[] }>(html, "chapters");
  return data.chapters
    .filter(
      (c) =>
        !c.is_premium &&
        (!c.early_access_until ||
          Date.parse(c.early_access_until) <= Date.now()),
    )
    .map((c) => ({
      id: `${id}~${c.number}`,
      number: String(c.number),
      title: c.title ?? null,
      volume: null,
      pages: c.page_count,
      externalUrl: null,
      readableAt: c.published_at,
      group: "Asura Scans",
    }))
    .sort((a, b) => Number(b.number) - Number(a.number));
}
export async function getAsuraChapter(id: string) {
  const mangaId = id.split("~").slice(0, 2).join("~");
  const chapter = (await getAsuraChapters(mangaId)).find((c) => c.id === id);
  if (!chapter)
    throw new Error(
      "This chapter is unavailable or requires access on Asura Scans.",
    );
  return { mangaId, chapter };
}
export async function getAsuraPages(id: string) {
  "use cache";
  cacheLife("minutes");
  await getAsuraChapter(id);
  const s = await asuraDetail(id);
  const number = id.split("~")[2];
  if (!/^\d+(\.\d+)?$/.test(number)) throw new Error("Invalid chapter.");
  const html = await (
    await sourceFetch(`${SITE}${s.public_url}/chapter/${number}`)
  ).text();
  const data = astroProps<{ pages: { url: string; tiles?: number[] }[] }>(
    html,
    "pages",
  );
  if (!data.pages.length)
    throw new Error("Asura has no readable pages for this chapter.");
  if (data.pages.some((p) => p.tiles?.length))
    throw new Error(
      "This chapter uses an unsupported image format. Choose another chapter or source.",
    );
  return data.pages.map((p) => ({
    src: img(p.url),
    hd: img(p.url, { hd: true }),
  }));
}
