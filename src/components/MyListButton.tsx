"use client";

import {
  setCollection,
  STATUSES,
  useCollection,
  type CollectionItem,
  type CollectionStatus,
} from "@/lib/collection";
import { toggleBookmark, useBookmarks } from "@/lib/library";
import { toast } from "@/lib/toast";
import { CheckIcon, PlusIcon } from "./Icons";

type Item = Omit<CollectionItem, "status" | "updatedAt">;

/**
 * The one save control for every title: "+ My List" adds it, and once saved a status menu
 * (plan / in progress / completed…) sits beside it. Same everywhere: hero, title pages, player.
 */
export function MyListButton({
  item,
  showStatus = true,
}: {
  item: Item;
  showStatus?: boolean;
}) {
  const saved = useCollection().find(
    (x) => x.id === item.id && x.media === item.media,
  );
  // Series saved by older builds live in the bookmark list.
  const legacy = useBookmarks().some(
    (b) => item.media === "series" && b.id === item.id,
  );
  const on = !!saved || legacy;
  const status = saved?.status ?? (legacy ? "planned" : "");

  const remove = () => {
    setCollection(item, null);
    if (legacy) toggleBookmark(item);
  };
  const toggle = () => {
    if (on) {
      remove();
      toast("Removed from My List", {
        action: { label: "Undo", run: () => setCollection(item, status || "planned") },
      });
    } else {
      setCollection(item, "planned");
      toast("Added to My List", { action: { label: "View", href: "/bookmarks" } });
    }
  };

  return (
    <span className="inline-flex max-w-full flex-wrap gap-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        className="btn glass-light text-label hover:bg-white/20"
      >
        {on ? (
          <CheckIcon className="size-4 text-accent" />
        ) : (
          <PlusIcon className="size-4" />
        )}
        My List
      </button>
      {on && showStatus && (
        <span className="relative inline-flex">
          <select
            aria-label="List status"
            value={status}
            onChange={(e) =>
              setCollection(item, e.target.value as CollectionStatus)
            }
            className="glass-light h-11 max-w-full cursor-pointer appearance-none rounded-full pr-9 pl-4 text-[15px] font-medium text-label outline-none hover:bg-white/20"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3.5 size-3.5 -translate-y-1/2 text-secondary"
          >
            <path d="m7 10 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </span>
  );
}
