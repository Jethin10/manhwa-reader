import type { Movie } from "./movie-types";

export type MoviePlaybackOptions = {
  autoplay: boolean;
  quality: "auto" | "2160" | "1080" | "720" | "480";
  subtitles: string;
  startAt: number;
  seek: number;
};
export type MovieProvider = {
  id: string;
  name: string;
  origin: string;
  requiresTmdb?: boolean;
  progress?: "cinesrc" | "vidlink" | "vidsrc";
  qualityPreference?: boolean;
  /**
   * Refuses to play in a sandboxed frame. The Android app runs it unsandboxed (its native
   * shell drops popups and keeps the app page from being navigated away); the website can't.
   */
  noSandbox?: boolean;
  note: string;
  url: (movie: Movie, options: MoviePlaybackOptions) => string;
};
function url(
  origin: string,
  path: string,
  values: Record<string, string | number | boolean> = {},
) {
  const result = new URL(path, origin);
  for (const [key, value] of Object.entries(values))
    result.searchParams.set(key, String(value));
  return result.href;
}
// Fixed, reviewed origins. Never proxy arbitrary URLs or execute provider scripts in our origin.
export const MOVIE_PROVIDERS: MovieProvider[] = [
  {
    id: "cinesrc",
    name: "CineSrc",
    origin: "https://cinesrc.st",
    requiresTmdb: true,
    progress: "cinesrc",
    qualityPreference: true,
    note: "Resume, preferred resolution and player events. Availability varies by title.",
    url: (m, o) =>
      url("https://cinesrc.st", `/embed/movie/${m.tmdbId}`, {
        autoplay: o.autoplay,
        t: Math.floor(o.startAt),
        seek: o.seek,
        ...(o.quality !== "auto" ? { quality: o.quality } : {}),
      }),
  },
  {
    id: "vidlink",
    name: "VidLink",
    origin: "https://vidlink.pro",
    requiresTmdb: true,
    progress: "vidlink",
    note: "Resume and progress support. Quality and audio are inside its player.",
    url: (m, o) =>
      url("https://vidlink.pro", `/movie/${m.tmdbId}`, {
        autoplay: o.autoplay,
        startAt: Math.floor(o.startAt),
        primaryColor: "0a84ff",
      }),
  },
  {
    id: "vidsrc-sh",
    name: "VidSrc.sh",
    origin: "https://vidsrc.sh",
    progress: "vidsrc",
    noSandbox: true,
    note: "IMDb matching and reported quality. Playback quality needs confirmation in the player.",
    url: (m, o) =>
      url("https://vidsrc.sh", `/embed/movie/${m.id}`, {
        autoplay: o.autoplay ? 1 : 0,
        startAt: Math.floor(o.startAt),
        ds_lang: o.subtitles,
      }),
  },
  {
    id: "embedwave",
    name: "EmbedWave",
    origin: "https://embedwave.cc",
    requiresTmdb: true,
    note: "Advertises no injected ads. Progress is not exposed to this app.",
    url: (m, o) =>
      url("https://embedwave.cc", `/embed/movie/${m.tmdbId}`, {
        autoplay: o.autoplay,
      }),
  },
  {
    id: "autoembed",
    name: "AutoEmbed",
    origin: "https://autoembed.me",
    note: "Free IMDb-based fallback. Progress and download support aren't exposed.",
    url: (m) => url("https://autoembed.me", `/movie/imdb/${m.id}`),
  },
  {
    id: "vidzee",
    name: "VidZee",
    origin: "https://player.vidzee.wtf",
    requiresTmdb: true,
    note: "Multiple upstream sources. Audio and quality depend on the title.",
    url: (m) => url("https://player.vidzee.wtf", `/embed/movie/${m.tmdbId}`),
  },
  {
    id: "vidsrc-mov",
    name: "VidSrc.mov",
    origin: "https://vidsrc.mov",
    noSandbox: true,
    note: "IMDb-based movie player with quality selection inside its controls.",
    url: (m) => url("https://vidsrc.mov", `/embed/movie/${m.id}`),
  },
  {
    id: "multiembed",
    name: "MultiEmbed",
    origin: "https://multiembed.mov",
    note: "Ad-supported, multiple hosts. Popup blocking follows your playback settings.",
    url: (m) => url("https://multiembed.mov", "/", { video_id: m.id }),
  },
  {
    id: "primesrc",
    name: "PrimeSrc",
    origin: "https://primesrc.me",
    note: "Alternative multi-server movie player. Availability is unverified.",
    url: (m) => url("https://primesrc.me", "/embed/movie", { imdb: m.id }),
  },
  {
    id: "vidfast",
    name: "VidFast",
    origin: "https://vidfast.vc",
    note: "Movie player with subtitles and resume parameters; availability varies.",
    url: (m, o) =>
      url("https://vidfast.vc", `/movie/${m.id}`, {
        autoPlay: o.autoplay,
        startAt: Math.floor(o.startAt),
        sub: o.subtitles,
      }),
  },
];

