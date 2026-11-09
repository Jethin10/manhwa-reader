"use client";
import Link from "next/link";
import { useState } from "react";
import { useMovieHistory, removeMovieHistory } from "@/lib/movie-library";
import type { Movie } from "@/lib/movie-types";

/** Facts in a row: separated by space, so they wrap cleanly on narrow screens. */
export function MovieFacts({
  items,
  className = "",
}: {
  items: (string | undefined)[];
  className?: string;
}) {
  const facts = items.filter(Boolean);
  if (!facts.length) return null;
  return (
    <ul className={`flex flex-wrap gap-x-3 text-secondary ${className}`}>
      {facts.map((fact) => (
        <li key={fact}>{fact}</li>
      ))}
    </ul>
  );
}

export function MoviePoster({
  src,
  title,
  eager = false,
}: {
  src: string;
  title: string;
  eager?: boolean;
}) {
  const [broken, setBroken] = useState("");
  return (
    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-card">
      {src && broken !== src /* eslint-disable-next-line @next/next/no-img-element */ ? (
        <img
          src={src}
          alt={title}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setBroken(src)}
        />
      ) : (
        <span className="grid size-full place-items-center p-3 text-center text-sm text-secondary">
          {title}
        </span>
      )}
    </div>
  );
}
export function MovieCard({ movie }: { movie: Movie }) {
  return (
    <article className="min-w-0">
      <Link
        href={`/movies/${movie.id}`}
        prefetch={false}
        className="pressable block rounded-xl"
        aria-label={`${movie.title}${movie.year ? ` (${movie.year})` : ""}`}
      >
        <MoviePoster src={movie.poster} title={movie.title} />
        <h3 className="t-sub mt-2.5 line-clamp-2 font-semibold">
          {movie.title}
        </h3>
        <MovieFacts
          className="t-caption mt-1"
          items={[movie.year, movie.rating ? `IMDb ${movie.rating}` : ""]}
        />
      </Link>
    </article>
  );
}
export function ContinueMovies() {
  const history = useMovieHistory().filter((h) => !h.completed);
  if (!history.length) return null;
  return (
    <section className="mt-8" aria-label="Continue movies">
      <h2 className="t-title2">Continue watching</h2>
      <div className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5 py-1 sm:mx-0 sm:gap-4 sm:px-0">
        {history.slice(0, 12).map((m) => (
          <article key={m.id} className="relative w-32 shrink-0 sm:w-40">
            <Link
              href={`/movies/${m.id}?watch=1`}
              prefetch={false}
              className="pressable block rounded-xl"
            >
              <MoviePoster src={m.poster} title={m.title} />
              <p className="t-footnote mt-2 truncate font-medium">{m.title}</p>
              {m.duration > 0 && (
                <progress
                  value={m.time}
                  max={m.duration}
                  aria-label={`${m.title} progress`}
                  className="meter mt-1.5"
                />
              )}
              <p className="t-caption mt-1.5 text-secondary">
                {m.duration
                  ? `${Math.floor(m.time / 60)} of ${Math.round(m.duration / 60)} min`
                  : "Open player"}
              </p>
            </Link>
            <button
              className="absolute top-0 right-0 grid size-11 place-items-center"
              onClick={() => removeMovieHistory(m.id)}
              aria-label={`Remove ${m.title} from movie history`}
            >
              <span className="grid size-7 place-items-center rounded-full bg-black/75 text-white">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
