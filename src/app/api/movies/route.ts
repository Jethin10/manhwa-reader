import {
  browseMovies,
  getMovie,
  movieProviderInfo,
  searchMovies,
} from "@/lib/movies";
import { movieCopies, reportCopy } from "@/lib/movie-copies";
import { MOVIE_PROVIDERS } from "@/lib/movie-providers";
import {
  isMovieId,
  MOVIE_CATEGORIES,
  type MovieCategory,
} from "@/lib/movie-types";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  try {
    const id = sp.get("id");
    if (id) {
      if (!isMovieId(id))
        return Response.json({ error: "Invalid movie ID." }, { status: 400 });
      if (sp.get("copies") === "1")
        return Response.json(await movieCopies(id), {
          // Short: a viewer's report should reach other devices quickly.
          headers: { "Cache-Control": "public, max-age=30" },
        });
      const result =
        sp.get("info") === "1"
          ? await movieProviderInfo(id)
          : { movie: await getMovie(id) };
      return Response.json(result, {
        headers: {
          "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        },
      });
    }
    const q = (sp.get("q") ?? "").trim().slice(0, 100);
    const category = MOVIE_CATEGORIES.some(
      ([key]) => key === sp.get("category"),
    )
      ? (sp.get("category") as MovieCategory)
      : "popular";
    const page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(sp.get("page")) || 1)),
    );
    const result = q
      ? await searchMovies(q)
      : await browseMovies(category, page);
    return Response.json(result, {
      headers: {
        "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
      },
    });
  } catch {
    return Response.json(
      { error: "Movie catalog isn't responding. Try again shortly." },
      { status: 502 },
    );
  }
}

/** A viewer's report about which copy a source played: { movie, provider, verdict }. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid report." }, { status: 400 });
  }
  const movie = String(body.movie ?? "");
  const provider = String(body.provider ?? "");
  const verdict = body.verdict;
  const height = Number(body.height);
  if (
    !isMovieId(movie) ||
    !MOVIE_PROVIDERS.some((p) => p.id === provider) ||
    (verdict !== "camera" && verdict !== "ok" && verdict !== "quality") ||
    (verdict === "quality" &&
      !(Number.isInteger(height) && height >= 144 && height <= 4320))
  )
    return Response.json({ error: "Invalid report." }, { status: 400 });
  try {
    await reportCopy(movie, provider, verdict, verdict === "quality" ? height : undefined);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Couldn't save the report. Try again shortly." },
      { status: 502 },
    );
  }
}
