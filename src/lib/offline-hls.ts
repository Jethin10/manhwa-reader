import type { PlaybackMedia } from "./anime-playback";

export type VideoDownloadOptions = {
  audio: "sub" | "dub";
  quality: "480" | "720" | "1080" | "2160" | "best";
  /** Exact HLS NAME or LANGUAGE. Omit to use the source's preferred/default track. */
  audioTrack?: string;
};
export type OfflineResource = {
  source: string;
  key: string;
  keyFile?: boolean;
};
export type OfflinePlan = {
  version: 1;
  id: string;
  resources: OfflineResource[];
  playlists: { key: string; text: string }[];
  media: PlaybackMedia;
  actualHeight: number;
  duration: number;
  sizes: Record<string, number>;
};

export const VIDEO_CACHE = "video-downloads";
export const validVideoId = (id: unknown): id is string =>
  typeof id === "string" && /^v-[a-f0-9-]{32,40}$/.test(id);
export const offlinePrefix = (id: string) => `/offline-media/${id}/`;
export const planKey = (id: string) => `${offlinePrefix(id)}plan.json`;

/** Only ordinary HTTPS assets and this app's existing signed stream proxy are fetched. */
export function mediaResourceUrl(raw: string, base: string): string {
  const url = new URL(raw, base);
  const origin = new URL(base).origin;
  if (url.username || url.password || url.hash)
    throw new Error("This stream uses an unsupported media URL.");
  if (
    url.origin === origin &&
    url.pathname === "/api/anime/stream" &&
    ["http:", "https:"].includes(url.protocol)
  )
    return url.href;
  if (
    url.protocol !== "https:" ||
    url.port ||
    /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(
      url.hostname,
    ) ||
    url.hostname.includes(":") ||
    url.hostname.endsWith(".local")
  )
    throw new Error("This stream uses an unsupported media URL.");
  return url.href;
}

function attributes(line: string) {
  const result: Record<string, string> = {};
  const body = line.slice(line.indexOf(":") + 1);
  const pattern = /([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]*)/g;
  for (const match of body.matchAll(pattern))
    result[match[1]] = match[2].startsWith('"')
      ? match[2].slice(1, -1)
      : match[2];
  return result;
}
function replaceUri(line: string, value: string) {
  return line.replace(/URI="[^"]*"/, `URI="${value}"`);
}
function defaultAudio(line: string) {
  for (const name of ["DEFAULT", "AUTOSELECT"])
    line = new RegExp(`(?:^|[:,])${name}=`).test(line)
      ? line.replace(new RegExp(`${name}=[^,]*`), `${name}=YES`)
      : `${line},${name}=YES`;
  return line;
}

/** Read only the master manifest when the download sheet is opened. */
export async function inspectHlsDownloadOptions(
  src: string,
  signal: AbortSignal,
) {
  const url = mediaResourceUrl(src, `${location.origin}/`);
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Download options couldn't load. Retry when connected.");
  }
  if (!response.body)
    throw new Error("This source doesn't offer supported HLS downloads.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1024 * 1024)
        throw new Error("This source's playlist is too large.");
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  if (!text.trimStart().startsWith("#EXTM3U"))
    throw new Error("This source doesn't offer supported HLS downloads.");
  const heights = new Set<number>();
  const tracks = new Map<string, { name: string; language: string }>();
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const height = Number(attributes(line).RESOLUTION?.split("x")[1]);
      if (Number.isFinite(height) && height > 0) heights.add(height);
    }
    if (line.startsWith("#EXT-X-MEDIA:")) {
      const attrs = attributes(line);
      if (attrs.TYPE === "AUDIO" && attrs.URI && attrs.NAME)
        tracks.set(attrs.NAME, {
          name: attrs.NAME,
          language: attrs.LANGUAGE ?? "",
        });
    }
  }
  return {
    heights: [...heights].sort((a, b) => a - b),
    audioTracks: [...tracks.values()],
  };
}

