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
      className={`btn ${saved ? "btn-tinted" : "glass-light text-label hover:bg-white/20"}`}
    >
      <BookmarkIcon
        filled={saved}
        className="size-4"
      />
      {saved ? "In Library" : "Library"}
    </button>
  );
}
