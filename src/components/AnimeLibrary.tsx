/* eslint-disable @next/next/no-img-element -- Images use the shared resizing proxy. */
"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import type { Anime } from "@/lib/anime";
import { coverSrc } from "@/lib/images";
import { useCollection } from "@/lib/collection";
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
    <section className="mt-10">
      <h2 className="t-title2">Continue Watching</h2>
      <div className="no-scrollbar mt-5 flex gap-4 overflow-x-auto pb-3">
        {history.map((h) => (
          <Link
            key={h.anime.id}
            href={`/anime/${h.anime.id}?ep=${h.episodeId}&audio=${h.language}`}
            className="flex w-72 shrink-0 items-center gap-4 rounded-2xl bg-card p-3 transition hover:bg-fill-2"
          >
            <img
              src={coverSrc(h.anime.cover, 200)}
              alt=""
              className="h-24 w-16 rounded-lg object-cover"
            />
            <div>
              <h3 className="line-clamp-2 text-sm font-medium">
                {h.anime.title}
              </h3>
              <p className="mt-2 text-xs text-secondary">
                Resume episode {h.episodeNumber} ·{" "}
                {h.language === "dub" ? "English dub" : "Subtitled"}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
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
            ▶
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
