"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { SeriesUpdate } from "@/app/api/updates/route";
import { useCollection } from "./collection";
import {
  useAllRead,
  useBookmarks,
  useHistory,
  type HistoryEntry,
  type SavedSeries,
} from "./library";

/**
 * New chapters for the series in your library, as in Mihon's Updates tab. The server returns
 * each series' chapter list; the client keeps the last result and works out what's unread.
 */
type Stored = {
  at: number;
  series: Record<string, SeriesUpdate>;
  failed: string[];
};
const KEY = "mr:updates";
const STALE_MS = 30 * 60 * 1000;
const EMPTY: Stored = { at: 0, series: {}, failed: [] };

let state: Stored | null = null;
let refreshing = false;
let snap = { data: EMPTY, refreshing: false };
const listeners = new Set<() => void>();

function load() {
  if (!state) {
    try {
      state = { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? "null") };
    } catch {
      state = EMPTY;
    }
  }
  return state!;
}
function emit() {
  snap = { data: load(), refreshing };
  listeners.forEach((l) => l());
}
let primed = false;
const SERVER = { data: EMPTY, refreshing: false };

export function useUpdates() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      if (!primed) {
        primed = true;
        snap = { data: load(), refreshing };
      }
      return snap;
    },
    () => SERVER,
  );
}

/** Series to check: everything saved to the library except dropped titles. */
export function useLibrarySeries(): SavedSeries[] {
  const bookmarks = useBookmarks();
  const collection = useCollection();
  return useMemo(() => {
    const map = new Map<string, SavedSeries>();
    for (const b of bookmarks) map.set(b.id, b);
    for (const c of collection) {
      if (c.media !== "series") continue;
      if (c.status === "dropped") map.delete(c.id);
      else map.set(c.id, { id: c.id, title: c.title, cover: c.cover, type: c.type });
    }
    return [...map.values()];
  }, [bookmarks, collection]);
}

export async function refreshUpdates(series: SavedSeries[]) {
  if (refreshing || !series.length) return;
  refreshing = true;
  emit();
  try {
    const ids = series.map((s) => s.id);
    const next: Stored = { at: Date.now(), series: {}, failed: [] };
    for (let i = 0; i < ids.length; i += 60) {
      const res = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids.slice(i, i + 60) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { series: Stored["series"]; failed: string[] };
      Object.assign(next.series, body.series);
      next.failed.push(...body.failed);
    }
    // A source that failed this time keeps its last known chapters.
    for (const id of next.failed) {
      const old = load().series[id];
      if (old) next.series[id] = old;
    }
    state = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Too big to keep; still shown for this session.
    }
  } finally {
    refreshing = false;
    emit();
  }
}

/** Refreshes once the saved result is older than half an hour. */
export function useAutoRefresh(series: SavedSeries[]) {
  const { data } = useUpdates();
  const ids = series.map((s) => s.id).join(",");
  useEffect(() => {
    if (!series.length) return;
    const missing = series.some((s) => !data.series[s.id] && !data.failed.includes(s.id));
    if (missing || Date.now() - data.at > STALE_MS) void refreshUpdates(series).catch(() => {});
    // Re-run when the library changes, not on every result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
}

/**
 * Unread chapters for one series. A chapter is read when marked read, or when it comes
 * before the chapter you last opened (history from before read tracking existed).
 */
export function unreadCount(
  update: SeriesUpdate | undefined,
  read: string[] | undefined,
  last: HistoryEntry | undefined,
) {
  if (!update) return 0;
  const done = new Set(read ?? []);
  const lastN = parseFloat(last?.chapterNumber ?? "");
  let n = 0;
  for (const num of update.numbers)
    if (!done.has(String(num)) && !(Number.isFinite(lastN) && num < lastN)) n++;
  for (const key of update.other) if (!done.has(key)) n++;
  return n;
}

/** Unread counts by series id, for the library and the tab badge. */
export function useUnreadCounts() {
  const { data } = useUpdates();
  const read = useAllRead();
  const history = useHistory();
  const series = useLibrarySeries();
  return useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of series)
      out[s.id] = unreadCount(
        data.series[s.id],
        read[s.id],
        history.find((h) => h.id === s.id),
      );
    return out;
  }, [data, read, history, series]);
}
