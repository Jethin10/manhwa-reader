"use client";

import { useSyncExternalStore } from "react";
import type { SavedSeries } from "./library";
import { toast } from "./toast";

/**
 * Chapters saved on this device for offline reading, as in Mihon. Page images go into a
 * Cache Storage cache the service worker serves from (public/sw.js), under the same
 * same-origin URLs the reader uses, and the list of saved chapters lives in localStorage.
 */
export type DownloadedChapter = {
  id: string;
  number: string | null;
  title: string | null;
  series: SavedSeries;
  /** Same-origin page URLs, all present in the downloads cache. */
  pages: string[];
  bytes: number;
  at: number;
};
export type DownloadJob = {
  id: string;
  number: string | null;
  title: string | null;
  series: SavedSeries;
  state: "queued" | "downloading" | "failed";
  done: number;
  total: number;
  error?: string;
};
type ChapterInfo = { id: string; number: string | null; title: string | null };

export const DOWNLOAD_CACHE = "downloads";
const META = "mr:downloads";
const SHELL = "shell-v2";
const PARALLEL_PAGES = 4;

let saved: Record<string, DownloadedChapter> | null = null;
const jobs = new Map<string, DownloadJob>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let snapshot = {
  saved: {} as Record<string, DownloadedChapter>,
  jobs: [] as DownloadJob[],
};
let running = false;

function load() {
  if (saved) return saved;
  try {
    saved = JSON.parse(localStorage.getItem(META) ?? "{}") ?? {};
  } catch {
    saved = {};
  }
  return saved!;
}
function persist(next = load()) {
  try {
    localStorage.setItem(META, JSON.stringify(next));
    saved = next;
    return true;
  } catch {
    return false;
  }
}
function emit() {
  snapshot = { saved: { ...load() }, jobs: [...jobs.values()] };
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const storage = (e: StorageEvent) => {
    if (e.key !== META) return;
    saved = null;
    emit();
  };
  window.addEventListener("storage", storage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", storage);
  };
}
const SERVER = { saved: {}, jobs: [] } as typeof snapshot;
let primed = false;
function getSnapshot() {
  if (!primed) {
    primed = true;
    snapshot = { saved: { ...load() }, jobs: [] };
  }
  return snapshot;
}

/** Everything saved and everything in the queue. */
export function useDownloads() {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER);
}

/** Same-origin URL for a page, so the service worker can serve it offline. */
export function localPage(src: string) {
  return src.startsWith("/") ? src : `/api/img?u=${encodeURIComponent(src)}`;
}

export function queueDownloads(series: SavedSeries, chapters: ChapterInfo[]) {
  const have = load();
  for (const c of chapters) {
    if (have[c.id] || jobs.has(c.id)) continue;
    jobs.set(c.id, {
      ...c,
      series,
      state: "queued",
      done: 0,
      total: 0,
    });
  }
  emit();
  // Ask the browser not to evict saved chapters when space runs low.
  void navigator.storage?.persist?.().catch(() => {});
  void pump();
}

export function cancelDownload(id: string) {
  controllers.get(id)?.abort();
  jobs.delete(id);
  emit();
}

export function retryDownload(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  job.state = "queued";
  job.error = undefined;
  emit();
  void pump();
}

export async function deleteDownloads(ids: string[]) {
  const have = load();
  const removing = new Set(ids);
  const next = Object.fromEntries(
    Object.entries(have).filter(([id]) => !removing.has(id)),
  );
  if (!persist(next)) {
    toast("Couldn't save the download list. Check your device storage.", {
      tone: "error",
    });
    return;
  }
  try {
    const cache = await caches.open(DOWNLOAD_CACHE);
    // A page can belong to two copies only by coincidence; keep anything still referenced.
    const keep = new Set(
      Object.values(have)
        .filter((d) => !removing.has(d.id))
        .flatMap((d) => d.pages),
    );
    for (const id of ids) {
      for (const url of have[id]?.pages ?? [])
        if (!keep.has(url)) await cache.delete(url);
    }
  } catch {
    toast(
      "Removed from your list, but some cached files couldn't be cleared.",
      { tone: "error" },
    );
  } finally {
    emit();
  }
}

async function pump() {
  if (running) return;
  running = true;
  let finished = 0;
  try {
    for (;;) {
      const job = [...jobs.values()].find((j) => j.state === "queued");
      if (!job) break;
      if (await download(job)) finished++;
    }
  } finally {
    running = false;
  }
  if (finished && !jobs.size)
    toast(
      finished === 1 ? "Chapter downloaded" : `${finished} chapters downloaded`,
      { action: { label: "View", href: "/downloads" } },
    );
}

function retryDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
async function fetchRetry(url: string, signal: AbortSignal) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // The header tells the service worker not to keep a second copy in its image cache.
      const res = await fetch(url, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
        headers: { "x-mr-download": "1" },
      });
      if (res.ok) return res;
      last = new Error(`HTTP ${res.status}`);
      await res.body?.cancel().catch(() => {});
      if (res.status < 500 && res.status !== 429) throw last;
    } catch (e) {
      if (
        signal.aborted ||
        (last instanceof Error &&
          /^HTTP [34]/.test(last.message) &&
          last.message !== "HTTP 429")
      )
        throw e;
      last = e;
    }
    if (attempt === 0) await retryDelay(800, signal);
  }
  throw last;
}

/** Saves one chapter; true when it finished. */
async function download(job: DownloadJob): Promise<boolean> {
  const ctrl = new AbortController();
  controllers.set(job.id, ctrl);
  job.state = "downloading";
  emit();
  const stored: string[] = [];
  let workerFailure: unknown;
  try {
    const res = await fetchRetry(
      `/api/chapter/pages?id=${encodeURIComponent(job.id)}`,
      ctrl.signal,
    );
    const { pages } = (await res.json()) as { pages: { src: string }[] };
    if (!pages?.length) throw new Error("This chapter has no pages.");
    const urls = pages.map((p) => localPage(p.src));
    job.total = urls.length;
    emit();
    const cache = await caches.open(DOWNLOAD_CACHE);
    let bytes = 0;
    let next = 0;
    const worker = async () => {
      try {
        while (next < urls.length) {
          ctrl.signal.throwIfAborted();
          const url = urls[next++];
          const hit = await cache.match(url);
          if (hit) {
            bytes += Number(hit.headers.get("content-length")) || 0;
          } else {
            const page = await fetchRetry(url, ctrl.signal);
            const blob = await page.blob();
            ctrl.signal.throwIfAborted();
            if (!blob.size) throw new Error("A chapter page was empty.");
            bytes += blob.size;
            await cache.put(
              url,
              new Response(blob, {
                headers: {
                  "Content-Type": page.headers.get("content-type") ?? blob.type,
                  "Content-Length": String(blob.size),
                },
              }),
            );
            stored.push(url);
          }
          job.done++;
          emit();
        }
      } catch (error) {
        if (!ctrl.signal.aborted) {
          workerFailure = error;
          ctrl.abort(error);
        }
        throw error;
      }
    };
    await Promise.allSettled(
      Array.from({ length: Math.min(PARALLEL_PAGES, urls.length) }, worker),
    );
    if (workerFailure) throw workerFailure;
    ctrl.signal.throwIfAborted();
    const entry = {
      id: job.id,
      number: job.number,
      title: job.title,
      series: job.series,
      pages: urls,
      bytes,
      at: Date.now(),
    };
    if (!persist({ ...load(), [job.id]: entry }))
      throw new DOMException(
        "Couldn't save the download index. Free some device storage and retry.",
        "QuotaExceededError",
      );
    jobs.delete(job.id);
    void cacheOfflineShell();
    return true;
  } catch (e) {
    if (ctrl.signal.aborted && !workerFailure) {
      const cache = await caches.open(DOWNLOAD_CACHE);
      await Promise.all(stored.map((u) => cache.delete(u)));
    } else {
      job.state = "failed";
      job.error =
        e instanceof Error && e.message
          ? e.message
          : "Couldn't download this chapter.";
      const name = job.number ? `Chapter ${job.number}` : "a chapter";
      toast(
        e instanceof DOMException && e.name === "QuotaExceededError"
          ? "Storage is full. Delete some downloads to make room."
          : `Couldn't download ${name}`,
        {
          tone: "error",
          action: { label: "Retry", run: () => retryDownload(job.id) },
        },
      );
    }
    return false;
  } finally {
    if (controllers.get(job.id) === ctrl) controllers.delete(job.id);
    emit();
  }
}

/**
 * The Downloads screen must open without a connection, even if it was never visited:
 * store its HTML and the scripts and styles it loads.
 */
async function cacheOfflineShell() {
  try {
    const res = await fetch("/downloads", { cache: "no-store" });
    if (!res.ok) return;
    const html = await res.clone().text();
    const shell = await caches.open(SHELL);
    await shell.put("/downloads", res);
    const assets = [
      ...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) ?? []),
    ];
    const statics = await caches.open("static-v2");
    await Promise.all(
      assets.map(async (a) => {
        if (await statics.match(a)) return;
        const r = await fetch(a).catch(() => null);
        if (r?.ok) await statics.put(a, r);
      }),
    );
  } catch {
    // Offline shell is best effort; the downloads themselves are already saved.
  }
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
