import Link from "next/link";
import { coverSrc, coverSrcSet } from "@/lib/images";
import { StarIcon } from "./Icons";
import { RetryImg } from "./RetryImg";

export type CardMedia = "series" | "anime" | "movie";

/**
 * The poster tile used for every title in Kairo — manhwa, manga, anime and movies — so rows
 * and grids read as one catalog. Meta is a short "Kind · fact · fact" line; progress draws the
 * resume bar along the bottom of the art.
 */
export function TitleCard({
  href,
  title,
  cover,
  direct = false,
  meta = [],
  rating,
  progress,
  sizes = "(min-width: 1024px) 200px, (min-width: 640px) 164px, 40vw",
  priority,
  prefetch = false,
}: {
  href: string;
  title: string;
  /** Raw cover URL; resized through the image helpers unless `direct`. */
  cover: string | null;
  /** Use the URL as-is (movie posters come from hotlink-friendly CDNs). */
  direct?: boolean;
  meta?: (string | number | null | undefined | false)[];
  rating?: number | string | null;
  /** 0..1 */
  progress?: number;
  sizes?: string;
  priority?: boolean;
  prefetch?: boolean;
}) {
  const facts = meta.filter(Boolean).map(String);
  const score = typeof rating === "string" ? parseFloat(rating) : rating;
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className="group pressable block min-w-0"
    >
      <Poster
        title={title}
        cover={cover}
        direct={direct}
        sizes={sizes}
        priority={priority}
      >
        {progress !== undefined && (
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
            <span
              className="block h-full bg-accent"
              style={{ width: `${Math.max(3, Math.round(progress * 100))}%` }}
            />
          </span>
        )}
      </Poster>
      <h3 className="t-footnote mt-2 line-clamp-1 font-medium text-label">
        {title}
      </h3>
      {(facts.length > 0 || !!score) && (
        // One line, spaced rather than dotted; it clips at the end so the first facts always show.
        <p className="t-caption mt-0.5 flex gap-2 overflow-hidden whitespace-nowrap text-secondary">
          {facts.map((f, i) => (
            <span key={`${f}${i}`} className={i === 0 ? "text-label/75" : undefined}>
              {f}
            </span>
          ))}
          {!!score && (
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              <StarIcon className="size-[11px] text-accent" />
              {score.toFixed(1)}
            </span>
          )}
        </p>
      )}
    </Link>
  );
}

/** 2:3 artwork with the title behind it, so a missing image still says what it is. */
export function Poster({
  title,
  cover,
  direct,
  sizes,
  priority,
  className = "",
  children,
}: {
  title: string;
  cover: string | null;
  direct?: boolean;
  sizes?: string;
  priority?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const src = cover ? (direct ? cover : coverSrc(cover, 640)) : "";
  return (
    <div
      className={`relative aspect-[2/3] overflow-hidden rounded-[6px] bg-card after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_rgba(160,166,230,0.12)] ${className}`}
    >
      <span
        aria-hidden
        className="t-footnote absolute inset-0 grid place-items-center p-3 text-center font-medium text-balance text-tertiary"
      >
        {title}
      </span>
      {src && (
        <RetryImg
          src={src}
          srcSet={direct ? undefined : coverSrcSet(cover)}
          sizes={sizes}
          alt={title}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover duration-700 ease-[var(--ease-apple)] group-hover:scale-[1.04]"
        />
      )}
      {children}
    </div>
  );
}
