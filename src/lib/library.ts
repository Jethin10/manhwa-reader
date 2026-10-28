"use client";

import { useSyncExternalStore } from "react";

export type SavedSeries = {
  id: string;
  title: string;
  cover: string | null;
  type: string;
};
export type HistoryEntry = SavedSeries & {
  chapterId: string;
  chapterNumber: string | null;
  at: number;
  /** 0..1 scroll progress within the chapter */
  progress?: number;
};

export type ReaderSettings = {
  /** Max page width in CSS px; 0 = fit the screen */
  width: number;
  /** Sharper 2x upscaling for low-resolution uploads */
  hd: boolean;
  /** Small gap between pages */
  gap: boolean;
  mode: "auto" | "scroll" | "single" | "spread";
  direction: "auto" | "rtl" | "ltr";
  fit: "width" | "height";
  theme: "black" | "dim" | "paper" | "sepia";
  brightness: number;
  contrast: number;
  spreadOffset: boolean;
  preload: number;
  tapZones: boolean;
};

export const DEFAULT_READER: ReaderSettings = {
  width: 800,
  hd: true,
  gap: false,
  mode: "auto",
  direction: "auto",
  fit: "width",
  theme: "black",
  brightness: 100,
  contrast: 100,
  spreadOffset: false,
  preload: 3,
  tapZones: true,
};
export function normalizeReader(raw: unknown): ReaderSettings {
  const r =
    raw && typeof raw === "object" ? (raw as Partial<ReaderSettings>) : {};
  const number = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, v))
      : fallback;
  return {
    width: [0, 640, 800, 1040].includes(r.width ?? -1) ? r.width! : 800,
    hd: r.hd !== false,
    gap: r.gap === true,
    mode: ["auto", "scroll", "single", "spread"].includes(r.mode ?? "")
      ? r.mode!
      : "auto",
    direction: ["auto", "rtl", "ltr"].includes(r.direction ?? "")
      ? r.direction!
      : "auto",
    fit: r.fit === "height" ? "height" : "width",
    theme: ["black", "dim", "paper", "sepia"].includes(r.theme ?? "")
      ? r.theme!
      : "black",
    brightness: number(r.brightness, 50, 120, 100),
    contrast: number(r.contrast, 75, 150, 100),
    spreadOffset: r.spreadOffset === true,
    preload: [1, 3, 5].includes(r.preload ?? 0) ? r.preload! : 3,
    tapZones: r.tapZones !== false,
  };
}

const BOOKMARKS = "mr:bookmarks";
const HISTORY = "mr:history";
const READER = "mr:reader";
const POSITIONS = "mr:positions";
const SERIES_READER = "mr:reader-series";
const EVENT = "mr:library";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
  cache.clear();
  window.dispatchEvent(new Event(EVENT));
}

// useSyncExternalStore needs referentially stable snapshots
const cache = new Map<string, unknown>();
function snapshot<T>(key: string, fallback: T): T {
  if (!cache.has(key)) cache.set(key, read(key, fallback));
  return cache.get(key) as T;
}

function subscribe(cb: () => void) {
  const onStorage = () => {
    cache.clear();
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: never[] = [];

export function useBookmarks(): SavedSeries[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot<SavedSeries[]>(BOOKMARKS, EMPTY),
    () => EMPTY,
  );
}

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot<HistoryEntry[]>(HISTORY, EMPTY),
    () => EMPTY,
  );
}

export function toggleBookmark(s: SavedSeries) {
  const list = read<SavedSeries[]>(BOOKMARKS, []);
  const exists = list.some((x) => x.id === s.id);
  write(BOOKMARKS, exists ? list.filter((x) => x.id !== s.id) : [s, ...list]);
}

export function recordRead(entry: Omit<HistoryEntry, "at">) {
  const all = read<HistoryEntry[]>(HISTORY, []);
  const prev = all.find((x) => x.id === entry.id);
  const progress = prev?.chapterId === entry.chapterId ? prev.progress : 0;
  const list = all.filter((x) => x.id !== entry.id);
  write(
    HISTORY,
    [{ ...entry, progress, at: Date.now() }, ...list].slice(0, 100),
  );
}

/** Persists where the reader is inside a chapter (for resume + the progress bar on covers). */
export function saveProgress(
  seriesId: string,
  chapterId: string,
  progress: number,
  page: number,
) {
  const positions = read<Record<string, number>>(POSITIONS, {});
  positions[chapterId] = page;
  const keys = Object.keys(positions);
  if (keys.length > 300) delete positions[keys[0]];
  localStorage.setItem(POSITIONS, JSON.stringify(positions));
  const list = read<HistoryEntry[]>(HISTORY, []);
  const entry = list.find(
    (x) => x.id === seriesId && x.chapterId === chapterId,
  );
  if (entry) {
    entry.progress = progress;
    write(HISTORY, list);
  }
}

/** Page index the reader was last on in this chapter (0 if never opened). */
export function getSavedPage(chapterId: string): number {
  return read<Record<string, number>>(POSITIONS, {})[chapterId] ?? 0;
}

export function useReaderSettings(seriesId?: string): ReaderSettings {
  return useSyncExternalStore(
    subscribe,
    () => {
      const key = `reader-derived:${seriesId ?? "global"}`;
      if (!cache.has(key)) {
        const global = normalizeReader(read(READER, {}));
        const overrides = read<Record<string, ReaderSettings>>(
          SERIES_READER,
          {},
        );
        cache.set(
          key,
          seriesId && overrides[seriesId]
            ? normalizeReader(overrides[seriesId])
            : global,
        );
      }
      return cache.get(key) as ReaderSettings;
    },
    () => DEFAULT_READER,
  );
}

export function updateReaderSettings(patch: Partial<ReaderSettings>) {
  write(
    READER,
    normalizeReader({ ...normalizeReader(read(READER, {})), ...patch }),
  );
}
export function saveSeriesReaderSettings(id: string, settings: ReaderSettings) {
  const map = read<Record<string, ReaderSettings>>(SERIES_READER, {});
  map[id] = normalizeReader(settings);
  write(SERIES_READER, Object.fromEntries(Object.entries(map).slice(-100)));
}
export function clearSeriesReaderSettings(id: string) {
  const map = read<Record<string, ReaderSettings>>(SERIES_READER, {});
  delete map[id];
  write(SERIES_READER, map);
}
export function useSeriesReaderPreset(id: string) {
  return useSyncExternalStore(
    subscribe,
    () => !!read<Record<string, ReaderSettings>>(SERIES_READER, {})[id],
    () => false,
  );
}

export function removeHistory(id: string) {
  write(
    HISTORY,
    read<HistoryEntry[]>(HISTORY, []).filter((x) => x.id !== id),
  );
}
