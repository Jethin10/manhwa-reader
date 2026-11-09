import "server-only";
import { cacheLife } from "next/cache";
import {
  isMovieId,
  movieImage,
  type Movie,
  type MovieCategory,
} from "./movie-types";

const CINEMETA = "https://v3-cinemeta.strem.io";
// Verified IMDb IDs. Regional shelves don't wait on twelve independent detail requests.
const TELUGU = [
  ["tt8178634", "RRR", "2022", "579974"],
  ["tt16539454", "Pushpa 2: The Rule", "2024", "857598"],
  ["tt12735488", "Kalki 2898 AD", "2024", "801688"],
  ["tt13927994", "Salaar", "2023", "770906"],
  ["tt15433956", "Hanu Man", "2024", "869760"],
  ["tt20850406", "Sita Ramam", "2022", "894803"],
  ["tt9389998", "Pushpa: The Rise", "2021", "690957"],
  ["tt4849438", "Baahubali 2: The Conclusion", "2017", "350312"],
  ["tt2631186", "Baahubali: The Beginning", "2015", "256040"],
  ["tt8948790", "Jersey", "2019", "592898"],
  ["tt2258337", "Eega", "2012", "148265"],
  ["tt1447500", "Magadheera", "2009", "23790"],
];
const INDIAN = [
  ["tt5074352", "Dangal", "2016"],
  ["tt1187043", "3 Idiots", "2009"],
  ["tt0871510", "Chak De! India", "2007"],
  ["tt1280558", "A Wednesday", "2008"],
  ["tt8178634", "RRR", "2022"],
  ["tt15354916", "Jawan", "2023"],
  ["tt12844910", "Pathaan", "2023"],
  ["tt15097216", "Jai Bhim", "2021"],
  ["tt2016894", "Ek Tha Tiger", "2012"],
  ["tt0367110", "Swades", "2004"],
  ["tt0986264", "Taare Zameen Par", "2007"],
];
function regionalMovie([id, title, year, tmdbId]: string[]): Movie {
  return {
    id,
    title,
    year,
    tmdbId,
    poster: `https://images.metahub.space/poster/small/${id}/img`,
    background: `https://images.metahub.space/background/medium/${id}/img`,
    rating: "",
    genres: [],
    description: "",
    runtime: "",
    country: "India",
    cast: [],
    director: [],
  };
}

async function json(url: string, ms = 7000): Promise<Record<string, unknown>> {
  // Cinemeta redirects skip=0 to its canonical catalog URL. Requests start at fixed hosts.
  const response = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Movie catalog is temporarily unavailable.");
  }
  return response.json();
}
function strings(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string").slice(0, 20)
    : [];
}
function text(v: unknown): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : "";
}
function normalize(raw: Record<string, unknown>): Movie | null {
  const id = text(raw.imdb_id || raw.id);
  if (!isMovieId(id) || (raw.type && raw.type !== "movie")) return null;
  const tmdbId = text(raw.moviedb_id);
  return {
    id,
    title: text(raw.name || raw.title).slice(0, 400),
    poster: movieImage(raw.poster),
    background: movieImage(raw.background),
    year: text(raw.releaseInfo || raw.year).slice(0, 20),
    rating: text(raw.imdbRating),
    genres: strings(raw.genres),
    description: text(raw.description).slice(0, 10000),
    runtime: text(raw.runtime),
    country: text(raw.country),
    cast: strings(raw.cast),
    director: strings(raw.director),
    ...(/^\d{1,10}$/.test(tmdbId) ? { tmdbId } : {}),
  };
}
async function cinemetaSearch(q: string): Promise<Movie[]> {
  const data = await json(
    `${CINEMETA}/catalog/movie/top/search=${encodeURIComponent(q)}.json`,
    5500,
  );
  return (Array.isArray(data.metas) ? data.metas : [])
    .map(normalize)
    .filter((m): m is Movie => !!m);
}
async function imdbSearch(q: string): Promise<Movie[]> {
  const data = await json(
    `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json`,
    4000,
  );
  return (Array.isArray(data.d) ? data.d : [])
    .filter((r) => r.qid === "movie")
    .map((r) =>
      normalize({
        id: r.id,
        name: r.l,
        year: r.y,
        poster: r.i?.imageUrl,
      }),
    )
    .filter((m): m is Movie => !!m);
}

export async function searchMovies(q: string) {
  "use cache";
  cacheLife({ stale: 120, revalidate: 300, expire: 3600 });
  const term = q.trim().slice(0, 100);
  if (!term) return { items: [] as Movie[], partial: false };
  if (isMovieId(term)) return { items: [await getMovie(term)], partial: false };
  const results = await Promise.allSettled([
    cinemetaSearch(term),
    imdbSearch(term),
  ]);
  if (results.every((r) => r.status === "rejected"))
    throw new Error("Movie search isn't responding. Please retry.");
  const found = new Map<string, Movie>();
  for (const r of results)
    if (r.status === "fulfilled")
      for (const m of r.value) if (!found.has(m.id)) found.set(m.id, m);
  return {
    items: [...found.values()].slice(0, 100),
    partial: results.some((r) => r.status === "rejected"),
  };
}

export async function getMovie(id: string): Promise<Movie> {
  "use cache";
  cacheLife("hours");
  if (!isMovieId(id)) throw new Error("Invalid movie ID.");
  const data = await json(`${CINEMETA}/meta/movie/${id}.json`);
  const movie =
    data.meta && typeof data.meta === "object"
      ? normalize(data.meta as Record<string, unknown>)
      : null;
  if (!movie) throw new Error("This movie wasn't found. Try another title.");
  return movie;
}

export async function browseMovies(
  category: MovieCategory,
  page: number,
  genre = "",
) {
  "use cache";
  cacheLife({ stale: 300, revalidate: 1800, expire: 86400 });
  if (category === "telugu" || category === "indian") {
    // Small, explicit regional collections. Country/language filters aren't supported by Cinemeta.
    return {
      items: (category === "telugu" ? TELUGU : INDIAN).map(regionalMovie),
      hasNext: false,
    };
  }
  const catalog = category === "rating" ? "imdbRating" : "top";
  const extras = [
    `skip=${(page - 1) * 50}`,
    ...(genre ? [`genre=${encodeURIComponent(genre)}`] : []),
  ];
  // New releases use the catalog's supported year collection, not invented language filters.
  const url =
    category === "new"
      ? `${CINEMETA}/catalog/movie/year/genre=${new Date().getUTCFullYear()}&skip=${(page - 1) * 50}.json`
      : `${CINEMETA}/catalog/movie/${catalog}/${extras.join("&")}.json`;
  const data = await json(url);
  const items = (Array.isArray(data.metas) ? data.metas : [])
    .map(normalize)
    .filter((m): m is Movie => !!m);
  // Upstream's 50-slot windows may omit unavailable items. Don't stop at 47/48 results.
  return { items, hasNext: items.length > 0 && page < 10000 };
}

export async function movieProviderInfo(
  id: string,
): Promise<{ reportedQuality?: string; available?: boolean; tmdbId?: string }> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 900 });
  if (!isMovieId(id)) return {};
  try {
    const data = await json(`https://vidsrc.sh/info/movie/${id}.json`, 3500);
    const tmdb = text(data.tmdb_id);
    const quality = text(data.quality).slice(0, 30);
    return {
      available: true,
      ...(quality ? { reportedQuality: quality } : {}),
      ...(/^\d{1,10}$/.test(tmdb) ? { tmdbId: tmdb } : {}),
    };
  } catch {
    return {};
  }
}