export const RESEARCH_MOVIE_PROVIDERS = [
  ["MalluMV", "Telugu, Tamil, Hindi, Malayalam, Kannada"],
  ["AllMovieLand", "Telugu, Tamil, Hindi, English"],
  ["MovieBox", "Telugu listed in community metadata"],
  ["MovieBlast", "Telugu listed in community metadata"],
  ["CinemaCity", "Language claims differ between community adapters"],
  ["Castle", "Language claims differ between community adapters"],
  [
    "Einthusan",
    "Telugu category; third-party playback integration not established",
  ],
  ["HDHub4u", "Hindi and English community adapters"],
  ["VegaMovies", "Hindi and English community adapters"],
  ["MoviesMod", "Hindi and English community adapters"],
  ["MoviesDrive", "Hindi and English community adapters"],
  ["4KHDHub", "Resolution and audio need verification"],
  ["FlixIndia", "Hindi and English community adapters"],
  ["HindMoviez", "Hindi and English community adapters"],
  ["HDMovie2", "Hindi movie community adapter"],
  ["CineStream", "Hindi and English community adapters"],
  ["Movies4u", "Hindi and Tamil community metadata"],
  ["Streamflix", "Hindi claimed by adapter description"],
  ["DesiFlix", "Indian movies and Hindi series"],
  ["RedFlix", "Language claims differ between community adapters"],
  ["MultiMovies", "Hindi multi-host community adapter"],
  ["NetMirror", "Community adapter exists; catalog parity is unverified"],
  ["Viduki", "Multilingual embeds; integration requires further verification"],
  ["VidSrc.pk", "Documented provider-list endpoint returned 404"],
  ["AnyPlay", "Documented server-list endpoint returned 403"],
  ["iBOMMA / Bappam", "Telugu network; no verified integration API"],
  [
    "TamilMV / TamilBlasters / TamilRockers",
    "Regional sites; no verified integration API",
  ],
] as const;

export function availableProviders(
  movie: Movie,
  disabled: string[],
  preferred = "auto",
) {
  const usable = MOVIE_PROVIDERS.filter(
    (p) => !disabled.includes(p.id) && (!p.requiresTmdb || !!movie.tmdbId),
  );
  return [...usable].sort(
    (a, b) => Number(b.id === preferred) - Number(a.id === preferred),
  );
}

/** Release labels for a copy filmed in a cinema rather than taken from the real release. */
export function isCameraCopy(quality: string | undefined) {
  return /\b(cam|hdcam|camrip|ts|hdts|telesync|tc|telecine)\b/i.test(
    quality ?? "",
  );
}

const CAMERA_RELEASE =
  /\b(cam|camrip|hdcam|hqcam|ts|hdts|telesync|tc|hdtc|telecine|pdvd|predvd|scr|screener|dvdscr)\b/i;
const REAL_RELEASE =
  /\b(web-?dl|webrip|web|bluray|blu-ray|bdrip|brrip|bdremux|remux|uhd|hdtv|dvdrip|amzn|nf|dsnp|hmax|atvp)\b/i;
/** What a public release name says about its source. */
export function classifyRelease(name: string): "camera" | "real" | "unknown" {
  if (CAMERA_RELEASE.test(name)) return "camera";
  if (REAL_RELEASE.test(name)) return "real";
  return "unknown";
}

export type CopyVerdict = "real" | "camera" | "unknown";
/** Whether a real (digital or disc) release of the movie exists anywhere. */
export type ReleaseStatus = {
  status: "real" | "camera" | "none" | "unknown";
  /** Best resolution among real releases, e.g. "4K" or "1080p". */
  best?: string;
};
/** Viewer reports per provider: when it was last called a camera copy or watched fine. */
export type CopyReports = Record<string, { camera?: number; ok?: number }>;
export type MovieCopies = {
  release: ReleaseStatus;
  providers: Record<string, { copy: CopyVerdict; why: string }>;
};

/** Providers that play VidSrc.sh's copy and so share its quality label. */
const VIDSRC_COPY = ["vidsrc-sh", "vidsrc-mov"];

/**
 * Which copy each provider is likely to play, strongest evidence first:
 * no real release anywhere, then the latest viewer report, then VidSrc.sh's label.
 */
