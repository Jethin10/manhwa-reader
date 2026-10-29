import { sourceOf } from "@/lib/sources";
import Link from "next/link";
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
      <StarIcon className="size-3 text-[#ffd60a]" />
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
      className={`relative overflow-hidden rounded-[12px] bg-card after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.14)] ${className}`}
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
  sizes = "(min-width: 1024px) 200px, 45vw",
}: {
  series: Series;
  stats?: Stats;
  sizes?: string;
}) {
  return (
    <Link href={`/series/${series.id}`} className="group pressable block">
      <Cover
        cover={series.cover}
        alt={series.title}
        sizes={sizes}
        className="aspect-[2/3]"
      />
      <h3 className="t-footnote mt-2 line-clamp-2 font-medium text-label">
        {series.title}
      </h3>
      <p className="t-caption mt-0.5 flex items-center gap-1.5 truncate text-secondary">
        <span>{sourceOf(series.id)}</span>
        {series.lastChapter && (
          <>
            <span className="text-tertiary">·</span>
            <span>Ch. {series.lastChapter}</span>
          </>
        )}
        {stats?.rating ? (
          <>
            <span className="text-tertiary">·</span>
            <Rating value={stats.rating} />
          </>
        ) : null}
      </p>
    </Link>
  );
}
