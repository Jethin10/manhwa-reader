/* eslint-disable @next/next/no-img-element -- Artwork uses the resizing proxy. */
"use client";
import Link from "next/link";
import { useState } from "react";
import type { FranchiseEntry } from "@/lib/anime";
import { coverSrc } from "@/lib/images";
export function AnimeFranchise({
  entries,
  currentId,
}: {
  entries: FranchiseEntry[];
  currentId: string;
}) {
  const [tab, setTab] = useState<FranchiseEntry["category"]>(
    entries.find((e) => e.id === currentId)?.category ?? "series",
  );
  if (entries.length < 2) return null;
  const shown = entries.filter((e) => e.category === tab);
  return (
    <section
      id="series-watch-order"
      className="mx-auto max-w-[1500px] px-4 pt-7 sm:px-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="display text-xl font-semibold">Series watch order</h2>
        <div
          role="group"
          aria-label="Franchise entries"
          className="flex gap-1 rounded-full bg-card p-1"
        >
          {(
            [
              ["series", "Main series"],
              ["movie", "Movies"],
              ["extra", "Specials & recaps"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={`rounded-full px-3 py-2 text-xs transition ${tab === value ? "bg-white text-black" : "text-secondary hover:text-white"}`}
            >
              {label}{" "}
              <span className="ml-1 opacity-60">
                {entries.filter((e) => e.category === value).length}
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-secondary">
        Linked seasons in source order. Related movies and specials are
        separate; inclusion does not mean they are all canon.
      </p>
      <div
        className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-2"
        aria-label={
          tab === "series"
            ? "Main series watch order"
            : tab === "movie"
              ? "Related movies"
              : "Related specials"
        }
      >
        {shown.length ? (
          shown.map((e, index) => (
            <Link
              key={e.id}
              href={`/anime/${e.id}`}
              prefetch={false}
              aria-current={e.id === currentId ? "page" : undefined}
              className={`flex w-[260px] shrink-0 items-center gap-3 rounded-xl p-2.5 ring-1 transition ${e.id === currentId ? "bg-accent/15 ring-accent/50" : "bg-card ring-white/[0.06] hover:bg-fill"}`}
            >
              <img
                src={coverSrc(e.cover, 160)}
                alt=""
                loading="lazy"
                className="h-[76px] w-[51px] shrink-0 rounded-md object-cover"
              />
              <div>
                <p className="text-[10px] text-secondary">
                  {tab === "series"
                    ? `Part ${index + 1}`
                    : tab === "movie"
                      ? "Movie"
                      : "Special"}
                  {e.id === currentId ? " · Selected" : ""}
                </p>
                <h3 className="mt-1 line-clamp-2 text-xs font-medium leading-5">
                  {e.title}
                </h3>
              </div>
            </Link>
          ))
        ) : (
          <p className="py-5 text-sm text-secondary">
            No entries listed in this category.
          </p>
        )}
      </div>
    </section>
  );
}
