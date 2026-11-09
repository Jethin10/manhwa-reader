"use client";
import { useSyncExternalStore } from "react";
import { loadMedia } from "./anime-client";
import { toast } from "./toast";
import type { PlaybackMedia } from "./anime-playback";
import {
  VIDEO_CACHE,
  offlinePrefix,
  planKey,
  prepareOfflineHls,
  validVideoId,
  validateOfflinePlan,
  type OfflinePlan,
  type VideoDownloadOptions,
} from "./offline-hls";
export type { VideoDownloadOptions } from "./offline-hls";
export { VIDEO_CACHE } from "./offline-hls";

type AnimeInfo = { id: string; title: string; cover: string };
type EpisodeInfo = { id: string; number: number; title: string };
export type VideoJob = {
  id: string;
  anime: AnimeInfo;
  episode: EpisodeInfo;
  audio: "sub" | "dub";
  quality: VideoDownloadOptions["quality"];
  audioTrack?: string;
  state: "queued" | "downloading" | "paused" | "failed";
  done: number;
  total: number;
  bytes: number;
  error?: string;
  waitingForPlayback?: boolean;
};
export type SavedVideo = {
  id: string;
  anime: AnimeInfo;
  episode: EpisodeInfo;
  audio: "sub" | "dub";
  quality: VideoDownloadOptions["quality"];
  audioTrack?: string;
  actualHeight: number;
  bytes: number;
  at: number;
  media: PlaybackMedia;
  keys: string[];
};
type Snapshot = { saved: Record<string, SavedVideo>; jobs: VideoJob[] };
const INDEX = "mr:video-downloads";
const MAX_SEGMENT = 64 * 1024 * 1024;
const HEADROOM = 16 * 1024 * 1024;
const EMPTY: Snapshot = { saved: {}, jobs: [] };
let saved: Record<string, SavedVideo> = {};
const jobs = new Map<string, VideoJob>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
const playbackWaiters = new Set<() => void>();
let snapshot = EMPTY,
  initialized = false,
  running = false,
  playbackActive = false;