export function judgeCopies(
  providerIds: string[],
  release: ReleaseStatus,
  label: string | undefined,
  reports: CopyReports,
): MovieCopies["providers"] {
  const out: MovieCopies["providers"] = {};
  for (const id of providerIds) {
    const r = reports[id] ?? {};
    if (release.status === "camera")
      out[id] = { copy: "camera", why: "Only camera recordings have been released so far" };
    else if ((r.camera ?? 0) > (r.ok ?? 0))
      out[id] = { copy: "camera", why: "Reported as a camera recording" };
    else if (r.ok)
      out[id] = { copy: "real", why: "Watched without a camera-copy report" };
    else if (label && VIDSRC_COPY.includes(id))
      out[id] = isCameraCopy(label)
        ? { copy: "camera", why: `VidSrc.sh labels it ${label}` }
        : { copy: "real", why: `VidSrc.sh labels it ${label}` };
    else out[id] = { copy: "unknown", why: "Not checked yet" };
  }
  return out;
}

/**
 * Order for playback: real copies, then unchecked sources, then camera copies.
 * Within a tier the existing order (preferred provider first) is kept.
 */
export function rankProviders(
  providers: MovieProvider[],
  copies: MovieCopies["providers"] | undefined,
  cameraCopies: string[],
  unsandboxed = false,
) {
  const tier = (p: MovieProvider) =>
    // Can't play here at all, so after everything that can.
    p.noSandbox && !unsandboxed
      ? -1
      : cameraCopies.includes(p.id)
      ? 0
      : copies?.[p.id]?.copy === "real"
        ? 2
        : copies?.[p.id]?.copy === "camera"
          ? 0
          : 1;
  return [...providers].sort((a, b) => tier(b) - tier(a));
}

const CAMERA_KEY = "mr:movie-camera-copies";
/** Providers the viewer flagged as serving a camera copy, per movie. */
export function getCameraCopies(movieId: string): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(CAMERA_KEY) ?? "{}");
    const ids = all?.[movieId];
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function flagCameraCopy(movieId: string, providerId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(CAMERA_KEY) ?? "{}") ?? {};
    const ids = new Set<string>(Array.isArray(all[movieId]) ? all[movieId] : []);
    ids.add(providerId);
    delete all[movieId];
    all[movieId] = [...ids];
    // Keep the newest 200 movies.
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete all[k];
    localStorage.setItem(CAMERA_KEY, JSON.stringify(all));
  } catch {}
}

export type MoviePlayerEvent = {
  event: "play" | "pause" | "timeupdate" | "ended" | "error";
  time?: number;
  duration?: number;
};
/** Called only after checking the active iframe window and exact origin. */
export function decodeMovieEvent(
  provider: MovieProvider,
  payload: unknown,
  movie: Movie,
): MoviePlayerEvent | null {
  let raw = payload;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const outer = raw as Record<string, unknown>;
  let event: unknown, time: unknown, duration: unknown;
  if (
    provider.progress === "cinesrc" &&
    typeof outer.type === "string" &&
    outer.type.startsWith("cinesrc:")
  ) {
    event = outer.type.slice(8);
    time = outer.currentTime;
    duration = outer.duration;
  } else if (
    provider.progress === "vidlink" &&
    outer.type === "PLAYER_EVENT" &&
    outer.data &&
    typeof outer.data === "object"
  ) {
    const data = outer.data as Record<string, unknown>;
    const id = data.tmdbId ?? data.mtmdbId;
    if (id !== undefined && String(id) !== movie.tmdbId) return null;
    event = data.event;
    time = data.currentTime;
    duration = data.duration;
  } else if (
    provider.progress === "vidsrc" &&
    outer.type === "PLAYER_EVENT" &&
    outer.data &&
    typeof outer.data === "object"
  ) {
    const data = outer.data as Record<string, unknown>;
    const info = data.player_info as Record<string, unknown> | undefined;
    if (info?.imdb && info.imdb !== movie.id) return null;
    if (info?.tmdb && movie.tmdbId && String(info.tmdb) !== movie.tmdbId)
      return null;
    const states: Record<string, string> = {
      playing: "play",
      paused: "pause",
      completed: "ended",
      seeked: "timeupdate",
    };
    event = states[String(data.player_status)];
    time = data.player_progress;
    duration = data.player_duration;
  } else return null;
  if (
    !["play", "pause", "timeupdate", "ended", "error"].includes(String(event))
  )
    return null;
  const valid = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 86400;
  if (event === "timeupdate" && !valid(time)) return null;
  if (time !== undefined && !valid(time)) return null;
  if (duration !== undefined && !valid(duration)) return null;
  if (valid(time) && valid(duration) && duration > 0 && time > duration + 5)
    return null;
  return {
    event: event as MoviePlayerEvent["event"],
    ...(valid(time) ? { time } : {}),
    ...(valid(duration) ? { duration } : {}),
  };
}
