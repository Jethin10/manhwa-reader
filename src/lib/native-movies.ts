"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Movie } from "./movie-types";

/**
 * Movie downloads in the Android app. Movie players run on other sites, so the web app can't
 * save them; the native shell sees the stream a player loads (StreamSniffer.java), downloads it
 * on the device (MovieDownloads.java) and plays it offline (MoviePlayerActivity.java).
 */
type Bridge = {
  movieDownloads?: () => boolean;
  movieDownloadStart: (json: string) => string;
  movieDownloadList: () => string;
  movieDownloadPause: (id: string) => void;
  movieDownloadResume: (id: string) => void;
  movieDownloadDelete: (id: string) => void;
  movieDownloadPlay: (id: string) => void;
  movieDownloadSpace: () => string;
  movieStreamsReset: () => void;
};

function bridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { ManhwaNative?: Bridge }).ManhwaNative;
  try {
    return b?.movieDownloads?.() ? b : null;
  } catch {
    return null;
  }
}

export const movieDownloadsSupported = () => !!bridge();

/** A video the movie player loaded that is long enough to be the movie itself. */
export type MovieStream = {
  url: string;
  headers: Record<string, string>;
  kind: "file" | "hls";
  /** Bytes, for a single file. */
  size?: number;
  /** Seconds, for a stream. */
  duration?: number;
  variants?: { height: number; bandwidth: number }[];
};

export type MovieDownload = {
  id: string;
  movieId: string;
  title: string;
  poster: string;
  year: string;
  quality: string;
  kind: "file" | "hls";
  state: "queued" | "downloading" | "paused" | "failed" | "done";
  bytes: number;
  total: number;
  done: number;
  parts: number;
  height: number;
  error?: string;
  at: number;
  finishedAt?: number;
};

// ---------- the download list, kept in sync with native progress events ----------

let list: MovieDownload[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const EMPTY: MovieDownload[] = [];

function read() {
  const b = bridge();
  if (!b) return;
  try {
    list = JSON.parse(b.movieDownloadList()) as MovieDownload[];
  } catch {
    list = [];
  }
}

function subscribe(fn: () => void) {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    read();
    window.addEventListener("mr:movie-downloads", (e) => {
      const detail = (e as CustomEvent).detail;
      if (Array.isArray(detail)) list = detail as MovieDownload[];
      listeners.forEach((l) => l());
    });
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useMovieDownloads(): MovieDownload[] {
  return useSyncExternalStore(
    subscribe,
    () => list,
    () => EMPTY,
  );
}

export function startMovieDownload(
  movie: Movie,
  stream: MovieStream,
  height?: number,
): { id: string } | { error: string } {
  const b = bridge();
  if (!b) return { error: "Movie downloads work in the Kairo Android app." };
  const top = Math.max(0, ...(stream.variants ?? []).map((v) => v.height));
  const quality = height
    ? qualityLabel(height)
    : top
      ? qualityLabel(top)
      : "Best available";
  try {
    return JSON.parse(
      b.movieDownloadStart(
        JSON.stringify({
          movieId: movie.id,
          title: movie.title,
          poster: movie.poster,
          year: movie.year,
          quality,
          kind: stream.kind,
          url: stream.url,
          headers: stream.headers,
          size: stream.size ?? 0,
          height: height ?? 0,
        }),
      ),
    );
  } catch {
    return { error: "Couldn't start the download." };
  }
}

export const pauseMovieDownload = (id: string) => bridge()?.movieDownloadPause(id);
export const resumeMovieDownload = (id: string) => bridge()?.movieDownloadResume(id);
export const deleteMovieDownload = (id: string) => bridge()?.movieDownloadDelete(id);
export const playMovieDownload = (id: string) => bridge()?.movieDownloadPlay(id);

// ---------- streams found while a movie plays ----------

/**
 * Streams the current movie player has loaded, newest first. `scope` (the source playing)
 * starts a fresh list when it changes. Empty outside the Android app.
 */
export function useCaughtStreams(active: boolean, scope = ""): MovieStream[] {
  const [streams, setStreams] = useState<MovieStream[]>([]);
  useEffect(() => {
    if (!active || !bridge()) return;
    // Streams found for an earlier movie are reported again for this one.
    bridge()?.movieStreamsReset();
    const on = (e: Event) => {
      const s = (e as CustomEvent).detail as MovieStream;
      if (!s?.url || (s.kind !== "file" && s.kind !== "hls")) return;
      setStreams((prev) =>
        prev.some((p) => p.url === s.url) ? prev : [s, ...prev].slice(0, 6),
      );
    };
    window.addEventListener("mr:stream", on);
    return () => {
      window.removeEventListener("mr:stream", on);
      setStreams([]);
    };
  }, [active, scope]);
  return streams;
}

/** Streams report odd heights (1072, 714, 358); name them like everyone else does. */
export function qualityLabel(height: number) {
  const named = [2160, 1440, 1080, 720, 576, 480, 360, 240, 144];
  const near = named.reduce((a, b) => (Math.abs(b - height) < Math.abs(a - height) ? b : a));
  return Math.abs(near - height) <= height * 0.06 ? `${near}p` : `${height}p`;
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600),
    m = Math.round((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
