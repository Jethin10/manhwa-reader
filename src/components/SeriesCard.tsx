import { TitleCard } from "./TitleCard";
import type { Series, Stats } from "@/lib/catalog";
import { coverSrc, coverSrcSet } from "@/lib/images";
import { StarIcon } from "./Icons";
import { RetryImg } from "./RetryImg";

export function Rating({
  value,
  className = "",
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 tabular-nums ${className}`}
    >
      <StarIcon className="size-3 text-accent" />
      {value.toFixed(1)}
    </span>
  );
}

/** Artwork tile: rounded, hairline-edged, served from the full-res original at the right size. */
export function Cover({
  cover,
  alt,
  sizes = "200px",
  className = "",
  priority,
}: {
  cover: string | null;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[6px] bg-card after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.14)] ${className}`}
    >
      {cover && (
        <RetryImg
          src={coverSrc(cover, 640)}
          srcSet={coverSrcSet(cover)}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 size-full object-cover duration-700 ease-[var(--ease-apple)] group-hover:scale-[1.03]"
        />
      )}
    </div>
  );
}

export function SeriesCard({
  series,
  stats,
  sizes,
}: {
  series: Series;
  stats?: Stats;
  sizes?: string;
}) {
  return (
    <TitleCard
      href={`/series/${series.id}`}
      title={series.title}
      cover={series.cover}
      sizes={sizes}
      prefetch={undefined}
      meta={[
        series.type && series.type.charAt(0).toUpperCase() + series.type.slice(1),
        series.lastChapter && `Ch. ${series.lastChapter}`,
      ]}
      rating={stats?.rating ?? series.stats?.rating}
    />
  );
}