/** Package a single complete, explicit VOD rendition. Unsupported formats fail closed. */
export async function prepareOfflineHls(
  media: PlaybackMedia,
  options: VideoDownloadOptions,
  id: string,
  signal: AbortSignal,
  fetchText: (url: string, signal: AbortSignal) => Promise<string>,
  origin: string,
): Promise<OfflinePlan> {
  if (!validVideoId(id)) throw new Error("Invalid download identifier.");
  const prefix = offlinePrefix(id);
  const resources: OfflineResource[] = [];
  const resourceBySource = new Map<string, string>();
  const playlists: OfflinePlan["playlists"] = [];
  let duration = 0;
  const resource = (raw: string, base: string, keyFile = false) => {
    const source = mediaResourceUrl(raw, base);
    let key = resourceBySource.get(source);
    if (!key) {
      if (resources.length >= 6000)
        throw new Error(
          "This video is too large to package for offline playback.",
        );
      key = `${prefix}asset-${resources.length}`;
      resourceBySource.set(source, key);
      resources.push({ source, key, ...(keyFile ? { keyFile: true } : {}) });
    }
    return key;
  };
  const playlist = async (source: string, key: string) => {
    signal.throwIfAborted();
    const text = await fetchText(source, signal);
    if (text.length > 1024 * 1024 || !text.trimStart().startsWith("#EXTM3U"))
      throw new Error("The source did not return a supported HLS playlist.");
    return { text, key, source };
  };
  const root = await playlist(
    mediaResourceUrl(media.src, `${origin}/`),
    `${prefix}index.m3u8`,
  );
  const processMedia = async (
    source: string,
    key: string,
    supplied?: string,
  ) => {
    const text = supplied ?? (await playlist(source, key)).text;
    if (!/^#EXT-X-ENDLIST\s*$/m.test(text))
      throw new Error(
        "Only complete on-demand videos can be downloaded. Live streams are not supported.",
      );
    if (
      /#EXT-X-(?:BYTERANGE|PART|PRELOAD-HINT|STREAM-INF|DEFINE|SESSION-KEY)/.test(
        text,
      )
    )
      throw new Error(
        "This stream's playlist format is not supported for offline playback.",
      );
    let seconds = 0;
    let segments = 0;
    const lines = text.split(/\r?\n/).map((raw) => {
      const line = raw.trim();
      if (!line) return "";
      if (!line.startsWith("#")) {
        segments++;
        return resource(line, source);
      }
      if (line.startsWith("#EXTINF:")) {
        const value = Number.parseFloat(line.slice(8));
        if (!Number.isFinite(value) || value < 0)
          throw new Error("Invalid segment duration.");
        seconds += value;
      }
      if (line.startsWith("#EXT-X-KEY:")) {
        const attrs = attributes(line);
        if (attrs.METHOD === "NONE") return line;
        if (
          attrs.METHOD !== "AES-128" ||
          (attrs.KEYFORMAT && attrs.KEYFORMAT !== "identity") ||
          !attrs.URI
        )
          throw new Error(
            "DRM-protected streams cannot be downloaded by this app.",
          );
        return replaceUri(line, resource(attrs.URI, source, true));
      }
      if (line.startsWith("#EXT-X-MAP:")) {
        const attrs = attributes(line);
        if (attrs.BYTERANGE || !attrs.URI)
          throw new Error(
            "Byte-range initialization files are not supported offline.",
          );
        return replaceUri(line, resource(attrs.URI, source));
      }
      // Unknown resource-bearing tags must never leave an online dependency behind.
      if (line.includes('URI="'))
        throw new Error(
          "This stream contains an unsupported offline resource.",
        );
      return line;
    });
    if (!segments || seconds > 86400)
      throw new Error("Invalid or oversized video playlist.");
    duration = Math.max(duration, seconds);
    playlists.push({ key, text: lines.join("\n") });
  };

  let actualHeight = 0;
  let selectedAudio = media.audio;
  if (root.text.includes("#EXT-X-STREAM-INF:")) {
    if (/#EXT-X-(?:SESSION-KEY|DEFINE)/.test(root.text))
      throw new Error(
        "This master playlist is not supported for offline playback.",
      );
    const lines = root.text.split(/\r?\n/).map((line) => line.trim());
    const variants = lines
      .flatMap((line, index) => {
        if (!line.startsWith("#EXT-X-STREAM-INF:")) return [];
        const attrs = attributes(line);
        const uri = lines
          .slice(index + 1)
          .find((next) => next && !next.startsWith("#"));
        const height = Number(attrs.RESOLUTION?.split("x")[1] ?? 0);
        const bandwidth = Number(
          attrs["AVERAGE-BANDWIDTH"] ?? attrs.BANDWIDTH ?? 0,
        );
        return uri ? [{ line, attrs, uri, height, bandwidth }] : [];
      })
      .sort((a, b) => a.height - b.height || a.bandwidth - b.bandwidth);
    if (!variants.length)
      throw new Error("No downloadable video rendition was found.");
    const ceiling =
      options.quality === "best" ? Infinity : Number(options.quality);
    const selected =
      variants
        .filter((variant) => !variant.height || variant.height <= ceiling)
        .at(-1);
    if (!selected)
      throw new Error(`No rendition is available within your ${options.quality}p quality limit. Choose a higher limit and retry.`);
    if (selected.attrs.VIDEO)
      throw new Error(
        "Alternate-camera streams are not supported for offline playback.",
      );
    actualHeight = selected.height;
    const rootLines = ["#EXTM3U", "#EXT-X-VERSION:7"];
    for (const type of ["AUDIO", "SUBTITLES"] as const) {
      const group = selected.attrs[type];
      if (!group) continue;
      const choices = lines
        .filter((line) => line.startsWith("#EXT-X-MEDIA:"))
        .map((line) => ({ line, attrs: attributes(line) }))
        .filter(
          ({ attrs }) => attrs.TYPE === type && attrs["GROUP-ID"] === group,
        );
      if (!choices.length)
        throw new Error(
          `The source is missing its ${type.toLowerCase()} playlist.`,
        );
      const wanted = (
        type === "AUDIO" ? (options.audioTrack ?? media.audio ?? "") : ""
      ).toLowerCase();
      const alias =
        wanted === "english" ? "en" : wanted === "japanese" ? "ja" : wanted;
      const chosen =
        choices.find(
          ({ attrs }) =>
            attrs.NAME?.toLowerCase() === wanted ||
            attrs.LANGUAGE?.toLowerCase() === alias ||
            (!!alias && attrs.LANGUAGE?.toLowerCase().startsWith(`${alias}-`)),
        ) ??
        (type === "AUDIO" && options.audioTrack
          ? undefined
          : (choices.find(({ attrs }) => attrs.DEFAULT === "YES") ??
            choices[0]));
      if (!chosen)
        throw new Error(
          `The requested audio track '${options.audioTrack}' is not available for this episode.`,
        );
      if (type === "AUDIO")
        selectedAudio = chosen.attrs.NAME ?? chosen.attrs.LANGUAGE;
      if (chosen.attrs.URI) {
        const key = `${prefix}${type.toLowerCase()}.m3u8`;
        await processMedia(
          mediaResourceUrl(chosen.attrs.URI, root.source),
          key,
        );
        rootLines.push(
          replaceUri(
            type === "AUDIO" ? defaultAudio(chosen.line) : chosen.line,
            key,
          ),
        );
      } else {
        if (type === "AUDIO" && options.audioTrack)
          throw new Error(
            "This source does not expose separately downloadable audio tracks.",
          );
        rootLines.push(chosen.line);
      }
    }
    if (
      selected.attrs["CLOSED-CAPTIONS"] &&
      selected.attrs["CLOSED-CAPTIONS"] !== "NONE"
    )
      rootLines.push(
        ...lines.filter(
          (line) =>
            line.startsWith("#EXT-X-MEDIA:") &&
            attributes(line).TYPE === "CLOSED-CAPTIONS" &&
            attributes(line)["GROUP-ID"] ===
              selected.attrs["CLOSED-CAPTIONS"] &&
            !attributes(line).URI,
        ),
      );
    await processMedia(
      mediaResourceUrl(selected.uri, root.source),
      `${prefix}video.m3u8`,
    );
    rootLines.push(selected.line, `${prefix}video.m3u8`);
    playlists.push({ key: root.key, text: rootLines.join("\n") });
  } else {
    if (options.audioTrack)
      throw new Error(
        "This source does not list downloadable audio languages.",
      );
    await processMedia(root.source, root.key, root.text);
  }
  const tracks = media.tracks.slice(0, 20).map((track) => ({
    ...track,
    src: resource(track.src, root.source),
  }));
  return {
    version: 1,
    id,
    resources,
    playlists,
    actualHeight,
    duration,
    sizes: {},
    media: {
      src: root.key,
      tracks,
      audio: selectedAudio,
      servers: [],
      ...(media.skip ? { skip: media.skip } : {}),
    },
  };
}

/** Cached resume plans are untrusted input too. Keep every writable key inside its package. */
export function validateOfflinePlan(
  value: unknown,
  id: string,
  origin: string,
): OfflinePlan {
  const plan = value as OfflinePlan;
  const prefix = offlinePrefix(id);
  const key = (value: unknown) =>
    typeof value === "string" &&
    value.startsWith(prefix) &&
    !value.slice(prefix.length).includes("/") &&
    !value.includes("..");
  if (
    !validVideoId(id) ||
    !plan ||
    plan.version !== 1 ||
    plan.id !== id ||
    !Array.isArray(plan.resources) ||
    plan.resources.length > 6000 ||
    !Array.isArray(plan.playlists) ||
    !plan.playlists.length ||
    plan.playlists.length > 5 ||
    !plan.media ||
    plan.media.src !== `${prefix}index.m3u8` ||
    !Array.isArray(plan.media.tracks) ||
    plan.media.tracks.length > 20 ||
    !plan.media.tracks.every((track) => key(track.src)) ||
    !plan.resources.every(
      (resource) =>
        key(resource.key) &&
        typeof resource.source === "string" &&
        resource.source.length <= 8192 &&
        mediaResourceUrl(resource.source, `${origin}/`),
    ) ||
    !plan.playlists.every(
      (playlist) =>
        key(playlist.key) &&
        typeof playlist.text === "string" &&
        playlist.text.length <= 1024 * 1024,
    )
  )
    throw new Error(
      "The saved download plan is invalid. Remove this item and download it again.",
    );
  const keys = new Set([
    ...plan.resources.map((resource) => resource.key),
    ...plan.playlists.map((playlist) => playlist.key),
  ]);
  if (
    keys.size !== plan.resources.length + plan.playlists.length ||
    !keys.has(plan.media.src) ||
    plan.media.tracks.some((track) => !keys.has(track.src)) ||
    plan.playlists.some(
      ({ text }) =>
        !text.startsWith("#EXTM3U") ||
        text.split(/\r?\n/).some((raw) => {
          const line = raw.trim();
          if (!line) return false;
          if (!line.startsWith("#")) return !keys.has(line);
          return [...line.matchAll(/URI="([^"]+)"/g)].some(
            (match) => !keys.has(match[1]),
          );
        }),
    )
  )
    throw new Error(
      "The saved download plan has incomplete resources. Remove this item and download it again.",
    );
  return {
    ...plan,
    sizes: plan.sizes && typeof plan.sizes === "object" ? plan.sizes : {},
  };
}
