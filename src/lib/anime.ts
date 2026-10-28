import "server-only";
import { load } from "cheerio";
import { cacheLife } from "next/cache";
import { sourceFetch } from "./source-http";

const SITE = "https://hianime.tr";
export type Anime = {
  id: string;
  title: string;
  cover: string;
  sub: number;
  dub: number;
  format: string;
  description?: string;
  banner?: string;
};
export type Episode = {
  id: string;
  number: number;
  title: string;
  filler: boolean;
};
export type AnimeServer = {
  name: string;
  language: "sub" | "dub";
  url: string;
  reachable?: boolean;
  latencyMs?: number | null;
};
export type FranchiseEntry = {
  id: string;
  title: string;
  label: string;
  cover: string;
  category: "series" | "movie" | "extra";
};
const validSlug = (id: string) => {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid anime.");
  return id;
};
export async function browseAnime(q = "", category = "popular", page = 1) {
  return browseAnimeCached(q.trim().toLowerCase(), category, page);
}
async function browseAnimeCached(q: string, category: string, page: number) {
  "use cache";
  cacheLife("minutes");
  const path = q
    ? `/search?keyword=${encodeURIComponent(q)}&page=${page}`
    : `/${category === "latest" ? "recently-updated" : category === "dub" ? "dubbed-anime" : category === "airing" ? "top-airing" : "most-popular"}?page=${page}`;
  const $ = load(await (await sourceFetch(`${SITE}${path}`)).text());
  const items: Anime[] = [];
  $(".flw-item").each((_, el) => {
    const e = $(el),
      a = e.find(".film-name a");
    const href = a.attr("href") ?? "";
    const id = href.split("?")[0].split("/").filter(Boolean).at(-1) ?? "";
    if (!id || items.some((x) => x.id === id)) return;
    const image = e.find("img").first();
    items.push({
      id,
      title: a.text().trim(),
      cover: image.attr("data-src") ?? image.attr("src") ?? "",
      sub: Number(e.find(".tick-sub").text().trim()) || 0,
      dub: Number(e.find(".tick-dub").text().trim()) || 0,
      format: e.find(".fd-infor .fdi-item").first().text().trim() || "TV",
    });
  });
  if (!items.length && !$("body").text().toLowerCase().includes("no results"))
    throw new Error(
      "The anime catalog is temporarily unavailable. Please retry.",
    );
  const pages = $(".pagination a")
    .toArray()
    .map(
      (a) =>
        Number(
          new URL($(a).attr("href") ?? "/", SITE).searchParams.get("page"),
        ) || 1,
    );
  return { items, hasNext: Math.max(1, ...pages) > page };
}
export async function getAnime(id: string): Promise<{
  anime: Anime;
  episodes: Episode[];
  franchise: FranchiseEntry[];
  initialServers: AnimeServer[];
  bootstrapEpisodeId: string;
}> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 600, expire: 3600 });
  validSlug(id);
  const $ = load(await (await sourceFetch(`${SITE}/watch/${id}`)).text());
  const animeId = $("#ani_detail").attr("data-anime-id");
  if (!animeId)
    throw new Error("This anime is unavailable from the current source.");
  const bootstrapEpisodeId = $("#ani_detail").attr("data-id") ?? "";
  const [episodeData, initialServers] = await Promise.all([
    sourceFetch(`${SITE}/api/theme/episode/list/${animeId}`).then((r) =>
      r.json(),
    ) as Promise<{ status: boolean; html: string }>,
    /^\d+$/.test(bootstrapEpisodeId)
      ? getAnimeServers(bootstrapEpisodeId).catch(() => [])
      : Promise.resolve([]),
  ]);
  if (!episodeData.status)
    throw new Error("The episode list could not be loaded.");
  const ep = load(episodeData.html);
  const episodes = ep(".ep-item")
    .toArray()
    .map((el) => ({
      id: ep(el).attr("data-id")!,
      number: Number(ep(el).attr("data-number")),
      title:
        ep(el).find(".ep-name").text().trim() ||
        ep(el).attr("title") ||
        "Episode",
      filler: ep(el).hasClass("ssl-item-filler"),
    }));
  const detail = $(".anisc-detail").first();
  const description = detail
    .find(".film-description .text, .film-description")
    .first()
    .text()
    .trim();
  const cover = $(".anisc-poster img").attr("src") ?? "";
  const banner = $(".anis-cover")
    .attr("style")
    ?.match(/url\(['"]?([^)'";]+)/)?.[1];
  const franchise: FranchiseEntry[] = $(".os-list .os-item")
    .toArray()
    .flatMap((el) => {
      const href = $(el).attr("href") ?? "";
      const entryId =
        href.split("?")[0].split("/").filter(Boolean).at(-1) ?? "";
      if (!/^[a-zA-Z0-9-]+$/.test(entryId)) return [];
      const title = $(el).attr("title") ?? $(el).find(".title").text().trim();
      const label = $(el).find(".title").text().trim() || title;
      return [
        {
          id: entryId,
          title,
          label,
          cover:
            $(el)
              .find(".season-poster")
              .attr("style")
              ?.match(/url\(['"]?([^)'";]+)/)?.[1] ?? "",
          category: franchiseCategory(title, label),
        },
      ];
    });
  return {
    franchise,
    initialServers,
    bootstrapEpisodeId,
    anime: {
      id,
      title: detail.find(".film-name").text().trim(),
      cover,
      banner,
      description,
      sub: Number(detail.find(".tick-sub").first().text()) || 0,
      dub: Number(detail.find(".tick-dub").first().text()) || 0,
      format: "Anime",
    },
    episodes,
  };
}
function franchiseCategory(
  title: string,
  format = "",
): FranchiseEntry["category"] {
  return /movie|film/i.test(`${title} ${format}`)
    ? "movie"
    : /\b(?:recap|special|ova|ona|omake|anniversary)\b|sealed sword|memories in the rain|karaburi/i.test(
          `${title} ${format}`,
        )
      ? "extra"
      : "series";
}

export async function getAnimeFranchise(
  title: string,
  linked: FranchiseEntry[],
) {
  "use cache";
  cacheLife("hours");
  const first = linked[0]?.title ?? title;
  const family = first
    .split(/[:(]/)[0]
    .replace(/\s+(?:season|part)\s+\d+.*/i, "")
    .trim();
  if (family.length < 3) return linked;
  const result = await browseAnime(family).catch(() => null);
  const entries = new Map(linked.map((e) => [e.id, e]));
  const titles = new Set(
    linked.map((e) => e.title.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );
  for (const a of [...(result?.items ?? [])].sort(
    (a, b) => b.sub + b.dub - a.sub - a.dub,
  )) {
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      !a.title.toLowerCase().startsWith(family.toLowerCase()) ||
      titles.has(key)
    )
      continue;
    entries.set(a.id, {
      id: a.id,
      title: a.title,
      label: a.title,
      cover: a.cover,
      category: franchiseCategory(a.title, a.format),
    });
    titles.add(key);
  }
  return [...entries.values()];
}

export async function getAnimeServerHealth(episodeId: string) {
  "use cache";
  cacheLife({ stale: 30, revalidate: 90, expire: 180 });
  const servers = await getAnimeServers(episodeId);
  return Promise.all(
    servers.map(async (s) => {
      const start = performance.now();
      try {
        const res = await fetch(s.url, {
          headers: { "User-Agent": "Mozilla/5.0", Referer: SITE },
          signal: AbortSignal.timeout(5000),
        });
        const text = await res.text();
        const removed =
          /error code:\s*(?:<[^>]+>\s*)*(?:410|404)|can.t find the file|file (?:was |has been )?(?:deleted|removed)/i.test(
            text,
          );
        return {
          ...s,
          reachable: res.ok && !removed,
          latencyMs: Math.round(performance.now() - start),
        };
      } catch {
        return { ...s, reachable: false, latencyMs: null };
      }
    }),
  );
}
export async function getAnimeServers(
  episodeId: string,
): Promise<AnimeServer[]> {
  "use cache";
  cacheLife("minutes");
  if (!/^\d+$/.test(episodeId)) throw new Error("Invalid episode.");
  const data = (await (
    await sourceFetch(
      `${SITE}/api/theme/episode/servers?episodeId=${episodeId}`,
    )
  ).json()) as { status: boolean; html: string };
  if (!data.status)
    throw new Error("Playback servers are temporarily unavailable.");
  const $ = load(data.html);
  return $(".server-item")
    .toArray()
    .flatMap((el) => {
      const language = $(el).attr("data-type");
      const url = Buffer.from($(el).attr("data-hash") ?? "", "base64").toString(
        "utf8",
      );
      if (
        (language !== "sub" && language !== "dub") ||
        !/^https:\/\//.test(url)
      )
        return [];
      return [
        {
          name: $(el).attr("data-server-name") ?? $(el).text().trim(),
          language,
          url,
        },
      ];
    });
}
