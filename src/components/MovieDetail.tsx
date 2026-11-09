"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Movie } from "@/lib/movie-types";
import { availableProviders } from "@/lib/movie-providers";
import { useMovieHistory, useMoviePreferences } from "@/lib/movie-library";
import { MovieFacts, MoviePoster } from "./MovieLibrary";
import { CollectionPicker } from "./CollectionPicker";
import { ChevronLeft } from "./Icons";
import { MovieProviderSettings } from "./MovieProviderSettings";

const MoviePlayer = dynamic(() => import("./MoviePlayer"), {
  loading: () => (
    <div className="skeleton aspect-video rounded-2xl">
      <span role="status" className="sr-only">
        Preparing player
      </span>
    </div>
  ),
  ssr: false,
});
export function MovieDetail({
  movie,
  startWatching,
}: {
  movie: Movie;
  startWatching: boolean;
}) {
  const [watching, setWatching] = useState(startWatching),
    [info, setInfo] = useState<{
      reportedQuality?: string;
      available?: boolean;
      tmdbId?: string;
    }>({});
  const history = useMovieHistory().find(
    (h) => h.id === movie.id && !h.completed,
  );
  const prefs = useMoviePreferences();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/movies?id=${movie.id}&info=1`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setInfo)
      .catch(() => {});
    return () => controller.abort();
  }, [movie.id]);
  const resolved = useMemo(
    () =>
      !movie.tmdbId && info.tmdbId ? { ...movie, tmdbId: info.tmdbId } : movie,
    [movie, info.tmdbId],
  );
  const providerCount = availableProviders(
    resolved,
    prefs.disabledProviders,
  ).length;
  const resumeMinutes = history?.time ? Math.floor(history.time / 60) : 0;
  const watch = () => {
    setWatching(true);
    const still =
      document.documentElement.dataset.reduceMotion === "true" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      document.getElementById("movie-player")?.scrollIntoView({
        behavior: still ? "auto" : "smooth",
        block: "start",
      }),
    );
  };
  return (
    <div className="pb-12">
      <section className="relative z-10">
        {movie.background && (
          <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={movie.background}
              alt=""
              referrerPolicy="no-referrer"
              className="size-full object-cover object-[center_20%] opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/40" />
          </div>
        )}
        <div className="gutter mx-auto max-w-[1440px] pt-2 pb-6 sm:pt-4 sm:pb-10">
          <Link
            href="/movies"
            prefetch={false}
            className="t-sub -ml-1 inline-flex min-h-11 items-center gap-1 text-accent"
          >
            <ChevronLeft className="size-4" />
            Movies
          </Link>
          <div className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 sm:mt-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-10">
            <div className="sm:row-span-2">
              <MoviePoster src={movie.poster} title={movie.title} eager />
            </div>
            <div className="min-w-0 self-end sm:self-auto">
              <h1 className="display text-balance text-[26px] leading-[1.1] font-bold break-words sm:text-5xl">
                {movie.title}
              </h1>
              <MovieFacts
                className="t-footnote mt-2 sm:mt-3"
                items={[
                  movie.year,
                  movie.runtime,
                  movie.rating ? `IMDb ${movie.rating}` : "",
                  movie.country,
                ]}
              />
            </div>
            <div className="col-span-2 mt-5 min-w-0 max-w-2xl sm:col-span-1 sm:col-start-2 sm:mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={watch} className="btn btn-primary grow px-8 sm:grow-0">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden
                    className="size-4"
                    fill="currentColor"
                  >
                    <path d="M7 4.5v15a.5.5 0 0 0 .77.42l11.5-7.5a.5.5 0 0 0 0-.84L7.77 4.08A.5.5 0 0 0 7 4.5Z" />
                  </svg>
                  {history?.time
                    ? resumeMinutes
                      ? `Resume from ${resumeMinutes} min`
                      : "Resume"
                    : "Watch movie"}
                </button>
                <CollectionPicker
                  item={{
                    id: movie.id,
                    title: movie.title,
                    cover: movie.poster,
                    type: "Movie",
                    media: "movie",
                  }}
                />
              </div>
              <p className="t-sub mt-4 text-white/75">
                {movie.description ||
                  "A synopsis isn't available for this movie."}
              </p>
              {movie.genres.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {movie.genres.map((g) => (
                    <li
                      key={g}
                      className="t-caption rounded-full bg-white/10 px-2.5 py-1"
                    >
                      {g}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>
      <div className="gutter mx-auto max-w-[1440px]">
        <div id="movie-player" className="mt-6 scroll-mt-20">
          {watching ? (
            <MoviePlayer
              key={movie.id}
              movie={resolved}
              onClose={() => setWatching(false)}
            />
          ) : (
            <dl className="grid gap-4 border-y border-hairline py-4 sm:grid-cols-3 sm:gap-8">
              <div>
                <dt className="t-footnote font-semibold">Availability</dt>
                <dd className="t-footnote mt-1 text-secondary">
                  {providerCount > 0 ? (
                    <>
                      {providerCount}{" "}
                      {providerCount === 1 ? "provider" : "providers"} can try
                      this movie. Availability depends on the provider and
                      must be checked inside its player.
                    </>
                  ) : (
                    <>
                      No enabled provider can open this movie.{" "}
                      <Link href="/movies/providers" className="text-accent">
                        Open playback settings
                      </Link>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="t-footnote font-semibold">Quality</dt>
                <dd className="t-footnote mt-1 text-secondary">
                  {info.reportedQuality
                    ? `VidSrc.sh reports ${info.reportedQuality}. Actual resolution isn’t verified.`
                    : "Depends on the provider. Choose it inside the player."}
                </dd>
              </div>
              <div>
                <dt className="t-footnote font-semibold">Downloads</dt>
                <dd className="t-footnote mt-1 text-secondary">
                  Not offered. These providers only stream.
                </dd>
              </div>
            </dl>
          )}
        </div>
        {(movie.director.length > 0 || movie.cast.length > 0) && (
          <section className="mt-8 grid max-w-4xl gap-5 sm:grid-cols-[1fr_2fr]">
            <div>
              <h2 className="t-footnote font-semibold">Director</h2>
              <p className="t-sub mt-1 text-secondary">
                {movie.director.join(", ") || "Not listed"}
              </p>
            </div>
            <div>
              <h2 className="t-footnote font-semibold">Cast</h2>
              <p className="t-sub mt-1 text-secondary">
                {movie.cast.slice(0, 12).join(", ") || "Not listed"}
              </p>
            </div>
          </section>
        )}
        <details className="disclosure mt-8 border-t border-hairline pt-2">
          <summary className="t-sub font-semibold">Playback preferences</summary>
          <div className="pt-3 pb-2">
            <MovieProviderSettings compact />
            <Link
              href="/movies/providers"
              className="t-sub mt-2 inline-flex min-h-11 items-center text-accent"
            >
              Manage all providers
            </Link>
          </div>
        </details>
      </div>
    </div>
  );
}
