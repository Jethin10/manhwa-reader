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
      <div className="gutter mx-auto mb-3 flex max-w-[1440px] items-baseline justify-between">
        <h2 className="t-title2">{title}</h2>
        {href && (
          <Link href={href} className="t-callout text-accent">
            See All
          </Link>
        )}
      </div>
      <div className="relative">
        <div
          ref={ref}
          className="no-scrollbar mx-auto flex max-w-[1440px] snap-x snap-mandatory scroll-px-5 gap-3.5 overflow-x-auto overscroll-x-contain px-5 pb-2 sm:scroll-px-8 sm:gap-5 sm:px-8 xl:scroll-px-12 xl:px-12"
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

export function ShelfItem({ children, className = "w-[132px] sm:w-[164px]" }: { children: React.ReactNode; className?: string }) {
  return <div className={`shrink-0 snap-start ${className}`}>{children}</div>;
}
