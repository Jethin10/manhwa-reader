"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Movie, MovieCategory } from "@/lib/movie-types";
import { MOVIE_CATEGORIES } from "@/lib/movie-types";
import { MOVIE_PROVIDERS } from "@/lib/movie-providers";
import { MovieCard, ContinueMovies, MovieFacts } from "./MovieLibrary";
import { MovieRetry } from "./MovieRetry";
import { GearIcon } from "./Icons";
import { SearchBox } from "./SearchBox";

export function MovieBrowse({
  items,
  q,
  category,
  page,
  hasNext,
  partial,
}: {
  items: Movie[];
  q: string;
  category: MovieCategory;
  page: number;
  hasNext: boolean;
  partial?: boolean;
}) {
  const [genre, setGenre] = useState(""),
    [sort, setSort] = useState("catalog"),
    [limit, setLimit] = useState(30);
  const genres = [...new Set(items.flatMap((m) => m.genres))].sort();
  const shown = useMemo(
    () =>
      items
        .filter((m) => !genre || m.genres.includes(genre))
        .sort((a, b) =>
          sort === "rating"
            ? Number(b.rating || 0) - Number(a.rating || 0)
            : sort === "year"
              ? parseInt(b.year || "0") - parseInt(a.year || "0")
              : sort === "title"
                ? a.title.localeCompare(b.title)
                : 0,
        ),
    [items, genre, sort],
  );
  const featured = !q && page === 1 ? items[0] : null;
  // The featured movie opens the page; don't repeat it as the first poster.
  const grid =
    featured && !genre && sort === "catalog" ? shown.slice(1) : shown;
  const categoryLabel = MOVIE_CATEGORIES.find(([key]) => key === category)?.[1];
  const query = (nextPage: number) =>
    `/movies?${new URLSearchParams({ category, ...(q ? { q } : {}), page: String(nextPage) })}`;
  return (
    <div className="pb-12">
      {/* z-10 keeps search suggestions above the posters that follow. */}
      <section className="relative z-10">
        {featured?.background && (
          <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={featured.background}
              alt=""
              fetchPriority="high"
              referrerPolicy="no-referrer"
              className="size-full object-cover object-[center_20%] opacity-55"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30 lg:bg-gradient-to-r lg:via-black/70 lg:to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent" />
          </div>
        )}
        <div className="gutter mx-auto max-w-[1440px] pt-5 pb-6 sm:pt-8 lg:pb-12">
          <div className="flex items-center justify-between gap-3">
            <h1 className="t-large">Movies</h1>
            <Link
              href="/movies/providers"
              aria-label="Playback settings"
              className="btn glass-light shrink-0 px-4 text-[14px] font-medium"
            >
              <GearIcon className="size-4" />
              Playback<span className="-ml-1 hidden sm:inline">settings</span>
            </Link>
          </div>
          {/* The header carries this same search from the lg breakpoint up. */}
          <div className="mt-4 max-w-xl lg:hidden">
            <SearchBox large section="movies" />
          </div>
          {featured && (
            <div className="mt-20 max-w-2xl sm:mt-28 lg:mt-40">
              <h2 className="display text-balance text-4xl leading-[1.05] font-bold sm:text-6xl">
                {featured.title}
              </h2>
              <MovieFacts
                className="t-footnote mt-3"
                items={[
                  featured.year,
                  featured.rating ? `IMDb ${featured.rating}` : "",
                  featured.runtime,
                ]}
              />
              {featured.description && (
                <p className="t-sub mt-3 line-clamp-2 max-w-xl text-white/75 sm:line-clamp-3">
                  {featured.description}
                </p>
              )}
              <Link
                href={`/movies/${featured.id}`}
                prefetch={false}
                className="btn btn-primary mt-5"
              >
                View movie
              </Link>
            </div>
          )}
        </div>
      </section>
      <div className="gutter mx-auto max-w-[1440px]">
        <ContinueMovies />
        <nav
          aria-label="Movie categories"
          className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 py-1 sm:mx-0 sm:px-0"
        >
          {MOVIE_CATEGORIES.map(([key, label]) => (
            <Link
              key={key}
              href={`/movies?category=${key}`}
              prefetch={false}
              aria-current={!q && category === key ? "page" : undefined}
              className="chip"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 className="t-title2 break-words">
              {q ? `Results for “${q}”` : categoryLabel}
            </h2>
            <p className="t-footnote mt-1 text-secondary">
              {q
                ? `${items.length} ${items.length === 1 ? "match" : "matches"}`
                : category === "telugu" || category === "indian"
                  ? "A curated starting point. Search by title for more movies."
                  : page > 1
                    ? `Page ${page}`
                    : "Availability varies by provider and title."}
            </p>
          </div>
          {items.length > 1 && (
            <div className="flex w-full gap-2 sm:w-auto">
              {genres.length > 1 && (
                <select
                  aria-label="Filter movie results by genre"
                  value={genre}
                  onChange={(e) => {
                    setGenre(e.target.value);
                    setLimit(30);
                  }}
                  className="field w-1/2 sm:w-44"
                >
                  <option value="">All genres</option>
                  {genres.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              )}
              <select
                aria-label="Sort movies"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="field w-1/2 sm:w-44"
              >
                <option value="catalog">Catalog order</option>
                <option value="rating">Highest rated</option>
                <option value="year">Newest first</option>
                <option value="title">Title A–Z</option>
              </select>
            </div>
          )}
        </div>
        {partial && (
          <div
            role="status"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-fill px-4 py-3"
          >
            <p className="t-footnote min-w-0 flex-1 basis-56 text-secondary">
              One search catalog didn’t respond. These matches come from the
              catalog that did.
            </p>
            <MovieRetry quiet />
          </div>
        )}
        {items.length > 0 && !shown.length ? (
          <div className="py-14 text-center">
            <h3 className="t-title3">No {genre} movies in these results</h3>
            <button onClick={() => setGenre("")} className="btn btn-gray mt-5">
              Show all genres
            </button>
          </div>
        ) : (
          !items.length && (
            <div className="mx-auto max-w-md py-14 text-center">
              <h3 className="t-title3">
                {q ? `No movies found for “${q}”` : "No movies on this page"}
              </h3>
              <p className="t-sub mt-2 text-secondary">
                {q
                  ? "Try another spelling, the original title, or an IMDb ID such as tt0111161."
                  : "The catalog has nothing more to show here."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <Link href="/movies" prefetch={false} className="btn btn-gray">
                  Browse popular
                </Link>
                <Link
                  href="/movies?category=telugu"
                  prefetch={false}
                  className="btn btn-gray"
                >
                  Telugu picks
                </Link>
              </div>
            </div>
          )
        )}
        {grid.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-6">
            {grid.slice(0, limit).map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        )}
        {(limit < grid.length || page > 1 || hasNext) && (
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {limit < grid.length && (
              <button
                onClick={() => setLimit((n) => n + 30)}
                className="btn btn-gray"
              >
                Show more movies ({grid.length - limit})
              </button>
            )}
            {page > 1 && (
              <Link
                href={query(page - 1)}
                prefetch={false}
                className="btn btn-gray"
              >
                Previous page
              </Link>
            )}
            {hasNext && limit >= grid.length && (
              <Link
                href={query(page + 1)}
                prefetch={false}
                className="btn btn-gray"
              >
                Next page
              </Link>
            )}
          </div>
        )}
        <details className="disclosure mt-10 border-t border-hairline pt-2">
          <summary className="t-footnote text-secondary">
            About movie availability
          </summary>
          <p className="t-footnote max-w-2xl pb-2 text-secondary">
            Movie details come from Cinemeta and IMDb. Opening a movie matches
            its IDs against {MOVIE_PROVIDERS.length} player integrations run by
            independent services, so a listing doesn’t guarantee a playable
            copy. Quality and audio vary by provider, and these players don’t
            offer downloads.
          </p>
        </details>
      </div>
    </div>
  );
}