function text(value: unknown, limit = 400): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit;
}
function selection(raw: VideoJob | SavedVideo) {
  return (
    raw &&
    validVideoId(raw.id) &&
    raw.anime &&
    text(raw.anime.id, 200) &&
    text(raw.anime.title) &&
    typeof raw.anime.cover === "string" &&
    raw.episode &&
    /^\d{1,20}$/.test(raw.episode.id) &&
    text(raw.episode.title) &&
    Number.isFinite(raw.episode.number) &&
    ["sub", "dub"].includes(raw.audio) &&
    ["480", "720", "1080", "2160", "best"].includes(raw.quality) &&
    (raw.audioTrack === undefined || text(raw.audioTrack, 100))
  );
}
function emit() {
  snapshot = {
    saved: { ...saved },
    jobs: [...jobs.values()].map((job) => ({ ...job })),
  };
  listeners.forEach((listener) => listener());
}
function persist(nextSaved = saved, nextJobs = [...jobs.values()]) {
  try {
    localStorage.setItem(
      INDEX,
      JSON.stringify({ version: 1, saved: nextSaved, jobs: nextJobs }),
    );
    return true;
  } catch {
    return false;
  }
}
function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const raw = localStorage.getItem(INDEX);
    const value = raw && raw.length <= 2 * 1024 * 1024 ? JSON.parse(raw) : null;
    if (value?.version === 1) {
      if (value.saved && typeof value.saved === "object") {
        for (const entry of Object.values(value.saved).slice(
          0,
          200,
        ) as SavedVideo[]) {
          const prefix = offlinePrefix(entry?.id);
          if (
            selection(entry) &&
            entry.media?.src === `${prefix}index.m3u8` &&
            Array.isArray(entry.keys) &&
            entry.keys.length > 0 &&
            entry.keys.length <= 6005 &&
            entry.keys.every(
              (key) =>
                typeof key === "string" &&
                key.startsWith(prefix) &&
                !key.includes(".."),
            ) &&
            Array.isArray(entry.media.tracks) &&
            entry.media.tracks.every(
              (track) =>
                typeof track.src === "string" && track.src.startsWith(prefix),
            ) &&
            entry.keys.includes(entry.media.src) &&
            entry.media.tracks.every((track) =>
              entry.keys.includes(track.src),
            ) &&
            Number.isFinite(entry.bytes) &&
            entry.bytes > 0 &&
            Number.isFinite(entry.at) &&
            entry.at >= 0
          )
            saved[entry.id] = {
              ...entry,
              media: { ...entry.media, servers: [] },
            };
        }
      }
      if (Array.isArray(value.jobs))
        for (const job of value.jobs.slice(0, 200))
          if (selection(job) && !saved[job.id])
            jobs.set(job.id, {
              ...job,
              state: "paused",
              done: 0,
              total: 0,
              bytes: 0,
              error: undefined,
              waitingForPlayback: false,
            });
    }
  } catch {
    /* Corrupt metadata never starts network work. */
  }
  // This module can be imported after a player has already emitted its first event.
  playbackActive =
    typeof document !== "undefined" &&
    [...document.querySelectorAll("video")].some(
      (video) => !video.paused && !video.ended,
    );
  window.addEventListener("mr:playback-active", (event) => {
    playbackActive = (event as CustomEvent<boolean>).detail === true;
    if (!playbackActive) for (const resolve of playbackWaiters) resolve();
  });
  emit();
}
function subscribe(listener: () => void) {
  init();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function getSnapshot() {
  init();
  return snapshot;
}
export function useVideoDownloads() {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
function identity(
  value: Pick<
    VideoJob,
    "anime" | "episode" | "audio" | "quality" | "audioTrack"
  >,
) {
  return JSON.stringify([
    value.anime.id,
    value.episode.id,
    value.audio,
    value.quality,
    value.audioTrack ?? "",
  ]);
}
function unsupported() {
  return (
    !window.isSecureContext ||
    typeof caches === "undefined" ||
    !navigator.serviceWorker?.controller
  );
}
export function queueVideoDownloads(
  anime: AnimeInfo,
  episodes: EpisodeInfo[],
  options: VideoDownloadOptions,
): number {
  init();
  if (unsupported()) {
    toast(
      "Offline video needs HTTPS and an active offline service worker. Open the hosted app and reload once.",
      { tone: "error" },
    );
    return 0;
  }
  const existing = new Set(
    [...Object.values(saved), ...jobs.values()].map(identity),
  );
  const added: string[] = [];
  for (const episode of episodes.slice(0, 200)) {
    if (jobs.size >= 200) break;
    const job: VideoJob = {
      id: `v-${crypto.randomUUID()}`,
      anime: { ...anime },
      episode: { ...episode },
      ...options,
      state: "queued",
      done: 0,
      total: 0,
      bytes: 0,
    };
    if (!selection(job) || existing.has(identity(job))) continue;
    existing.add(identity(job));
    jobs.set(job.id, job);
    added.push(job.id);
  }
  if (!persist()) {
    added.forEach((id) => jobs.delete(id));
    toast(
      "Couldn't save the video queue. Free some device storage and retry.",
      { tone: "error" },
    );
    return 0;
  }
  emit();
  void navigator.storage?.persist?.().catch(() => {});
  void pump();
  return added.length;
}
export function pauseVideoDownload(id: string) {
  init();
  const job = jobs.get(id);
  if (!job) return;
  job.state = "paused";
  job.waitingForPlayback = false;
  controllers.get(id)?.abort(new DOMException("Download paused", "AbortError"));
  persist();
  emit();
}
export function resumeVideoDownload(id: string) {
  init();
  const job = jobs.get(id);
  if (!job || job.state === "downloading") return;
  // The aborted workers must settle before this job can restart.
  job.state = "queued";
  job.error = undefined;
  persist();
  emit();
  void pump();
}
export function cancelVideoDownload(id: string) {
  init();
  const job = jobs.get(id);
  if (!job) return;
  const rest = [...jobs.values()].filter((item) => item.id !== id);
  if (!persist(saved, rest)) {
    toast("Couldn't save the video queue. Check device storage.", {
      tone: "error",
    });
    return;
  }
  jobs.delete(id);
  const active = controllers.get(id);
  active?.abort(new DOMException("Download cancelled", "AbortError"));
  emit();
  if (!active) void cleanup(id);
}
export async function deleteVideoDownload(id: string) {
  init();
  if (!validVideoId(id)) return;
  const next = { ...saved };
  delete next[id];
  if (!persist(next)) {
    toast("Couldn't update saved videos. Check device storage.", {
      tone: "error",
    });
    return;
  }
  saved = next;
  emit();
  await cleanup(id);
}
async function cleanup(id: string) {
  try {
    const cache = await caches.open(VIDEO_CACHE);
    const prefix = new URL(offlinePrefix(id), location.origin).href;
    const keys = await cache.keys();
    await Promise.allSettled(
      keys
        .filter((key) => key.url.startsWith(prefix))
        .map((key) => cache.delete(key)),
    );
  } catch {
    /* Metadata already removed; cleanup can be retried later. */
  }
}
async function waitForPlayback(job: VideoJob, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!playbackActive) return;
  job.waitingForPlayback = true;
  emit();
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      playbackWaiters.delete(finish);
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const cancel = () => {
      playbackWaiters.delete(finish);
      reject(signal.reason);
    };
    playbackWaiters.add(finish);
    signal.addEventListener("abort", cancel, { once: true });
  });
  job.waitingForPlayback = false;
  emit();
  signal.throwIfAborted();
}
async function request(url: string, signal: AbortSignal) {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    // Relay assets are cross-origin; a custom header would cause a failing CORS preflight.
    headers:
      new URL(url, location.origin).origin === location.origin
        ? { "x-mr-download": "1" }
        : {},
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok || response.status !== 200 || response.type === "opaque") {
    await response.body?.cancel().catch(() => {});
    throw new Error(
      response.status === 403
        ? "The source link expired. Remove this item and download it again."
        : `The media server returned HTTP ${response.status}. Retry the download.`,
    );
  }
  return response;
}
async function readBounded(response: Response, max: number) {
  if (Number(response.headers.get("content-length")) > max) {
    await response.body?.cancel();
    throw new Error("This media resource is too large to download safely.");
  }
  if (!response.body)
    throw new Error("The source returned an empty media resource.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max)
        throw new Error("This media resource is too large to download safely.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return new Blob(chunks as BlobPart[], {
    type: response.headers.get("content-type") ?? "application/octet-stream",
  });
}
async function ensureSpace(bytes: number) {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (
    estimate?.quota &&
    estimate.quota - (estimate.usage ?? 0) < bytes + HEADROOM
  )
    throw new DOMException(
      "Not enough storage. Delete some downloads and retry.",
      "QuotaExceededError",
    );
}
async function run(job: VideoJob) {
  const controller = new AbortController();
  controllers.set(job.id, controller);
  const signal = controller.signal;
  job.state = "downloading";
  job.done = 0;
  job.bytes = 0;
  job.waitingForPlayback = false;
  persist();
  emit();
  let workerError: unknown;
  try {
    const cache = await caches.open(VIDEO_CACHE);
    let plan: OfflinePlan;
    const previous = await cache.match(planKey(job.id));
    if (previous)
      plan = validateOfflinePlan(
        await previous.json(),
        job.id,
        location.origin,
      );
    else {
      await waitForPlayback(job, signal);
      const media = await loadMedia(job.episode.id, job.audio, signal);
      signal.throwIfAborted();
      plan = await prepareOfflineHls(
        media,
        job,
        job.id,
        signal,
        async (url, innerSignal) => {
          await waitForPlayback(job, innerSignal);
          const blob = await readBounded(
            await request(url, innerSignal),
            1024 * 1024,
          );
          return blob.text();
        },
        location.origin,
      );
      await cache.put(planKey(job.id), Response.json(plan));
    }
    job.total = plan.resources.length;
    emit();
    let cursor = 0;
    let checkpoint = Promise.resolve();
    const savePlan = () => {
      checkpoint = checkpoint.then(() =>
        cache.put(planKey(job.id), Response.json(plan)),
      );
      return checkpoint;
    };
    const worker = async () => {
      try {
        for (;;) {
          signal.throwIfAborted();
          // After a failure, stop taking new files but let transfers in flight be saved.
          if (workerError) return;
          const asset = plan.resources[cursor++];
          if (!asset) return;
          await waitForPlayback(job, signal);
          const hit = await cache.match(asset.key);
          let bytes: number;
          if (hit)
            bytes =
              Number(hit.headers.get("x-mr-bytes")) ||
              (await readBounded(hit, MAX_SEGMENT)).size;
          else {
            await ensureSpace(2 * 1024 * 1024);
            const response = await request(asset.source, signal);
            const blob = await readBounded(
              response,
              asset.keyFile ? 16 : MAX_SEGMENT,
            );
            signal.throwIfAborted();
            bytes = blob.size;
            if (!bytes || (asset.keyFile && bytes !== 16))
              throw new Error("The source returned an invalid media file.");
            await ensureSpace(bytes);
            await cache.put(
              asset.key,
              new Response(blob, {
                headers: {
                  "Content-Type": blob.type,
                  "Content-Length": String(bytes),
                  "x-mr-bytes": String(bytes),
                },
              }),
            );
          }
          signal.throwIfAborted();
          plan.sizes[asset.key] = bytes;
          job.done++;
          job.bytes += bytes;
          emit();
          if (job.done % 16 === 0) await savePlan();
        }
      } catch (error) {
        if (!signal.aborted) workerError ??= error;
        throw error;
      }
    };
    await Promise.allSettled(
      Array.from({ length: Math.min(5, plan.resources.length) }, worker),
    );
    await checkpoint;
    if (workerError) throw workerError;
    signal.throwIfAborted();
    for (const playlist of plan.playlists)
      await cache.put(
        playlist.key,
        new Response(playlist.text, {
          headers: { "Content-Type": "application/vnd.apple.mpegurl" },
        }),
      );
    const keys = [
      ...plan.resources.map((resource) => resource.key),
      ...plan.playlists.map((playlist) => playlist.key),
    ];
    const present = new Set((await cache.keys()).map((request) => request.url));
    for (const key of keys)
      if (!present.has(new URL(key, location.origin).href))
        throw new Error("Some media files weren't saved. Retry the download.");
    signal.throwIfAborted();
    const entry: SavedVideo = {
      id: job.id,
      anime: job.anime,
      episode: job.episode,
      audio: job.audio,
      quality: job.quality,
      ...(job.audioTrack ? { audioTrack: job.audioTrack } : {}),
      actualHeight: plan.actualHeight,
      bytes: job.bytes,
      at: Date.now(),
      media: plan.media,
      keys,
    };
    const next = { ...saved, [entry.id]: entry };
    const rest = [...jobs.values()].filter((item) => item.id !== job.id);
    if (!persist(next, rest))
      throw new DOMException(
        "Couldn't save the video index. Free device storage and retry.",
        "QuotaExceededError",
      );
    saved = next;
    jobs.delete(job.id);
    window.dispatchEvent(new CustomEvent("mr:video-downloaded"));
  } catch (error) {
    const current = jobs.get(job.id);
    if (current && !["paused", "queued"].includes(current.state)) {
      current.state = "failed";
      current.error =
        error instanceof Error
          ? error.message
          : "Couldn't download this video. Retry when connected.";
    }
  } finally {
    if (controllers.get(job.id) === controller) controllers.delete(job.id);
    if (!jobs.has(job.id) && !saved[job.id]) await cleanup(job.id);
    job.waitingForPlayback = false;
    persist();
    emit();
  }
}
async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = [...jobs.values()].find((item) => item.state === "queued");
      if (!job) break;
      await run(job);
    }
  } finally {
    running = false;
  }
}
export async function getOfflineVideo(id: string): Promise<SavedVideo> {
  init();
  const entry = saved[id];
  if (!entry) throw new Error("This video isn't downloaded on this device.");
  if (typeof caches === "undefined")
    throw new Error(
      "Offline video needs browser storage. Open the hosted HTTPS app to use saved videos.",
    );
  const cache = await caches.open(VIDEO_CACHE);
  const present = new Set((await cache.keys()).map((request) => request.url));
  for (const key of entry.keys)
    if (!present.has(new URL(key, location.origin).href))
      throw new Error(
        "Some saved video files are missing. Delete this download and save it again.",
      );
  return entry;
}
