"use client";

import { toggleBookmark, useBookmarks, type SavedSeries } from "@/lib/library";
import { BookmarkIcon } from "./Icons";
import { useCollection, setCollection } from "@/lib/collection";

export function BookmarkButton({ series }: { series: SavedSeries }) {
  const legacy = useBookmarks().some((b) => b.id === series.id);
  const collected = useCollection().some(
    (b) => b.id === series.id && b.media === "series",
  );
  const saved = legacy || collected;
  return (
    <button
      onClick={() => {
        if (collected) setCollection({ ...series, media: "series" }, null);
        if (legacy || !saved) toggleBookmark(series);
      }}
      aria-pressed={saved}
      className="glass-light flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold ring-1 ring-white/15 transition hover:bg-white/20 active:scale-[0.98]"
    >
      <BookmarkIcon
        filled={saved}
        className={`size-4 ${saved ? "text-accent" : ""}`}
      />
      {saved ? "In Library" : "Add to Library"}
    </button>
  );
}
