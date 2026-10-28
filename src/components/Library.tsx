"use client";
import Link from "next/link";
import { useState } from "react";
import {
  removeHistory,
  toggleBookmark,
  useBookmarks,
  useHistory,
} from "@/lib/library";
import {
  setCollection,
  STATUSES,
  useCollection,
  type CollectionItem,
} from "@/lib/collection";
import { removeWatch, useWatchHistory } from "./AnimeLibrary";
import { CollectionPicker } from "./CollectionPicker";
import { Cover } from "./SeriesCard";
export function Library() {
  const bookmarks = useBookmarks(),
    history = useHistory(),
    watchHistory = useWatchHistory(),
    collection = useCollection();
  const [q, setQ] = useState(""),
    [media, setMedia] = useState("all"),
    [status, setStatus] = useState("all"),
    [view, setView] = useState("grid"),
    [sort, setSort] = useState("recent"),
    [limit, setLimit] = useState(60);
  const merged = new Map<string, CollectionItem>(
    bookmarks.map((b) => [
      `series:${b.id}`,
      { ...b, media: "series", status: "planned", updatedAt: 0 },
    ]),
  );
  collection.forEach((c) => merged.set(`${c.media}:${c.id}`, c));
  const entries = [...merged.values()]
    .filter(
      (c) =>
        (media === "all" ||
          (media === "anime"
            ? c.media === "anime"
            : c.media === "series" &&
              (media === "manga"
                ? c.type.toLowerCase() === "manga"
                : c.type.toLowerCase() !== "manga"))) &&
        (status === "all" || c.status === status) &&
        c.title.toLowerCase().includes(q.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : b.updatedAt - a.updatedAt,
    );
  function base(c: CollectionItem) {
    return c.media === "anime" ? `/anime/${c.id}` : `/series/${c.id}`;
  }
  function resume(c: CollectionItem) {
    const h = history.find((h) => h.id === c.id),
      w = watchHistory.find((h) => h.anime.id === c.id);
    return c.status === "completed"
      ? base(c)
      : c.media === "anime" && w
        ? `${base(c)}?ep=${w.episodeId}&audio=${w.language}`
        : c.media === "series" && h
          ? `${base(c)}/chapter/${h.chapterId}`
          : base(c);
  }
  function remove(c: CollectionItem) {
    setCollection(c, null);
    if (c.media === "series" && bookmarks.some((b) => b.id === c.id))
      toggleBookmark(c);
  }
  return (
    <div className="pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-large">Library</h1>
          <p className="t-sub mt-1 text-secondary">
            {merged.size} saved titles on this device
          </p>
        </div>
        <Link
          href="/settings"
          className="rounded-full bg-fill px-5 py-2.5 text-sm"
        >
          Backup & preferences
        </Link>
      </div>
      <nav aria-label="Library media" className="mt-7 flex flex-wrap gap-2">
        {[
          ["all", "All"],
          ["manga", "Manga"],
          ["manhwa", "Manhwa & comics"],
          ["anime", "Anime"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={media === id}
            onClick={() => {
              setMedia(id);
              setLimit(60);
            }}
            className={`rounded-full px-4 py-2 text-sm ${media === id ? "bg-white text-black" : "bg-fill text-secondary"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          aria-label="Search library"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(60);
          }}
          placeholder="Search your titles"
          className="min-w-0 rounded-xl bg-fill px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
        <select
          aria-label="Library status filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setLimit(60);
          }}
          className="rounded-xl bg-fill px-3 py-2.5 text-sm"
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Library sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-xl bg-fill px-3 py-2.5 text-sm"
        >
          <option value="recent">Recently saved</option>
          <option value="title">Title A-Z</option>
        </select>
        <button
          onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
          className="rounded-full bg-fill px-4 py-2 text-sm"
        >
          {view === "grid" ? "List view" : "Grid view"}
        </button>
      </div>
      {entries.length ? (
        <div
          className={
            view === "grid"
              ? "mt-7 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
              : "mt-7 space-y-3"
          }
        >
          {entries.slice(0, limit).map((c) => (
            <article
              key={`${c.media}:${c.id}`}
              className={
                view === "grid"
                  ? "min-w-0"
                  : "flex items-center gap-4 rounded-xl bg-card p-3"
              }
            >
              <Link
                href={resume(c)}
                prefetch={false}
                className={view === "grid" ? "block" : "block w-16 shrink-0"}
              >
                <Cover
                  cover={c.cover}
                  alt={c.title}
                  sizes={view === "grid" ? "240px" : "64px"}
                  className="aspect-[2/3]"
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={base(c)}
                  className="mt-3 line-clamp-2 block text-sm font-semibold"
                >
                  {c.title}
                </Link>
                <p className="mt-1 text-xs text-secondary">
                  {c.media === "anime" ? "Anime" : c.type}
                </p>
                <div className="mt-3">
                  <CollectionPicker item={c} />
                </div>
                <button
                  onClick={() => remove(c)}
                  className="mt-2 text-xs text-secondary hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-7 rounded-2xl bg-card p-10 text-center">
          <p className="text-sm text-secondary">
            {merged.size
              ? "No titles match these filters."
              : "Save titles from a series or anime page to build your library."}
          </p>
          <div className="mt-5 flex justify-center gap-3 text-sm">
            <Link href="/manga" className="text-accent">
              Browse manga
            </Link>
            <Link href="/anime" className="text-accent">
              Browse anime
            </Link>
          </div>
        </div>
      )}
      {limit < entries.length && (
        <button
          onClick={() => setLimit((n) => n + 60)}
          className="mt-7 rounded-full bg-fill px-6 py-3 text-sm"
        >
          Load more titles
        </button>
      )}
      <section className="mt-12">
        <h2 className="t-title2">Recent Activity</h2>
        <div className="mt-4 overflow-hidden rounded-2xl bg-card">
          {history.slice(0, 10).map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-3 border-b border-hairline p-4"
            >
              <Link
                href={`/series/${h.id}/chapter/${h.chapterId}`}
                className="min-w-0 flex-1"
              >
                <p className="truncate text-sm">{h.title}</p>
                <p className="mt-1 text-xs text-secondary">
                  Chapter {h.chapterNumber ?? "Oneshot"} /{" "}
                  {Math.round((h.progress ?? 0) * 100)}%
                </p>
              </Link>
              <button
                aria-label={`Remove ${h.title} from reading history`}
                onClick={() => removeHistory(h.id)}
                className="text-xs text-secondary"
              >
                Remove
              </button>
            </div>
          ))}
          {watchHistory.slice(0, 10).map((w) => (
            <div
              key={w.anime.id}
              className="flex items-center gap-3 border-b border-hairline p-4"
            >
              <Link
                href={`/anime/${w.anime.id}?ep=${w.episodeId}&audio=${w.language}`}
                className="min-w-0 flex-1"
              >
                <p className="truncate text-sm">{w.anime.title}</p>
                <p className="mt-1 text-xs text-secondary">
                  Episode {w.episodeNumber} / {w.language}
                </p>
              </Link>
              <button
                aria-label={`Remove ${w.anime.title} from watching history`}
                onClick={() => removeWatch(w.anime.id)}
                className="text-xs text-secondary"
              >
                Remove
              </button>
            </div>
          ))}
          {!history.length && !watchHistory.length && (
            <p className="p-8 text-sm text-secondary">
              Your reading and watching progress will appear here.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
