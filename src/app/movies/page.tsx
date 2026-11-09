import Link from "next/link";
import { Suspense } from "react";
import { MovieBrowse } from "@/components/MovieBrowse";
import { MovieHome } from "@/components/MovieHome";
import { MovieRetry } from "@/components/MovieRetry";
import { SearchBox } from "@/components/SearchBox";
import { browseMovies, searchMovies } from "@/lib/movies";
import { MOVIE_CATEGORIES, type MovieCategory } from "@/lib/movie-types";
import MovieLoading from "./loading";
export const metadata = {
  title: "Movies",
  description:
    "Discover movies, Telugu and Indian picks, and choose a playback provider.",
};
export default function MoviesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<MovieLoading />}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
async function Content({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const category = MOVIE_CATEGORIES.some(([key]) => key === sp.category)
    ? (sp.category as MovieCategory)
    : "popular";
  const page = Math.max(1, Math.min(10000, Math.floor(Number(sp.page) || 1)));
  if (!q && !sp.category && page === 1) return <MovieHome />;
  const result = await (
    q
      ? searchMovies(q).then((r) => ({ ...r, hasNext: false }))
      : browseMovies(category, page)
  ).catch(() => null);
  if (!result)
    return (
      <div className="gutter mx-auto max-w-3xl py-16">
        <h1 className="t-large">Movies</h1>
        <p role="alert" className="t-callout mt-3 text-secondary">
          The movie catalog couldn’t load. Check your connection and retry, or
          try a search.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <MovieRetry />
          <Link
            href="/movies?category=telugu"
            prefetch={false}
            className="btn btn-gray"
          >
            Telugu picks
          </Link>
        </div>
        <div className="mt-6">
          <SearchBox large section="movies" />
        </div>
      </div>
    );
  return (
    <MovieBrowse
      key={`${q}|${category}|${page}`}
      {...result}
      q={q}
      category={category}
      page={page}
    />
  );
}
