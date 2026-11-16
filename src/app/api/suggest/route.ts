import { browseAnime } from "@/lib/anime";
import { providers, withTimeout } from "@/lib/catalog";
import { coverSrc } from "@/lib/images";
import { sameTitle } from "@/lib/titles";
import { searchMovies } from "@/lib/movies";
import type { ProviderId } from "@/lib/sources";

/** `kind` is what the title is (Anime, Movie, Manhwa…); `meta` is the detail after it. */
export type Suggestion = { id: string; title: string; cover: string; kind: string; meta: string; href: string };

// The fastest catalogs answer suggestions; full search still covers every source.
const QUICK: ProviderId[] = ["asura", "mangadex", "mangapill"];
const LIMIT = 8;

/** Titles matching what's typed so far, for the search box's live suggestions. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ items: [] });
  const section = params.get("section");
  const items =
    section === "movies"
      ? await movies(q)
      : section === "anime"
        ? await anime(q)
        : section === "manga"
          ? await manga(q)
          : await everything(q);
  return Response.json(
    { items },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}

async function manga(q: string): Promise<Suggestion[]> {
  const pages = await Promise.allSettled(
    QUICK.map((p) => withTimeout(providers[p].browse({ q, type: "all", limit: 8 }), 2500, p)),
  );
  const found: Suggestion[] = [];
  const seen: { title: string; altTitles: string[] }[] = [];
  // Interleave so each source's best match ranks before anyone's second.
  for (let i = 0; i < 8 && found.length < LIMIT; i++)
    for (const r of pages) {
      const s = r.status === "fulfilled" ? r.value.series[i] : undefined;
      if (!s || seen.some((x) => sameTitle(x, s))) continue;
      seen.push(s);
      found.push({
        id: s.id,
        title: s.title,
        cover: coverSrc(s.cover, 256),
        kind: cap(s.type) || "Comic",
        meta: s.year ? String(s.year) : "",
        href: `/series/${s.id}`,
      });
    }
  return found.slice(0, LIMIT);
}

async function anime(q: string): Promise<Suggestion[]> {
  const page = await withTimeout(browseAnime(q, "popular", 1), 5000, "Anime").catch(() => null);
  return (page?.items ?? []).slice(0, LIMIT).map((a) => ({
    id: a.id,
    title: a.title,
    cover: coverSrc(a.cover, 256),
    kind: /movie/i.test(a.format) ? "Anime film" : "Anime",
    meta: /movie/i.test(a.format) ? "" : a.sub ? `${a.sub} episodes` : a.format,
    href: `/anime/${a.id}`,
  }));
}

/** Anime, movies and comics together, best match of each kind first. */
async function everything(q: string): Promise<Suggestion[]> {
  const kinds = await Promise.all([
    withTimeout(anime(q), 3000, "Anime").catch(() => []),
    withTimeout(movies(q), 3000, "Movies").catch(() => []),
    withTimeout(manga(q), 3000, "Comics").catch(() => []),
  ]);
  const found: Suggestion[] = [];
  for (let i = 0; found.length < 9 && kinds.some((k) => k[i]); i++)
    for (const k of kinds) if (k[i] && found.length < 9) found.push(k[i]);
  return found;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function movies(q: string): Promise<Suggestion[]> {
  const result = await searchMovies(q).catch(() => null);
  return (result?.items ?? []).slice(0, LIMIT).map((m) => ({ id: m.id, title: m.title, cover: m.poster, kind: "Movie", meta: m.year, href: `/movies/${m.id}` }));
}
