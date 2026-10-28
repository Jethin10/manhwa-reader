"use client";
import {
  setCollection,
  STATUSES,
  useCollection,
  type CollectionItem,
  type CollectionStatus,
} from "@/lib/collection";
import { toggleBookmark, useBookmarks } from "@/lib/library";
export function CollectionPicker({
  item,
}: {
  item: Omit<CollectionItem, "status" | "updatedAt">;
}) {
  const saved = useCollection().find(
    (x) => x.id === item.id && x.media === item.media,
  );
  const legacy = useBookmarks().some(
    (x) => item.media === "series" && x.id === item.id,
  );
  return (
    <span className="relative inline-flex">
    <select
      aria-label={
        item.media === "anime" ? "Watchlist status" : "Reading status"
      }
      value={saved?.status ?? (legacy ? "planned" : "")}
      onChange={(e) => {
        setCollection(
          item,
          e.target.value ? (e.target.value as CollectionStatus) : null,
        );
        if (!e.target.value && legacy) toggleBookmark(item);
      }}
      className="glass-light h-11 max-w-full cursor-pointer appearance-none rounded-full pr-9 pl-4 text-[15px] font-semibold text-label outline-none hover:bg-white/20"
    >
      <option value="">
        {saved || legacy
          ? "Remove from list"
          : item.media === "anime"
            ? "Add to watchlist"
            : "Reading status"}
      </option>
      {STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-3.5 -translate-y-1/2 text-secondary">
        <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
