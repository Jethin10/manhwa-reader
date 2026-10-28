"use client";
import type { AnimeServer } from "./anime";
import type { PlaybackMedia } from "./anime-playback";
const requests = new Map<
  string,
  { until: number; promise: Promise<unknown> }
>();
async function cached<T>(url: string, ttl: number): Promise<T> {
  const previous = requests.get(url);
  if (previous && previous.until > Date.now())
    return previous.promise as Promise<T>;
  const promise = fetch(url)
    .then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Playback unavailable.");
      return data as T;
    })
    .catch((e) => {
      requests.delete(url);
      throw e;
    });
  requests.set(url, { until: Date.now() + ttl, promise });
  if (requests.size > 48) requests.delete(requests.keys().next().value!);
  return promise;
}
export const loadServers = (episode: string) =>
  cached<{ servers: AnimeServer[] }>(
    `/api/anime/servers?episode=${episode}`,
    60000,
  ).then((d) => d.servers);
export const loadMedia = (episode: string, audio: "sub" | "dub") =>
  cached<PlaybackMedia>(
    `/api/anime/media?episode=${episode}&audio=${audio}`,
    60000,
  );
export function clearPlaybackCache() {
  requests.clear();
}
