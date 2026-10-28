import "server-only";
import { load } from "cheerio";
import { cacheLife } from "next/cache";
import type { BrowseOptions, Chapter, Series } from "./mangadex";
import { sourceFetch } from "./source-http";
import { img } from "./images";

// MangaPill serves plain HTML; its image CDN only checks the Referer.
const SITE = "https://mangapill.com";

const html = async (path: string) =>
  load(await (await sourceFetch(`${SITE}${path}`, { referer: `${SITE}/` })).text());

function seriesNumber(id: string) {
  const n = id.split("~")[1];
  if (!n || !/^\d+$/.test(n)) throw new Error("Invalid MangaPill title.");
  return n;
}
const status = (s: string) =>
  ({ publishing: "ongoing", finished: "completed", "on hiatus": "hiatus", discontinued: "cancelled" })[
    s.toLowerCase()
  ] ?? (s.toLowerCase() || "unknown");
const typeName = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : "Manga");

const STATUSES: Record<string, string> = {
  ongoing: "publishing",
  completed: "finished",
  hiatus: "on hiatus",
  cancelled: "discontinued",
};

export async function browseMangaPill(opts: BrowseOptions) {
  "use cache";
  cacheLife("minutes");
  const page = Math.max(1, opts.page ?? 1);
  const p = new URLSearchParams({ q: opts.q ?? "", page: String(page) });
  // MangaPill has no "manhwa" type; Korean titles are filed as manga, so only filter the types it knows.
  if (opts.type === "manga" || opts.type === "manhua") p.set("type", opts.type);
  if (opts.status && STATUSES[opts.status]) p.set("status", STATUSES[opts.status]);
  const $ = await html(`/search?${p}`);
  const series: Series[] = [];
  $('a.relative.block[href^="/manga/"]').each((_, el) => {
    const n = $(el).attr("href")!.match(/^\/manga\/(\d+)\//)?.[1];
    if (!n) return;
    const card = $(el).parent();
    const badges = card
      .find(".flex.flex-wrap")
      .first()
      .children()
      .map((_, b) => $(b).text().trim())
      .get();
    series.push({
      id: `mangapill~${n}`,
      title: card.find(".font-black").first().text().trim(),
      altTitles: [card.find(".text-xs.text-secondary").first().text().trim()].filter(Boolean),
      description: "",
      status: status(badges[2] ?? ""),
      year: Number(badges[1]) || null,
      type: typeName(badges[0] ?? ""),
      contentRating: "safe",
      tags: card
        .find(".flex.flex-wrap")
        .eq(1)
        .children()
        .map((_, t) => {
          const name = $(t).text().trim();
          return { id: name, name, group: "genre" };
        })
        .get(),
      cover: $(el).find("img").attr("data-src") ?? null,
      authors: [],
      artists: [],
      lastChapter: null,
      updatedAt: "",
    });
  });
  const more = $(`a[href*="page=${page + 1}"]`).length > 0;
  return {
    series,
    total: (page - 1) * 50 + series.length + (more ? 50 : 0),
    pages: more ? page + 1 : page,
    page,
  };
}

async function detail(id: string) {
  "use cache";
  cacheLife("minutes");
  const n = seriesNumber(id);
  // The slug is cosmetic: MangaPill redirects any slug to the canonical page.
  const $ = await html(`/manga/${n}/x`);
  const info = new Map<string, string>();
  $("label").each((_, el) => {
    info.set($(el).text().trim(), $(el).next().text().replace(/\s+/g, " ").trim());
  });
  const title = $("h1").first().text().trim();
  if (!title) throw new Error("MangaPill did not return this title.");
  const series: Series = {
    id,
    title,
    altTitles: [$("h1").first().next(".text-sm").text().trim()].filter(Boolean),
    description: $("p.text-sm").first().text().trim(),
    status: status(info.get("Status") ?? ""),
    year: Number(info.get("Year")) || null,
    type: typeName(info.get("Type") ?? ""),
    contentRating: "safe",
    tags: $('a[href*="genre="]')
      .map((_, el) => {
        const name = $(el).text().trim();
        return { id: name, name, group: "genre" };
      })
      .get(),
    cover: $("img[data-src]").first().attr("data-src") ?? null,
    authors: [],
    artists: [],
    lastChapter: null,
    updatedAt: "",
  };
  const chapters: Chapter[] = $("#chapters a[href^='/chapters/']")
    .map((_, el): Chapter | null => {
      const path = $(el).attr("href")!.match(/^\/chapters\/(\d+-\d+)\//)?.[1];
      if (!path) return null;
      const label = $(el).text().trim();
      return {
        id: `mangapill~${n}~${path}`,
        number: label.match(/(\d+(?:\.\d+)?)/)?.[1] ?? null,
        volume: null,
        title: /^chapter\s/i.test(label) ? null : label || null,
        pages: 0,
        externalUrl: null,
        readableAt: "",
        group: "MangaPill",
      };
    })
    .get()
    .filter((c): c is Chapter => c !== null);
  return { series, chapters };
}

export const getMangaPillSeries = async (id: string) => (await detail(id)).series;
export const getMangaPillChapters = async (id: string) => (await detail(id)).chapters;

export async function getMangaPillChapter(id: string) {
  const mangaId = `mangapill~${seriesNumber(id)}`;
  const chapter = (await getMangaPillChapters(mangaId)).find((c) => c.id === id);
  if (!chapter) throw new Error("This MangaPill chapter is unavailable.");
  return { mangaId, chapter };
}

export async function getMangaPillPages(id: string) {
  "use cache";
  cacheLife("minutes");
  const path = id.split("~")[2];
  if (!path || !/^\d+-\d+$/.test(path)) throw new Error("Invalid chapter.");
  const $ = await html(`/chapters/${path}/x`);
  const urls = $("img.js-page[data-src]")
    .map((_, el) => $(el).attr("data-src")!)
    .get()
    .filter((src) => src.startsWith("https://"));
  if (!urls.length) throw new Error("MangaPill has no readable pages for this chapter.");
  return urls.map((src) => ({ src: img(src), hd: img(src, { hd: true }) }));
}
