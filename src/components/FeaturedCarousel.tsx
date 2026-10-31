"use client";

import { useHistory } from "@/lib/library";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Series, Stats } from "@/lib/catalog";
import { coverSrc, coverSrcSet } from "@/lib/images";
import { cap, cleanDescription } from "@/lib/format";
import { ChevronLeft, ChevronRight } from "./Icons";
import { Rating } from "./SeriesCard";

const INTERVAL = 7000;

/** Swipeable feature cards: native scroll-snap on touch, arrows and autoplay on desktop. */
export function FeaturedCarousel({ items, stats }: { items: Series[]; stats: Record<string, Stats> }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = items.length;

  const go = useCallback((idx: number) => {
    const el = track.current;
    const card = el?.children[idx] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).paddingLeft), behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) setI([...el.children].indexOf(e.target as HTMLElement));
      },
      { root: el, threshold: 0.6 },
    );
    [...el.children].forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [n]);

  useEffect(() => {
    if (paused || n < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => go((i + 1) % n), INTERVAL);
    return () => clearTimeout(t);
  }, [paused, n, i, go]);

  if (!n) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="group/hero relative mx-auto max-w-[1440px] pt-3 lg:pt-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onFocus={() => setPaused(true)}
    >
      <div
        ref={track}
        className="no-scrollbar flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto overscroll-x-contain px-5 sm:scroll-px-8 sm:gap-4 sm:px-8 xl:scroll-px-12 xl:px-12"
      >
        {items.map((s, idx) => (
          <FeatureCard key={s.id} series={s} stats={stats[s.id]} priority={idx === 0} />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2" role="tablist" aria-label="Featured titles">
        {items.map((it, idx) => (
          <button
            key={it.id}
            role="tab"
            aria-selected={idx === i}
            aria-label={`Show ${it.title}`}
            onClick={() => go(idx)}
            className={`h-[6px] rounded-full transition-all duration-500 ease-[var(--ease-apple)] ${
              idx === i ? "w-5 bg-label" : "w-[6px] bg-white/25 hover:bg-white/50"
            }`}
          />
        ))}
      </div>

      {n > 1 && (
        <>
          <HeroArrow side="left" onClick={() => go((i - 1 + n) % n)} />
          <HeroArrow side="right" onClick={() => go((i + 1) % n)} />
        </>
      )}
    </section>
  );
}

function FeatureCard({ series: s, stats, priority }: { series: Series; stats?: Stats; priority: boolean }) {
  const genres = s.tags.filter((t) => t.group === "genre").slice(0, 2);
  return (
    <article className="relative isolate w-full shrink-0 snap-start overflow-hidden rounded-[22px] bg-card shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] sm:rounded-[26px]">
      {/* Mobile: the artwork is the card. Desktop: blurred backdrop with the poster beside the copy. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverSrc(s.cover, 960)}
        srcSet={coverSrcSet(s.cover, [640, 960, 1280])}
        sizes="(min-width: 768px) 30vw, 100vw"
        alt=""
        aria-hidden
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className="absolute inset-0 -z-10 size-full object-cover md:scale-125 md:blur-[70px] md:saturate-150"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/55 to-transparent md:bg-gradient-to-r md:from-black/90 md:via-black/60 md:to-black/10" />

      <div className="flex min-h-[min(118vw,520px)] flex-col justify-end p-5 sm:p-8 md:min-h-[440px] md:flex-row md:items-center md:justify-between md:gap-12 md:p-12 lg:min-h-[480px] lg:p-14">
        <div className="max-w-[560px] min-w-0">
          <p className="t-eyebrow text-white/70">Featured {s.type}</p>
          <h2 className="text-balance mt-2 line-clamp-2 font-[family-name:var(--font-display)] text-[30px] leading-[1.06] font-bold tracking-[-0.025em] sm:text-[44px] lg:text-[56px]">
            {s.title}
          </h2>
          <p className="t-footnote mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-white/75">
            {stats?.rating ? (
              <>
                <Rating value={stats.rating} className="text-white" />
                <span className="text-white/40">·</span>
              </>
            ) : null}
            <span>{cap(s.status)}</span>
            {genres.map((g) => (
              <span key={g.id} className="contents">
                <span className="text-white/40">·</span>
                <span>{g.name}</span>
              </span>
            ))}
          </p>
          <p className="t-sub mt-3 hidden max-w-[520px] text-white/75 sm:line-clamp-2 md:line-clamp-3">
            {cleanDescription(s.description)}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <ReadNow id={s.id} />
            <Link href={`/series/${s.id}`} className="btn glass-light text-white">
              Details
            </Link>
          </div>
        </div>
        <Link href={`/series/${s.id}`} className="hidden shrink-0 md:block" tabIndex={-1} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc(s.cover, 640)}
            srcSet={coverSrcSet(s.cover, [640, 960])}
            sizes="280px"
            alt=""
            loading={priority ? "eager" : "lazy"}
            className="aspect-[2/3] w-[230px] rounded-[16px] object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-[0.5px] ring-white/15 lg:w-[270px]"
          />
        </Link>
      </div>
    </article>
  );
}

function HeroArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      aria-label={side === "left" ? "Previous" : "Next"}
      onClick={onClick}
      className={`glass absolute top-[calc(50%-12px)] z-10 hidden size-11 -translate-y-1/2 place-items-center rounded-full opacity-0 shadow-lg ring-[0.5px] ring-white/15 transition-opacity duration-300 group-hover/hero:opacity-100 hover:bg-white/20 md:grid ${
        side === "left" ? "left-4 xl:left-6" : "right-4 xl:right-6"
      }`}
    >
      {side === "left" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );
}

/** Continue where you left off, or start from the first chapter. */
function ReadNow({ id }: { id: string }) {
  const last = useHistory().find((h) => h.id === id);
  return (
    <Link
      href={last ? `/series/${id}/chapter/${last.chapterId}` : `/series/${id}/start`}
      prefetch={false}
      className="btn btn-primary px-7"
    >
      {last ? `Continue${last.chapterNumber ? ` Ch. ${last.chapterNumber}` : ""}` : "Start Reading"}
    </Link>
  );
}
