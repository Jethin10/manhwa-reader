import "server-only";
import { load } from "cheerio";
import { cacheLife } from "next/cache";
import type { BrowseOptions, Chapter, Series } from "./mangadex";
import { sourceFetch } from "./source-http";
import { img } from "./images";
import { imageSignature } from "./image-signing";

// WeebCentral renders server-side HTML fragments for htmx; no browser runtime is needed.
const SITE = "https://weebcentral.com";
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function ulidAt(id: string, index: number, label: string) {
  const value = id.split("~")[index];
  if (!value || !ULID.test(value)) throw new Error(`Invalid WeebCentral ${label}.`);
  return value;
}
const fragment = (url: string) =>
  sourceFetch(url, { referer: `${SITE}/`, headers: { "HX-Request": "true" } }).then((r) => r.text());

const field = (text: string, label: string, next: string) =>
  text.match(new RegExp(`${label}:\\s*(.*?)\\s*(?:${next}|$)`))?.[1]?.trim() ?? "";
const list = (value: string) =>
  value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const status = (s: string) =>
  ({ complete: "completed", canceled: "cancelled" })[s.toLowerCase()] ?? s.toLowerCase();

const SORTS: Record<string, string> = {
  followedCount: "Popularity",
  rating: "Subscribers",
  latestUploadedChapter: "Latest Updates",
  createdAt: "Recently Added",
  title: "Alphabet",
  relevance: "Best Match",
};
const TYPES: Record<string, string> = { manhwa: "Manhwa", manga: "Manga", manhua: "Manhua" };
const STATUSES: Record<string, string> = {
  ongoing: "Ongoing",
  completed: "Complete",
  hiatus: "Hiatus",
  cancelled: "Canceled",
};

export async function browseWeebCentral(opts: BrowseOptions) {
  "use cache";
  cacheLife("minutes");
  const page = Math.max(1, opts.page ?? 1);
  const limit = 32;
  const order = opts.order ?? (opts.q ? "relevance" : "followedCount");
  const p = new URLSearchParams({
    text: opts.q ?? "",
    display_mode: "Full Display",
    limit: String(limit),
    offset: String((page - 1) * limit),
    sort: SORTS[order] ?? "Popularity",
    order: order === "title" ? "Ascending" : "Descending",
    official: "Any",
    anime: "Any",
    adult: "False",
  });
  if (opts.type && opts.type !== "all") p.set("included_type", TYPES[opts.type]);
  if (opts.status && STATUSES[opts.status]) p.set("included_status", STATUSES[opts.status]);
  const $ = load(await fragment(`${SITE}/search/data?${p}`));
  const series: Series[] = [];
  $("body > article").each((_, el) => {
    const card = $(el);
    const href = card.find('a[href*="/series/"]').first().attr("href") ?? "";
    const ulid = href.match(/\/series\/([0-9A-Z]{26})/)?.[1];
    if (!ulid) return;
    card.find("svg").remove();
    const text = card.text().replace(/\s+/g, " ");
    const title = (card.find("img[alt]").first().attr("alt") ?? "").replace(/ cover$/, "");
    series.push({
      id: `weebcentral~${ulid}`,
      title,
      altTitles: [],
      description: "",
      status: status(field(text, "Status", "Type:")),
      year: Number(field(text, "Year", "Status:")) || null,
      type: field(text, "Type", "Author") || "Comic",
      contentRating: "safe",
      tags: list(field(text, "Tag\\(s\\)", "$^")).map((t) => ({ id: t, name: t, group: "genre" })),
      cover: `https://temp.compsci88.com/cover/normal/${ulid}.webp`,
      authors: list(field(text, "Author\\(s\\)", "Tag\\(s\\):")),
      artists: [],
      lastChapter: null,
      updatedAt: "",
    });
  });
  const more = $("button[hx-get*='/search/data']").length > 0;
  return {
    series,
    // The source exposes "view more" instead of a total, so report one page beyond the current one.
    total: (page - 1) * limit + series.length + (more ? limit : 0),
    pages: more ? page + 1 : page,
    page,
  };
}

