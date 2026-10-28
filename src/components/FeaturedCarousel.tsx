"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Series, Stats } from "@/lib/catalog";
import { coverSrc, coverSrcSet } from "@/lib/images";
import { cap, cleanDescription } from "@/lib/format";
import { ChevronLeft, ChevronRight } from "./Icons";
import { Rating } from "./SeriesCard";

const INTERVAL = 7000;

export function FeaturedCarousel({ items, stats }: { items: Series[]; stats: Record<string, Stats> }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = items.length;

  useEffect(() => {
    if (paused || n < 2) return;
    const t = setTimeout(() => setI((x) => (x + 1) % n), INTERVAL);
    return () => clearTimeout(t);
  }, [paused, n, i]);

  if (!n) return null;
  const s = items[i];
  const genres = s.tags.filter((t) => t.group === "genre").slice(0, 3);

  return (
    <section
      className="relative isolate overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Backdrops crossfade */}
      {items.map((it, idx) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={it.id}
          src={coverSrc(it.cover, 640)}
          alt=""
          aria-hidden
          className={`absolute inset-0 -z-10 size-full scale-125 object-cover blur-[60px] saturate-150 transition-opacity duration-[1200ms] ease-[var(--ease-apple)] ${
            idx === i ? "opacity-60" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/70 to-black/10" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-black to-transparent" />

      <div className="mx-auto flex max-w-[1400px] flex-col-reverse items-start gap-7 px-5 pt-8 pb-16 sm:px-8 md:min-h-[600px] md:flex-row md:items-center md:gap-12 md:pt-10">
        <div key={s.id} className="animate-in w-full min-w-0 flex-1">
          <p className="text-[12px] font-semibold tracking-[0.12em] text-accent uppercase">Featured {s.type}</p>
          <h1 className="display text-balance mt-3 line-clamp-2 text-[40px] leading-[1.05] font-bold sm:text-[56px] lg:text-[64px]">
            {s.title}
          </h1>
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-secondary">
            <Rating value={stats[s.id]?.rating} className="text-label" />
            {stats[s.id]?.rating ? <span className="text-tertiary">·</span> : null}
            <span>{cap(s.status)}</span>
            {genres.map((g) => (
              <span key={g.id} className="contents">
                <span className="text-tertiary">·</span>
                <span>{g.name}</span>
              </span>
            ))}
          </p>
          <p className="mt-5 line-clamp-3 max-w-[560px] text-[15px] leading-relaxed text-label/80">
            {cleanDescription(s.description) || "No synopsis available."}
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              href={`/series/${s.id}`}
              className="rounded-full bg-white px-7 py-3 text-[15px] font-semibold text-black transition hover:bg-white/85 active:scale-[0.98]"
            >
              Read Now
            </Link>
            <Link
              href={`/series/${s.id}`}
              className="glass-light rounded-full px-6 py-3 text-[15px] font-semibold text-label ring-1 ring-white/15 transition hover:bg-white/20"
            >
              Details
            </Link>
          </div>
        </div>

        <Link
          key={`poster-${s.id}`}
          href={`/series/${s.id}`}
          className="animate-in relative block w-[150px] shrink-0 md:w-[280px] lg:w-[320px]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc(s.cover, 960)}
            srcSet={coverSrcSet(s.cover, [640, 960])}
            sizes="320px"
            alt={s.title}
            className="aspect-[2/3] w-full rounded-[14px] object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10"
          />
        </Link>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-6 mx-auto flex max-w-[1400px] items-center gap-4 px-5 sm:px-8">
        <div className="flex items-center gap-1.5">
          {items.map((it, idx) => (
            <button
              key={it.id}
              aria-label={`Show ${it.title}`}
              onClick={() => setI(idx)}
              className={`relative h-[5px] overflow-hidden rounded-full bg-white/25 transition-all duration-500 ease-[var(--ease-apple)] ${
                idx === i ? "w-8" : "w-[5px] hover:bg-white/50"
              }`}
            >
              {idx === i && (
                <span
                  key={`${i}-${paused}`}
                  className="absolute inset-y-0 left-0 rounded-full bg-white"
                  style={{ animation: paused ? "none" : `hero-progress ${INTERVAL}ms linear forwards`, width: paused ? "100%" : undefined }}
                />
              )}
            </button>
          ))}
        </div>
        <div className="ml-auto hidden gap-2 sm:flex">
          <button
            aria-label="Previous"
            onClick={() => setI((i - 1 + n) % n)}
            className="glass-light grid size-9 place-items-center rounded-full ring-1 ring-white/10 transition hover:bg-white/20"
          >
            <ChevronLeft />
          </button>
          <button
            aria-label="Next"
            onClick={() => setI((i + 1) % n)}
            className="glass-light grid size-9 place-items-center rounded-full ring-1 ring-white/10 transition hover:bg-white/20"
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <style>{`@keyframes hero-progress { from { width: 0 } to { width: 100% } }`}</style>
    </section>
  );
}
