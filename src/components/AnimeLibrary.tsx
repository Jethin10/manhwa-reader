/* eslint-disable @next/next/no-img-element -- Images use the shared resizing proxy. */
"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { Anime } from "@/lib/anime";
import { coverSrc } from "@/lib/images";
import { useCollection } from "@/lib/collection";
import { Cover } from "./SeriesCard";
import { Shelf, ShelfItem } from "./Shelf";
import { PlayIcon } from "./Icons";
export type WatchEntry = {
  anime: Anime;
  episodeId: string;
  episodeNumber: number;
  language: "sub" | "dub";
  at: number;
  time?: number;
  duration?: number;
};
const KEY = "mr:watch-history",
  EVENT = "mr:watch";
const empty: WatchEntry[] = [];
let memo: WatchEntry[] | undefined;
function snapshot() {
  if (!memo) {
    try {
      memo = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    } catch {
      memo = [];
    }
  }
  return memo ?? empty;
}
function subscribe(cb: () => void) {
  const fn = () => {
    memo = undefined;
    cb();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
export function saveWatch(entry: Omit<WatchEntry, "at">) {
  try {
    const previous = snapshot().find(
      (x) => x.anime.id === entry.anime.id && x.episodeId === entry.episodeId,
    );
    const all = snapshot().filter((x) => x.anime.id !== entry.anime.id);
    localStorage.setItem(
      KEY,
      JSON.stringify(
        [{ ...previous, ...entry, at: Date.now() }, ...all].slice(0, 40),
      ),
    );
    memo = undefined;
    window.dispatchEvent(new Event(EVENT));
  } catch {}
}
export function savedWatch(id: string, episode: string) {
  return snapshot().find((x) => x.anime.id === id && x.episodeId === episode);
}
export function useWatchHistory() {
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}
export function removeWatch(id: string) {
  localStorage.setItem(
    KEY,
    JSON.stringify(snapshot().filter((x) => x.anime.id !== id)),
  );
  memo = undefined;
  window.dispatchEvent(new Event(EVENT));
}
// Episodes watched to the end, per anime: the episode list marks them like read chapters.
const WATCHED = "mr:watched",
  WATCHED_EVENT = "mr:watched";
const noEpisodes: string[] = [];
let watchedMemo: Record<string, string[]> | undefined;
function watchedSnapshot() {
  if (!watchedMemo) {
    try {
      watchedMemo = JSON.parse(localStorage.getItem(WATCHED) ?? "{}");
    } catch {
      watchedMemo = {};
    }
  }
  return watchedMemo!;
}
function subscribeWatched(cb: () => void) {
  const fn = () => {
    watchedMemo = undefined;
    cb();
  };
  window.addEventListener(WATCHED_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(WATCHED_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
export function markWatched(animeId: string, episodeId: string) {
  const all = watchedSnapshot();
  if (all[animeId]?.includes(episodeId)) return;
  try {
    localStorage.setItem(
      WATCHED,
      JSON.stringify({ ...all, [animeId]: [...(all[animeId] ?? []), episodeId] }),
    );
    watchedMemo = undefined;
    window.dispatchEvent(new Event(WATCHED_EVENT));
  } catch {}
}
export function useWatched(animeId: string) {
  return useSyncExternalStore(
    subscribeWatched,
    () => watchedSnapshot()[animeId] ?? noEpisodes,
    () => noEpisodes,
  );
}
/** Most recent episode watched in an anime, to resume when it's opened without an episode. */
export function lastWatch(animeId: string) {
  return snapshot().find((x) => x.anime.id === animeId);
}

export function ContinueWatching() {
  const collection = useCollection();
  const history = useWatchHistory().filter(
    (h) =>
      !collection.some(
        (c) =>
          c.media === "anime" &&
          c.id === h.anime.id &&
          (c.status === "completed" || c.status === "dropped"),
      ),
  );
  if (!history.length) return null;
  return (
    <Shelf title="Continue Watching" href="/bookmarks">
      {history.slice(0, 16).map((h) => {
        const progress = h.time && h.duration ? Math.min(1, h.time / h.duration) : 0;
        return (
          <ShelfItem key={h.anime.id}>
            <Link
              href={`/anime/${h.anime.id}?ep=${h.episodeId}&audio=${h.language}`}
              className="group pressable block"
            >
              <div className="relative">
                <Cover
                  cover={h.anime.cover}
                  alt={h.anime.title}
                  sizes="(min-width: 640px) 164px, 132px"
                  className="aspect-[2/3]"
                />
                <div className="absolute inset-x-2.5 bottom-2.5 h-[4px] overflow-hidden rounded-full bg-black/40 backdrop-blur-sm">
                  <div
                    className="h-full rounded-full bg-white"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </div>
              <p className="t-footnote mt-2 line-clamp-1 font-medium">{h.anime.title}</p>
              <p className="t-caption text-secondary">
                Episode {h.episodeNumber} · {h.language === "dub" ? "Dub" : "Sub"}
                {h.time && h.duration && h.duration - h.time > 60
                  ? ` · ${Math.ceil((h.duration - h.time) / 60)} min left`
                  : ""}
              </p>
            </Link>
          </ShelfItem>
        );
      })}
    </Shelf>
  );
}
export function AnimeCard({ anime: a }: { anime: Anime }) {
  return (
    <Link href={`/anime/${a.id}`} className="group min-w-0">
      <div className="relative overflow-hidden rounded-xl bg-card">
        <img
          src={coverSrc(a.cover, 640)}
          alt={a.title}
          loading="lazy"
          className="aspect-[2/3] w-full object-cover transition duration-300 group-hover:scale-[1.035]"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
          <span className="grid size-12 place-items-center rounded-full bg-white text-black">
            <PlayIcon className="ml-0.5 size-5" />
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/90 to-transparent px-2 pt-8 pb-2 text-[10px] font-semibold">
          {a.sub > 0 && (
            <span className="rounded bg-white/90 px-2 py-1 text-black">
              SUB {a.sub}
            </span>
          )}
          {a.dub > 0 && (
            <span className="rounded bg-accent px-2 py-1 text-white">
              DUB {a.dub}
            </span>
          )}
        </div>
      </div>
      <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug group-hover:text-accent">
        {a.title}
      </h3>
      <p className="mt-1 text-xs text-secondary">{a.format}</p>
    </Link>
  );
}
