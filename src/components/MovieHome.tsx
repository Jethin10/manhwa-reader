import { Fragment } from "react";
import { browseMovies } from "@/lib/movies";
import { MOVIE_CATEGORIES } from "@/lib/movie-types";
import { Billboard } from "./Billboard";
import { ContinueRow } from "./ContinueRow";
import { MovieCard } from "./MovieLibrary";
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
    <div className="pb-12">
      {feature && (
        <Billboard
          item={{
            title: feature.title,
            image: feature.background,
            kicker: "Tonight’s pick",
            facts: [feature.year, feature.rating && `IMDb ${feature.rating}`, feature.runtime].filter(Boolean),
            description: feature.description,
            play: `/movies/${feature.id}?watch=1`,
            info: `/movies/${feature.id}`,
            save: {
              id: feature.id,
              media: "movie",
              title: feature.title,
              cover: feature.poster,
              type: "Movie",
            },
          }}
        />
      )}
      <div className="after-billboard mt-8 space-y-8 lg:space-y-10">
        {rows.length === 0 && <ContinueRow media={["movie"]} />}
        {rows.map((row, i) => (
          <Fragment key={row.key}>
            <Shelf title={row.label} href={`/movies?category=${row.key}`}>
              {row.items.slice(0, 20).map((movie) => (
                <ShelfItem key={movie.id}>
                  <MovieCard movie={movie} />
                </ShelfItem>
              ))}
            </Shelf>
            {i === 0 && <ContinueRow media={["movie"]} />}
          </Fragment>
        ))}
        {rows.length === 0 && (
          <p className="gutter t-callout py-20 text-center text-secondary">
            The movie catalog isn&apos;t responding. Try again in a moment.
          </p>
        )}
      </div>
    </div>
  );
}
