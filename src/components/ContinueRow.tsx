"use client";

import { useCollection } from "@/lib/collection";
import {
  readKey,
  removeHistory,
  useAllRead,
  useBookmarks,
  useHistory,
} from "@/lib/library";
import { removeMovieHistory, useMovieHistory } from "@/lib/movie-library";
import { removeWatch, useWatchHistory } from "./AnimeLibrary";
import { Shelf, ShelfItem } from "./Shelf";
import { TitleCard, type CardMedia } from "./TitleCard";

type Entry = {
  key: string;
  media: CardMedia;
  at: number;
  href: string;
  title: string;
  cover: string | null;
  direct?: boolean;
  meta: string[];
  progress: number;
  remove: () => void;
};

/**
 * Everything in progress — chapters, episodes and movies — in one row, most recent first.
 * Section pages pass `media` to show only their own kind.
 */
export function ContinueRow({
  title = "Continue Watching",
  media = ["series", "anime", "movie"],
}: {
  title?: string;
  media?: CardMedia[];
}) {
  const collection = useCollection();
  const read = useAllRead();
  const reading = useHistory();
  const watching = useWatchHistory();
  const movies = useMovieHistory();
  // Titles marked completed or dropped in My List leave the row.
  const done = (kind: CardMedia, id: string) =>
    collection.some(
      (c) =>
        c.media === kind &&
        c.id === id &&
        (c.status === "completed" || c.status === "dropped"),
    );

  const entries: Entry[] = [];
  if (media.includes("series"))
    for (const h of reading) {
      if (done("series", h.id)) continue;
      // A finished chapter leads to the series, whose main button opens the next unread one.
      const finished = !!read[h.id]?.includes(
        readKey({ id: h.chapterId, number: h.chapterNumber }),
      );
      entries.push({
        key: `series:${h.id}`,
        media: "series",
        at: h.at,
        href: finished
          ? `/series/${h.id}`
          : `/series/${h.id}/chapter/${h.chapterId}`,
        title: h.title,
        cover: h.cover,
        meta: [
          finished
            ? "Next chapter"
            : h.chapterNumber
              ? `Ch. ${h.chapterNumber}`
              : "Continue",
        ],
        progress: finished ? 1 : (h.progress ?? 0),
        remove: () => removeHistory(h.id),
      });
    }
  if (media.includes("anime"))
    for (const h of watching) {
      if (done("anime", h.anime.id)) continue;
      const left =
        h.time && h.duration && h.duration - h.time > 60
          ? `${Math.ceil((h.duration - h.time) / 60)}m left`
          : "";
      entries.push({
        key: `anime:${h.anime.id}`,
        media: "anime",
        at: h.at,
        href: `/anime/${h.anime.id}?ep=${h.episodeId}&audio=${h.language}`,
        title: h.anime.title,
        cover: h.anime.cover,
        meta: [`E${h.episodeNumber}`, left].filter(Boolean),
        progress: h.time && h.duration ? Math.min(1, h.time / h.duration) : 0,
        remove: () => removeWatch(h.anime.id),
      });
    }
  if (media.includes("movie"))
    for (const m of movies) {
      if (m.completed || done("movie", m.id)) continue;
      entries.push({
        key: `movie:${m.id}`,
        media: "movie",
        at: m.at,
        href: `/movies/${m.id}?watch=1`,
        title: m.title,
        cover: m.poster,
        direct: true,
        meta: [
          m.duration
            ? `${Math.max(1, Math.round((m.duration - m.time) / 60))}m left`
            : "Movie",
        ],
        progress: m.duration ? Math.min(1, m.time / m.duration) : 0,
        remove: () => removeMovieHistory(m.id),
      });
    }
  if (!entries.length) return null;
  entries.sort((a, b) => b.at - a.at);

  return (
    <Shelf title={title}>
      {entries.slice(0, 20).map((e) => (
        <ShelfItem key={e.key}>
          <div className="group/card relative">
            <TitleCard
              href={e.href}
              title={e.title}
              cover={e.cover}
              direct={e.direct}
              meta={e.meta}
              progress={e.progress}
            />
            <button
              type="button"
              onClick={e.remove}
              aria-label={`Remove ${e.title} from Continue Watching`}
              className="absolute top-0 right-0 grid size-11 place-items-center opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 focus-visible:opacity-100"
            >
              <span className="grid size-7 place-items-center rounded-full bg-black/70 text-white ring-1 ring-white/15 backdrop-blur">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </span>
            </button>
          </div>
        </ShelfItem>
      ))}
    </Shelf>
  );
}

/** Saved titles, newest first, as a row (Home's "My List"). */
export function MyListRow({
  media = ["series", "anime", "movie"],
}: {
  media?: CardMedia[];
}) {
  const collection = useCollection();
  const bookmarks = useBookmarks();
  // Series saved by older builds live in the bookmark list.
  const legacy = bookmarks
    .filter((b) => !collection.some((c) => c.media === "series" && c.id === b.id))
    .map((b) => ({ ...b, media: "series" as const, status: "planned" }));
  const list = [...collection, ...legacy].filter(
    (c) => media.includes(c.media) && c.status !== "dropped" && c.status !== "completed",
  );
  if (!list.length) return null;
  return (
    <Shelf title="My List" href="/bookmarks">
      {list.slice(0, 20).map((c) => (
        <ShelfItem key={`${c.media}:${c.id}`}>
          <TitleCard
            href={
              c.media === "movie"
                ? `/movies/${c.id}`
                : c.media === "anime"
                  ? `/anime/${c.id}`
                  : `/series/${c.id}`
            }
            title={c.title}
            cover={c.cover}
            direct={c.media === "movie"}
            meta={[c.type]}
          />
        </ShelfItem>
      ))}
    </Shelf>
  );
}
