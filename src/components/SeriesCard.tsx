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
      className={`relative overflow-hidden rounded-[10px] bg-card shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-white/[0.08] after:ring-inset ${className}`}
    >
      {cover && (
        <RetryImg
          src={coverSrc(cover, 640)}
          srcSet={coverSrcSet(cover)}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 size-full object-cover ease-[var(--ease-apple)] group-hover:scale-[1.04]"
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
    <Link
      href={`/series/${series.id}`}
      prefetch={!series.id.startsWith("comix~")}
      className="group block"
    >
      <Cover
        cover={series.cover}
        alt={series.title}
        sizes={sizes}
        className="aspect-[2/3]"
      />
      <h3 className="mt-2.5 line-clamp-2 text-[13px] leading-snug font-medium text-label">
        {series.title}
      </h3>
      <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-secondary">
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
