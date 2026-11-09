import Link from "next/link";
import { browseMovies } from "@/lib/movies";
import { MOVIE_CATEGORIES } from "@/lib/movie-types";
import { Billboard } from "./Billboard";
import { GearIcon, SearchIcon } from "./Icons";
import { ContinueMovies, MovieCard } from "./MovieLibrary";
import { Shelf, ShelfItem } from "./Shelf";

/** The Movies tab: one feature and rows to browse, instead of a single long grid. */
export async function MovieHome() {
  const results = await Promise.all(
    MOVIE_CATEGORIES.map(([key, label]) =>
      browseMovies(key, 1)
        .then((r) => ({ key, label, items: r.items }))
        .catch(() => ({ key, label, items: [] })),
    ),
  );
  const rows = results.filter((r) => r.items.length > 0);
  const feature = rows
    .flatMap((r) => r.items)
    .find((m) => m.background && m.description);
  return (
    <div className="space-y-9 pb-12">
      {feature && (
        <Billboard
          item={{
            title: feature.title,
            image: feature.background,
            kicker: "Featured movie",
            facts: [feature.year, feature.rating && `IMDb ${feature.rating}`, feature.runtime].filter(Boolean),
            description: feature.description,
            play: `/movies/${feature.id}?watch=1`,
            info: `/movies/${feature.id}`,
          }}
        />
      )}
      <div className="gutter mx-auto flex max-w-[1440px] items-center gap-2">
        <Link href="/search?section=movies" className="btn btn-gray flex-1 justify-start gap-2 text-secondary sm:max-w-sm">
          <SearchIcon className="size-4" />
          Search movies
        </Link>
        <Link
          href="/movies/providers"
          aria-label="Playback settings"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-fill text-secondary transition hover:bg-fill-2"
        >
          <GearIcon className="size-5" />
        </Link>
      </div>
      <div className="gutter mx-auto max-w-[1440px] empty:hidden">
        <ContinueMovies />
      </div>
      {rows.map((row) => (
        <Shelf key={row.key} title={row.label} href={`/movies?category=${row.key}`}>
          {row.items.slice(0, 20).map((movie) => (
            <ShelfItem key={movie.id}>
              <MovieCard movie={movie} />
            </ShelfItem>
          ))}
        </Shelf>
      ))}
      {rows.length === 0 && (
        <p className="gutter t-callout py-20 text-center text-secondary">
          The movie catalog isn&apos;t responding. Try again in a moment.
        </p>
      )}
    </div>
  );
}
