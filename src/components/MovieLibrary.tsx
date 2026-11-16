"use client";
import { useState } from "react";
import type { Movie } from "@/lib/movie-types";
import { TitleCard } from "./TitleCard";

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
    <TitleCard
      href={`/movies/${movie.id}`}
      title={movie.title}
      cover={movie.poster}
      direct
      meta={["Movie", movie.year]}
      rating={movie.rating}
    />
  );
}
