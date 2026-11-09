"use client";
import { useSyncExternalStore } from "react";
import { isMovieId, movieImage, type Movie } from "./movie-types";
import { MOVIE_PROVIDERS } from "./movie-providers";
import { toast } from "./toast";

export type MovieHistory = {
  id: string;
  title: string;
  poster: string;
  year: string;
  provider: string;
  time: number;
  duration: number;
  at: number;
  completed: boolean;
};
export type MoviePreferences = {
  preferredProvider: string;
  disabledProviders: string[];
  autoplay: boolean;
  autoFallback: boolean;
  quality: "auto" | "2160" | "1080" | "720" | "480";
  subtitles: string;
  seek: number;
  timeout: number;
  rememberProgress: boolean;
  isolatePlayer: boolean;
};
export const DEFAULT_MOVIE_PREFERENCES: MoviePreferences = {
  preferredProvider: "auto",
  disabledProviders: [],
  autoplay: false,
  autoFallback: true,
  quality: "auto",
  subtitles: "en",
  seek: 10,
  timeout: 20,
  rememberProgress: true,
  isolatePlayer: true,
};
export function normalizeMoviePreferences(value: unknown): MoviePreferences {
  const r =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const known = (v: unknown): v is string =>
    typeof v === "string" && MOVIE_PROVIDERS.some((p) => p.id === v);
  return {
    preferredProvider: known(r.preferredProvider)
      ? r.preferredProvider
      : "auto",
    disabledProviders: Array.isArray(r.disabledProviders)
      ? [...new Set(r.disabledProviders.filter(known))]
      : [],
    autoplay: r.autoplay === true,
    autoFallback: r.autoFallback !== false,
    quality: ["auto", "2160", "1080", "720", "480"].includes(String(r.quality))
      ? (r.quality as MoviePreferences["quality"])
      : "auto",
    subtitles: ["en", "te", "hi", "ta", "ml", "kn", "off"].includes(
      String(r.subtitles),
    )
      ? String(r.subtitles)
      : "en",
    seek: [5, 10, 15, 30].includes(Number(r.seek)) ? Number(r.seek) : 10,
    timeout: [15, 20, 30, 45].includes(Number(r.timeout))
      ? Number(r.timeout)
      : 20,
    rememberProgress: r.rememberProgress !== false,
    isolatePlayer: r.isolatePlayer !== false,
  };
}
export function normalizeMovieHistory(value: unknown): MovieHistory[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((raw) => {
    if (
      !raw ||
      typeof raw !== "object" ||
      !isMovieId(raw.id) ||
      typeof raw.title !== "string"
    )
      return [];
    const bounded = (v: unknown, max: number) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.min(max, Math.max(0, v))
        : 0;
    return [
      {
        id: raw.id,
        title: raw.title.slice(0, 400),
        poster: movieImage(raw.poster),
        year: String(raw.year ?? "").slice(0, 20),
        provider: MOVIE_PROVIDERS.some((p) => p.id === raw.provider)
          ? raw.provider
          : "auto",
        time: bounded(raw.time, 86400),
        duration: bounded(raw.duration, 86400),
        at: bounded(raw.at, 9e15),
        completed: raw.completed === true,
      },
    ];
  });
}
const HISTORY = "mr:movie-history",
  PREFS = "mr:movie-preferences",
  EVENT = "mr:movies";
const EMPTY: MovieHistory[] = [];
let historyMemo: MovieHistory[] | undefined,
  prefsMemo: MoviePreferences | undefined;
function read(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function invalidate(key: string) {
  if (key === HISTORY) historyMemo = undefined;
  else prefsMemo = undefined;
}
function subscribeKey(key: string, cb: () => void) {
  // A backup may have been imported while no movie component was mounted.
  invalidate(key);
  const fn = (event: Event) => {
    const changed = (event as StorageEvent).key;
    if (changed && changed !== key) return;
    invalidate(key);
    cb();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
const subscribeHistory = (cb: () => void) => subscribeKey(HISTORY, cb);
const subscribePreferences = (cb: () => void) => subscribeKey(PREFS, cb);
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    invalidate(key);
    const event = Object.assign(new Event(EVENT), { key });
    window.dispatchEvent(event);
    return true;
  } catch {
    toast(
      "Couldn't save movie preferences or progress. Check your device storage.",
      { tone: "error" },
    );
    return false;
  }
}
export const getMovieHistory = () =>
  (historyMemo ??= normalizeMovieHistory(read(HISTORY)));
export const getMoviePreferences = () =>
  (prefsMemo ??= normalizeMoviePreferences(read(PREFS)));
export function resetMovieStorageCache() {
  historyMemo = undefined;
  prefsMemo = undefined;
}
export function useMovieHistory() {
  return useSyncExternalStore(subscribeHistory, getMovieHistory, () => EMPTY);
}
export function useMoviePreferences() {
  return useSyncExternalStore(
    subscribePreferences,
    getMoviePreferences,
    () => DEFAULT_MOVIE_PREFERENCES,
  );
}
export function setMoviePreferences(patch: Partial<MoviePreferences>) {
  write(
    PREFS,
    normalizeMoviePreferences({ ...getMoviePreferences(), ...patch }),
  );
}
export function saveMovieProgress(
  movie: Movie,
  provider: string,
  time: number,
  duration: number,
  completed = false,
) {
  if (!getMoviePreferences().rememberProgress) return;
  const entry: MovieHistory = {
    id: movie.id,
    title: movie.title,
    poster: movie.poster,
    year: movie.year,
    provider,
    time,
    duration,
    at: Date.now(),
    completed,
  };
  write(
    HISTORY,
    normalizeMovieHistory([
      entry,
      ...getMovieHistory().filter((m) => m.id !== movie.id),
    ]),
  );
}
export function removeMovieHistory(id: string) {
  write(
    HISTORY,
    getMovieHistory().filter((m) => m.id !== id),
  );
}
