"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "./Icons";

/** Horizontally scrolling row with snap and hover arrows, like the Apple TV / Books shelves. */
export function Shelf({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="group/shelf relative">
      <div className="gutter mx-auto mb-2.5 flex max-w-[2560px] items-baseline justify-between gap-4">
        {href ? (
          <Link
            href={href}
            prefetch={false}
            className="group/title inline-flex min-h-11 items-center gap-1"
          >
            <h2 className="t-title3 sm:t-title2">{title}</h2>
          </Link>
        ) : (
          <h2 className="t-title3 flex min-h-11 items-center sm:t-title2">{title}</h2>
        )}
        {href && (
          <Link
            href={href}
            prefetch={false}
            tabIndex={-1}
            className="t-footnote inline-flex shrink-0 items-center gap-0.5 font-medium text-secondary transition-colors hover:text-label"
          >
            See all
            <ChevronRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="relative">
        <div
          ref={ref}
          className="gutter no-scrollbar mx-auto flex max-w-[2560px] snap-x snap-mandatory scroll-px-[var(--gutter)] gap-2.5 overflow-x-auto overscroll-x-contain pb-2 sm:gap-3.5 2xl:gap-4"
        >
          {children}
        </div>
        <ShelfArrow side="left" onClick={() => page(-1)} />
        <ShelfArrow side="right" onClick={() => page(1)} />
      </div>
    </section>
  );
}

function ShelfArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      onClick={onClick}
      className={`glass absolute top-[38%] z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full text-label opacity-0 shadow-lg ring-1 ring-white/10 transition-opacity duration-300 group-hover/shelf:opacity-100 hover:bg-white/20 md:grid ${
        side === "left" ? "left-3" : "right-3"
      }`}
    >
      {side === "left" ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </button>
  );
}

export function ShelfItem({ children, className = "w-[30vw] max-w-[148px] sm:w-[164px] sm:max-w-none xl:w-[176px] 2xl:w-[196px] min-[1800px]:w-[216px]" }: { children: React.ReactNode; className?: string }) {
  return <div className={`shrink-0 snap-start ${className}`}>{children}</div>;
}
