"use client";

import Link from "next/link";
import { useHistory } from "@/lib/library";
import { Cover } from "./SeriesCard";
import { Shelf, ShelfItem } from "./Shelf";
import { useCollection } from "@/lib/collection";

export function ContinueReading() {
  const collection = useCollection();
  const history = useHistory().filter(
    (h) =>
      !collection.some(
        (c) =>
          c.media === "series" &&
          c.id === h.id &&
          (c.status === "completed" || c.status === "dropped"),
      ),
  );
  if (!history.length) return null;
  return (
    <Shelf title="Continue Reading" href="/bookmarks">
      {history.slice(0, 16).map((h) => (
        <ShelfItem key={h.id}>
          <Link
            href={`/series/${h.id}/chapter/${h.chapterId}`}
            className="group pressable block"
          >
            <div className="relative">
              <Cover
                cover={h.cover}
                alt={h.title}
                sizes="(min-width: 640px) 164px, 132px"
                className="aspect-[2/3]"
              />
              <div className="absolute inset-x-2.5 bottom-2.5 h-[4px] overflow-hidden rounded-full bg-black/40 backdrop-blur-sm">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${Math.round((h.progress ?? 0) * 100)}%` }}
                />
              </div>
            </div>
            <p className="t-footnote mt-2 line-clamp-1 font-medium">
              {h.title}
            </p>
            <p className="t-caption text-secondary">
              {h.chapterNumber ? `Chapter ${h.chapterNumber}` : "Continue"}
            </p>
          </Link>
        </ShelfItem>
      ))}
    </Shelf>
  );
}
