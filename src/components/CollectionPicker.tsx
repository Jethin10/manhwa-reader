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
      className="max-w-full rounded-xl bg-fill px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent"
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
  );
}
