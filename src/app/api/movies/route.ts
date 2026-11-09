import {
  browseMovies,
  getMovie,
  movieProviderInfo,
  searchMovies,
} from "@/lib/movies";
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
