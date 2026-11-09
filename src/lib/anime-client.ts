"use client";
import type { AnimeServer } from "./anime";
import type { PlaybackMedia } from "./anime-playback";
const requests = new Map<
  string,
  { until: number; promise: Promise<unknown>; controller: AbortController }
>();
async function cached<T>(url: string, ttl: number): Promise<T> {
  const previous = requests.get(url);
  if (previous && previous.until > Date.now())
    return previous.promise as Promise<T>;
  const controller = new AbortController();
  const promise = fetch(url, {
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
  })
    .then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Playback unavailable.");
      if (requests.get(url)?.promise === promise)
        requests.get(url)!.until = Date.now() + ttl;
      return data as T;
    })
    .catch((e) => {
      if (requests.get(url)?.promise === promise) requests.delete(url);
      throw e;
    });
  // In-flight work is shared until its deadline, then successful results get a full TTL.
  requests.set(url, { until: Infinity, promise, controller });
  if (requests.size > 48) {
    const oldest = requests.keys().next().value!;
    requests.get(oldest)?.controller.abort();
    requests.delete(oldest);
  }
  return promise;
}
export const loadServers = (episode: string) =>
  cached<{ servers: AnimeServer[] }>(
    `/api/anime/servers?episode=${encodeURIComponent(episode)}`,
    60000,
  ).then((d) => d.servers);
export const loadMedia = (
  episode: string,
  audio: "sub" | "dub",
  signal?: AbortSignal,
) => {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const pending = cached<PlaybackMedia>(
    `/api/anime/media?episode=${encodeURIComponent(episode)}&audio=${audio}`,
    60000,
  );
  if (!signal) return pending;
  // Cancel this consumer immediately while preserving work shared with playback.
  return new Promise<PlaybackMedia>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    pending
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
};
export const loadDelivery = (episode: string, audio: "sub" | "dub") =>
  cached<{ servers: PlaybackMedia["servers"] }>(
    `/api/anime/media?episode=${encodeURIComponent(episode)}&audio=${audio}&delivery=1`,
    60000,
  ).then((data) => data.servers);
export function clearPlaybackCache() {
  for (const request of requests.values()) request.controller.abort();
  requests.clear();
}
