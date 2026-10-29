import "server-only";
import { load, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { cacheLife } from "next/cache";
import type { BrowseOptions, Chapter, Series } from "./mangadex";
import { sourceFetch } from "./source-http";
import { img } from "./images";

// MangaKatana serves plain HTML, and its image hosts need no Referer.
const SITE = "https://mangakatana.com";

async function html(path: string) {
  const res = await sourceFetch(`${SITE}${path}`);
  return { $: load(await res.text()), url: res.url };
}

function seriesNumber(id: string) {
  const n = id.split("~")[1];
  if (!n || !/^\d+$/.test(n)) throw new Error("Invalid MangaKatana title.");
  return n;
}
const numberFromUrl = (href = "") => href.match(/\/manga\/[^/]*\.(\d+)(?:\/|$)/)?.[1];
const status = (s: string) => {
  const v = s.trim().toLowerCase();
  return v === "completed" ? "completed" : v === "ongoing" ? "ongoing" : v || "unknown";
};
// The site files format as genres ("Manhwa", "Manhua"); anything else is manga.
function typeOf(genres: string[]) {
  const g = genres.map((x) => x.toLowerCase());
  return g.includes("manhwa") ? "Manhwa" : g.includes("manhua") ? "Manhua" : "Manga";
}
const tags = (names: string[]) => names.map((name) => ({ id: name, name, group: "genre" }));
// "May-31-2023" -> ISO
function isoDate(s: string) {
  const d = new Date(s.trim().replace(/-/g, " "));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function card($: CheerioAPI, el: AnyNode): Series | null {
  const item = $(el);
  const link = item.find("h3.title a").first();
  const n = numberFromUrl(link.attr("href"));
  if (!n) return null;
  const genres = item.find(".genres a").map((_, g) => $(g).text().trim()).get();
  return {
    id: `mangakatana~${n}`,
    title: link.text().trim(),
    altTitles: [],
    description: item.find(".summary").text().trim(),
    status: status(item.find(".status").text()),
    year: null,
    type: typeOf(genres),
    contentRating: "safe",
    tags: tags(genres),
    cover: item.find(".wrap_img img").attr("src") ?? null,
    authors: [],
    artists: [],
    lastChapter: item.find("h3.title span").text().match(/(\d+(?:\.\d+)?)/)?.[1] ?? null,
    updatedAt: isoDate(item.find(".date").first().text()),
  };
}

export async function browseMangaKatana(opts: BrowseOptions) {
  "use cache";
  cacheLife("minutes");
  const page = Math.max(1, opts.page ?? 1);
  const prefix = page > 1 ? `/page/${page}` : "";
  // Manhwa and manhua are genres on the site, so their listings come from the genre pages.
  const listing = opts.type === "manhwa" || opts.type === "manhua" ? `/genre/${opts.type}` : "/manga";
  const path = opts.q
    ? `${prefix || "/"}?${new URLSearchParams({ search: opts.q, search_by: "book_name" })}`
    : `${listing}${prefix}?filter=1&order=${opts.order === "createdAt" ? "new" : "latest"}`;
  const { $, url } = await html(path);

  let series: Series[];
  // A search with one match redirects straight to that title.
  if ($("#single_book").length) {
    const n = numberFromUrl(url) ?? numberFromUrl($('link[rel="canonical"]').attr("href"));
    series = n ? [(await detail(`mangakatana~${n}`)).series] : [];
  } else {
    series = $("#book_list > .item")
      .map((_, el) => card($, el))
      .get()
      .filter((s): s is Series => s !== null);
  }
  // Searches and the manga listing mix formats, so narrow them by the format genres.
  if (opts.type && opts.type !== "all") series = series.filter((s) => s.type.toLowerCase() === opts.type);
  const more = $("a.next.page-numbers").length > 0;
  return {
    series,
    total: (page - 1) * 20 + series.length + (more ? 20 : 0),
    pages: more ? page + 1 : page,
    page,
  };
}

async function detail(id: string) {
  "use cache";
  cacheLife("minutes");
  const n = seriesNumber(id);
  // The slug is cosmetic: any slug ending in the number opens the title.
  const { $ } = await html(`/manga/x.${n}`);
  const title = $("#single_book h1.heading").first().text().trim();
  if (!title) throw new Error("MangaKatana did not return this title.");
  const genres = $("#single_book .genres a").map((_, g) => $(g).text().trim()).get();
  const authors = $("#single_book a.author").map((_, a) => $(a).text().trim()).get();
  const series: Series = {
    id,
    title,
    altTitles: $(".alt_name")
      .text()
      .split(/\s*;\s*/)
      .map((t) => t.trim())
      .filter(Boolean),
    description: $("#single_book .summary p").text().trim(),
    status: status($(".value.status").text()),
    year: null,
    type: typeOf(genres),
    contentRating: "safe",
    tags: tags(genres),
    cover: $("#single_book .cover img").attr("src") ?? null,
    authors,
    artists: [],
    lastChapter: $(".value.new_chap").text().match(/(\d+(?:\.\d+)?)/)?.[1] ?? null,
    updatedAt: isoDate($(".value.updateAt").text()),
  };
  const chapters: Chapter[] = $(".chapters tr")
    .map((_, row): Chapter | null => {
      const a = $(row).find(".chapter a");
      const path = a.attr("href")?.match(/\/(c[\w.-]+)$/)?.[1];
      if (!path) return null;
      const label = a.text().trim();
      const m = label.match(/^chapter\s+(\d+(?:\.\d+)?)\s*:?\s*(.*)$/i);
      return {
        id: `mangakatana~${n}~${path}`,
        number: m?.[1] ?? null,
        volume: null,
        title: (m ? m[2] : label) || null,
        pages: 0,
        externalUrl: null,
        readableAt: isoDate($(row).find(".update_time").text()),
        group: "MangaKatana",
      };
    })
    .get()
    .filter((c): c is Chapter => c !== null);
  return { series, chapters };
}

export const getMangaKatanaSeries = async (id: string) => (await detail(id)).series;
export const getMangaKatanaChapters = async (id: string) => (await detail(id)).chapters;

export async function getMangaKatanaChapter(id: string) {
  const mangaId = `mangakatana~${seriesNumber(id)}`;
  const chapter = (await getMangaKatanaChapters(mangaId)).find((c) => c.id === id);
  if (!chapter) throw new Error("This MangaKatana chapter is unavailable.");
  return { mangaId, chapter };
}

export async function getMangaKatanaPages(id: string) {
  "use cache";
  cacheLife("minutes");
  const [, n, path] = id.split("~");
  if (!/^\d+$/.test(n ?? "") || !/^c[\w.-]+$/.test(path ?? "")) throw new Error("Invalid chapter.");
  const { $ } = await html(`/manga/x.${n}/${path}`);
  // Pages sit in a script array under a rotating name, next to a one-image decoy;
  // the real list is the longest one.
  const arrays = $("script")
    .map((_, s) => $(s).text())
    .get()
    .flatMap((code) => [...code.matchAll(/var\s+\w+\s*=\s*\[([^\]]*)\]/g)])
    .map((m) => [...m[1].matchAll(/'(https:\/\/[^']+)'/g)].map((u) => u[1]));
  const urls = arrays.sort((a, b) => b.length - a.length)[0] ?? [];
  if (!urls.length) throw new Error("MangaKatana has no readable pages for this chapter.");
  return urls.map((src) => ({ src: img(src), hd: img(src, { hd: true }) }));
}