export async function getWeebCentralSeries(id: string): Promise<Series> {
  "use cache";
  cacheLife("hours");
  const ulid = ulidAt(id, 1, "series");
  const $ = load(await (await sourceFetch(`${SITE}/series/${ulid}`)).text());
  const info = new Map<string, string>();
  $("section li").each((_, el) => {
    const label = $(el).find("strong").first().text().replace(/[:\s]+$/, "");
    if (label) info.set(label, $(el).text().replace(/\s+/g, " ").replace(`${label}:`, "").trim());
  });
  const altTitles: string[] = [];
  $("section li")
    .filter((_, el) => $(el).find("strong").text().includes("Associated Name"))
    .find("li")
    .each((_, el) => {
      altTitles.push($(el).text().trim());
    });
  const title = $("h1").first().text().trim();
  if (!title) throw new Error("WeebCentral did not return this series.");
  return {
    id,
    title,
    altTitles: [...new Set(altTitles)].slice(0, 6),
    description: $("p.whitespace-pre-wrap").first().text().trim(),
    status: status(info.get("Status") ?? "unknown"),
    year: Number(info.get("Released")) || null,
    type: info.get("Type") ?? "Comic",
    contentRating: info.get("Adult Content") === "Yes" ? "erotica" : "safe",
    tags: list(info.get("Tags(s)") ?? "").map((t) => ({ id: t, name: t, group: "genre" })),
    cover: `https://temp.compsci88.com/cover/normal/${ulid}.webp`,
    authors: list(info.get("Author(s)") ?? ""),
    artists: [],
    lastChapter: null,
    updatedAt: "",
  };
}

export async function getWeebCentralChapters(id: string): Promise<Chapter[]> {
  "use cache";
  cacheLife("minutes");
  const ulid = ulidAt(id, 1, "series");
  const $ = load(await fragment(`${SITE}/series/${ulid}/full-chapter-list`));
  const chapters: Chapter[] = [];
  $('a[href*="/chapters/"]').each((_, el) => {
    const chapterId = $(el).attr("href")?.match(/\/chapters\/([0-9A-Z]{26})/)?.[1];
    if (!chapterId) return;
    const label = $(el).find("span.grow > span").first().text().trim();
    const number = label.match(/(\d+(?:\.\d+)?)/)?.[1] ?? null;
    chapters.push({
      id: `weebcentral~${ulid}~${chapterId}`,
      number,
      volume: null,
      // Keep labels such as "Side Story 3" that are not plain chapters.
      title: /^chapter\s/i.test(label) ? null : label || null,
      pages: 0,
      externalUrl: null,
      readableAt: $(el).find("time").attr("datetime") ?? "",
      group: "WeebCentral",
    });
  });
  return chapters;
}

export async function getWeebCentralChapter(id: string) {
  const mangaId = `weebcentral~${ulidAt(id, 1, "series")}`;
  const chapter = (await getWeebCentralChapters(mangaId)).find((c) => c.id === id);
  if (!chapter) throw new Error("This WeebCentral chapter is unavailable.");
  return { mangaId, chapter };
}

export async function getWeebCentralPages(id: string) {
  "use cache";
  cacheLife("minutes");
  const chapterId = ulidAt(id, 2, "chapter");
  const $ = load(
    await fragment(
      `${SITE}/chapters/${chapterId}/images?is_prev=False&current_page=1&reading_style=long_strip`,
    ),
  );
  const urls = $("img[src]")
    .map((_, el) => $(el).attr("src")!)
    .get()
    .filter((src) => /^https:\/\//.test(src) && !src.includes("broken_image"));
  if (!urls.length) throw new Error("WeebCentral has no readable pages for this chapter.");
  // Page hosts rotate between mirrors, so each URL is signed for the image proxy.
  return urls.map((src) => ({
    src: `${img(src)}&sig=${imageSignature(src)}`,
    hd: `${img(src, { hd: true })}&sig=${imageSignature(src)}`,
  }));
}
