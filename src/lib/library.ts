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

/** Reading modes, as in Mihon: long strip for webtoons, pagers for print comics. */
export type ReadingMode =
  "auto" | "webtoon" | "webtoon-gaps" | "ltr" | "rtl" | "vertical";
/** Where taps turn pages; see lib/tap-zones. */
export type TapLayout = "l" | "kindle" | "edge" | "sides" | "off";

export type ReaderSettings = {
  mode: ReadingMode;
  // Paged modes
  scale: "screen" | "width" | "height" | "original";
  spreads: boolean;
  spreadOffset: boolean;
  animate: boolean;
  // Long strip
  /** Side padding as a percentage of the screen width */
  padding: number;
  /** Max strip width on large screens in CSS px; 0 = fill */
  width: number;
  // Navigation
  tapLayout: TapLayout;
  invertTap: "none" | "horizontal" | "vertical" | "both";
  doubleTapZoom: boolean;
  volumeKeys: boolean;
  volumeInvert: boolean;
  // Display
  background: "black" | "gray" | "white" | "sepia";
  pageNumber: boolean;
  keepAwake: boolean;
  // Filters
  brightness: number;
  contrast: number;
  grayscale: boolean;
  invert: boolean;
  tint: "none" | "warm" | "amber" | "night";
  // Loading
  hd: boolean;
  preload: number;
};

export const DEFAULT_READER: ReaderSettings = {
  mode: "auto",
  scale: "screen",
  spreads: false,
  spreadOffset: false,
  animate: true,
  padding: 0,
  width: 800,
  tapLayout: "l",
  invertTap: "none",
  doubleTapZoom: true,
  volumeKeys: true,
  volumeInvert: false,
  background: "black",
  pageNumber: true,
  keepAwake: true,
  brightness: 100,
  contrast: 100,
  grayscale: false,
  invert: false,
  tint: "none",
  hd: true,
  preload: 3,
};

type Legacy = {
  direction?: string;
  gap?: boolean;
  fit?: string;
  theme?: string;
  tapZones?: boolean;
};

export function normalizeReader(raw: unknown): ReaderSettings {
  const r = (
    raw && typeof raw === "object" ? raw : {}
  ) as Partial<ReaderSettings> & Legacy;
  const pick = <T extends string>(
    v: unknown,
    list: readonly T[],
    fallback: T,
  ): T => (list.includes(v as T) ? (v as T) : fallback);
  const number = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, v))
      : fallback;
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;

  // Settings saved before the Mihon-style reader used scroll/single/spread + direction.
  const legacyMode = (r.mode as string | undefined) ?? "";
  const legacyDir =
    r.direction === "rtl" || r.direction === "ltr" ? r.direction : null;
  const mode: ReadingMode =
    legacyMode === "scroll"
      ? r.gap
        ? "webtoon-gaps"
        : "webtoon"
      : legacyMode === "single" || legacyMode === "spread"
        ? (legacyDir ?? "auto")
        : pick(
            legacyMode,
            ["auto", "webtoon", "webtoon-gaps", "ltr", "rtl", "vertical"],
            "auto",
          );
  const legacyBackground =
    { dim: "gray", paper: "white" }[r.theme ?? ""] ?? r.theme;

  return {
    mode,
    scale: pick(
      r.scale ??
        (r.fit === "height"
          ? "height"
          : r.fit === "width"
            ? "width"
            : undefined),
      ["screen", "width", "height", "original"],
      "screen",
    ),
    spreads: bool(r.spreads, legacyMode === "spread"),
    spreadOffset: bool(r.spreadOffset, false),
    animate: bool(r.animate, true),
    padding: number(r.padding, 0, 25, 0),
    width: [0, 640, 800, 1040].includes(r.width ?? -1) ? r.width! : 800,
    tapLayout: pick(
      r.tapLayout ?? (r.tapZones === false ? "off" : undefined),
      ["l", "kindle", "edge", "sides", "off"],
      "l",
    ),
    invertTap: pick(
      r.invertTap,
      ["none", "horizontal", "vertical", "both"],
      "none",
    ),
    doubleTapZoom: bool(r.doubleTapZoom, true),
    volumeKeys: bool(r.volumeKeys, true),
    volumeInvert: bool(r.volumeInvert, false),
    background: pick(
      r.background ?? legacyBackground,
      ["black", "gray", "white", "sepia"],
      "black",
    ),
    pageNumber: bool(r.pageNumber, true),
    keepAwake: bool(r.keepAwake, true),
    brightness: number(r.brightness, 20, 120, 100),
    contrast: number(r.contrast, 75, 150, 100),
    grayscale: bool(r.grayscale, false),
    invert: bool(r.invert, false),
    tint: pick(r.tint, ["none", "warm", "amber", "night"], "none"),
    hd: r.hd !== false,
    preload: [1, 3, 5].includes(r.preload ?? 0) ? r.preload! : 3,
  };
}

const BOOKMARKS = "mr:bookmarks";
const HISTORY = "mr:history";
const READER = "mr:reader";
const POSITIONS = "mr:positions";
const SERIES_READER = "mr:reader-series";
const SERIES_MODE = "mr:reader-mode";
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

/** Reading mode chosen for one series in the reader (like Mihon, the mode sticks per title). */
export function useSeriesMode(id: string): ReadingMode | null {
  return useSyncExternalStore(
    subscribe,
    () => read<Record<string, ReadingMode>>(SERIES_MODE, {})[id] ?? null,
    () => null,
  );
}
export function setSeriesMode(id: string, mode: ReadingMode | null) {
  const map = read<Record<string, ReadingMode>>(SERIES_MODE, {});
  if (mode) map[id] = mode;
  else delete map[id];
  write(SERIES_MODE, Object.fromEntries(Object.entries(map).slice(-500)));
}

export function removeHistory(id: string) {
  write(
    HISTORY,
    read<HistoryEntry[]>(HISTORY, []).filter((x) => x.id !== id),
  );
}
