"use client";
import { useSyncExternalStore } from "react";
import type { Anime } from "@/lib/anime";
import { TitleCard } from "./TitleCard";
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

export function AnimeCard({ anime: a }: { anime: Anime }) {
  return (
    <TitleCard
      href={`/anime/${a.id}`}
      title={a.title}
      cover={a.cover}
      meta={[
        /movie/i.test(a.format) ? "Anime film" : "Anime",
        !/movie/i.test(a.format) && Math.max(a.sub, a.dub) > 0 && `${Math.max(a.sub, a.dub)} eps`,
        a.dub > 0 && "Dub",
      ]}
    />
  );
}
