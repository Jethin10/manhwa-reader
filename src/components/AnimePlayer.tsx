/* eslint-disable @next/next/no-img-element -- Images use the shared resizing proxy. */
"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Anime, AnimeServer, Episode } from "@/lib/anime";
import {
  lastWatch,
  markWatched,
  savedWatch,
  saveWatch,
  useWatched,
} from "./AnimeLibrary";
import { CheckIcon, PlayIcon } from "./Icons";
import {
  clearPlaybackCache,
  loadDelivery,
  loadMedia,
  loadServers,
} from "@/lib/anime-client";
import { saveDataEnabled } from "@/lib/playback-policy";
import type { PlaybackMedia } from "@/lib/anime-playback";
import { CollectionPicker } from "./CollectionPicker";
import { Check } from "./PreferenceControls";
import { usePreferences, updatePreferences } from "@/lib/preferences";
import { coverSrc } from "@/lib/images";
import VideoDownloadButton from "./VideoDownloadSheet";
const AdaptiveVideo = dynamic(() => import("./AdaptiveVideo"), {
  ssr: false,
  loading: () => (
    <p role="status" className="text-xs text-secondary">
      Preparing video controls...
    </p>
  ),
});

export function AnimePlayer({
  anime,
  episodes,
  initialEpisode,
  initialAudio,
  initialServers,
  bootstrapEpisodeId,
}: {
  anime: Anime;
  episodes: Episode[];
  initialEpisode: string;
  initialAudio?: "sub" | "dub";
  initialServers: AnimeServer[];
  bootstrapEpisodeId: string;
}) {
  const startingEpisode =
    episodes.find((e) => e.id === initialEpisode)?.id ?? episodes[0]?.id ?? "";
  const bootstrap =
    startingEpisode === bootstrapEpisodeId && initialServers.length > 0;
  const [episodeId, setEpisodeId] = useState(
    episodes.find((e) => e.id === initialEpisode)?.id ?? episodes[0]?.id ?? "",
  );
  const prefs = usePreferences();
  const watched = useWatched(anime.id);
  // Opened without a chosen episode: pick up where the last session stopped.
  useEffect(() => {
    if (initialEpisode) return;
    const last = lastWatch(anime.id);
    if (!last || !episodes.some((e) => e.id === last.episodeId)) return;
    if (!initialAudio) setAudioOverride(last.language);
    if (last.episodeId !== episodeId) chooseEpisode(last.episodeId);
    // Only on arrival; later episode changes are the viewer's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anime.id]);
  const [audioOverride, setAudioOverride] = useState(initialAudio);
  const language = audioOverride ?? prefs.audio;
  function setLanguage(audio: "sub" | "dub") {
    setAudioOverride(audio);
    updatePreferences({ audio });
  }
  const autoNext = prefs.autoNext;
  const setAutoNext = (autoNext: boolean) => updatePreferences({ autoNext });
  const [servers, setServers] = useState<AnimeServer[]>(
    bootstrap ? initialServers : [],
  );
  const [serverName, setServerName] = useState("");
  const [loading, setLoading] = useState(episodes.length > 0 && !bootstrap),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0),
    [filter, setFilter] = useState("");
  const [theater, setTheater] = useState(false);
  const player = useRef<HTMLDivElement>(null);
  const [prepared, setPrepared] = useState<{
    key: string;
    media?: PlaybackMedia;
    error?: string;
  } | null>(null);
  const [originalPlayer, setOriginalPlayer] = useState(false),
    [nativeError, setNativeError] = useState("");
  const [checking, setChecking] = useState(false);
  const [episodeWindow, setEpisodeWindow] = useState(
    Math.floor(
      Math.max(
        0,
        episodes.findIndex((e) => e.id === startingEpisode),
      ) / 50,
    ),
  );
  const index = episodes.findIndex((e) => e.id === episodeId),
    episode = episodes[index];
  const available = servers.filter((s) => s.language === language);
  const selected =
    available.find((s) => s.name === serverName && s.reachable !== false) ??
    available.find((s) => s.name === "ZokoAnime" && s.reachable !== false) ??
    available.find((s) => s.reachable !== false) ??
    available[0];
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!episodeId) return;
    if (bootstrap && episodeId === bootstrapEpisodeId && retry === 0) return;
    let active = true;
    loadServers(episodeId)
      .then((data) => {
        if (!active) return;
        setServers(data);
        setError("");
        setLoading(false);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [episodeId, retry, bootstrap, bootstrapEpisodeId]);
  const mediaKey = `${episodeId}|${language}`;
  const direct = selected?.name === "ZokoAnime" && !originalPlayer;
  const media = prepared?.key === mediaKey ? prepared.media : undefined;
  const mediaError =
    nativeError || (prepared?.key === mediaKey ? prepared.error : "");
  useEffect(() => {
    if (!direct || !episodeId || (!started && saveDataEnabled(prefs.dataSaver)))
      return;
    let active = true;
    void loadMedia(episodeId, language)
      .then((media) => {
        if (active) setPrepared({ key: `${episodeId}|${language}`, media });
      })
      .catch((e) => {
        if (active)
          setPrepared({ key: `${episodeId}|${language}`, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [direct, episodeId, language, retry, started, prefs.dataSaver]);
  useEffect(() => {
    const id = setTimeout(() => {
      void import("./AdaptiveVideo");
      void import("hls.js");
    }, 300);
    return () => clearTimeout(id);
  }, []);
  const readySrc = media?.src;
  useEffect(() => {
    if (readySrc && !saveDataEnabled(prefs.dataSaver))
      void fetch(readySrc).catch(() => {});
  }, [readySrc, prefs.dataSaver]);
  const probed = useRef("");
  const warmed = useRef("");
  function discoverDelivery() {
    if (probed.current === mediaKey || saveDataEnabled(prefs.dataSaver)) return;
    probed.current = mediaKey;
    void loadDelivery(episodeId, language)
      .then((alternatives) => {
        setPrepared((current) =>
          current?.key === mediaKey && current.media
            ? {
                ...current,
                media: {
                  ...current.media,
                  servers: [
                    current.media.servers[0],
                    ...alternatives.filter((s) => s.src !== current.media!.src),
                  ].filter((s): s is PlaybackMedia["servers"][number] => !!s),
                },
              }
            : current,
        );
      })
      .catch(() => {});
  }
  useEffect(() => {
    if (!episode || !started || !selected) return;
    saveWatch({ anime, episodeId, episodeNumber: episode.number, language });
    const url = `/anime/${anime.id}?ep=${episodeId}&audio=${language}`;
    if (`${window.location.pathname}${window.location.search}` !== url)
      window.history.replaceState(window.history.state, "", url);
  }, [anime, episode, episodeId, language, selected, started]);
  function chooseEpisode(id: string) {
    setEpisodeId(id);
    setLoading(true);
    setError("");
    setServers([]);
    setNativeError("");
    setOriginalPlayer(false);
    setEpisodeWindow(
      Math.floor(
        Math.max(
          0,
          episodes.findIndex((e) => e.id === id),
        ) / 50,
      ),
    );
  }
  function reload() {
    clearPlaybackCache();
    setNativeError("");
    setLoading(true);
    setError("");
    setRetry((n) => n + 1);
  }
  const onNativeError = useCallback(
    (message: string) => setNativeError(message),
    [],
  );
  const onProgress = useCallback(
    (time: number, duration: number) => {
      // Past the end credits counts as watched.
      if (duration > 0 && time / duration > 0.85)
        markWatched(anime.id, episodeId);
      if (episode)
        saveWatch({
          anime,
          episodeId,
          episodeNumber: episode.number,
          language,
          time,
          duration,
        });
    },
    [anime, episode, episodeId, language],
  );
  function warmNext() {
    if (saveDataEnabled(prefs.dataSaver) || document.hidden) return;
    const next = episodes[index + 1];
    if (next)
      void loadServers(next.id)
        .then((s) =>
          s.some((x) => x.name === "ZokoAnime" && x.language === language)
            ? loadMedia(next.id, language)
            : null,
        )
        .catch(() => {});
  }
  async function checkServers() {
    setChecking(true);
    try {
      const res = await fetch(
        `/api/anime/servers?episode=${episodeId}&check=1`,
      );
      const data = await res.json();
      if (res.ok) setServers(data.servers);
    } catch {
      // A failed availability probe must not interrupt active playback.
    } finally {
      setChecking(false);
    }
  }
  const filteredEpisodes = episodes.filter((e) =>
    `${e.number} ${e.title}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const visibleEpisodes = filteredEpisodes.slice(
    (filter ? 0 : episodeWindow) * 50,
    (filter ? 0 : episodeWindow) * 50 + 50,
  );
  const button =
    "inline-flex min-h-11 items-center gap-1 rounded-full bg-fill px-4 py-2 text-sm font-medium transition hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <div
      className={`mx-auto pb-6 sm:px-8 sm:pt-6 ${theater ? "max-w-none" : "max-w-[1500px]"}`}
    >
      <div
        className={`grid gap-5 sm:gap-6 ${theater ? "" : "xl:grid-cols-[minmax(0,1fr)_310px]"}`}
      >
        <div className="contents xl:block xl:min-w-0">
          <div
            ref={player}
            data-player
            className="sticky top-[calc(52px+var(--safe-top))] z-30 flex aspect-video items-center justify-center overflow-hidden bg-[#080808] sm:relative sm:top-0 sm:rounded-2xl sm:ring-1 sm:ring-white/10"
          >
            {loading ? (
              <div role="status" className="text-sm text-secondary">
                Finding playback servers...
              </div>
            ) : error ? (
              <div className="max-w-md px-6 text-center">
                <p role="alert" className="text-sm text-secondary">
                  {error}
                </p>
                <button onClick={reload} className={`${button} mt-5`}>
                  Try again
                </button>
              </div>
            ) : !selected ? (
              <div className="px-5 text-center">
                <p className="text-sm text-secondary">
                  {servers.length
                    ? `No ${language === "dub" ? "dubbed" : "subtitled"} server for this episode.`
                    : "No servers are available for this episode."}
                </p>
                {servers.some((s) => s.language !== language) && (
                  <button
                    className={`${button} mt-4`}
                    onClick={() => {
                      setLanguage(language === "sub" ? "dub" : "sub");
                      setStarted(false);
                    }}
                  >
                    Switch to {language === "sub" ? "dub" : "sub"}
                  </button>
                )}
              </div>
            ) : !started ? (
              <>
                <img
                  src={coverSrc(anime.banner ?? anime.cover, 1280)}
                  alt=""
                  className="absolute inset-0 size-full object-cover opacity-30"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent" />
                <button
                  onClick={() => setStarted(true)}
                  className="relative flex flex-col items-center gap-4"
                >
                  <span className="grid size-16 place-items-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 sm:size-20">
                    <PlayIcon className="ml-1 size-7 sm:size-8" />
                  </span>
                  <span className="text-sm font-medium">
                    Play episode {episode?.number} ·{" "}
                    {language === "dub" ? "English dub" : "Subtitled"}
                  </span>
                </button>
              </>
            ) : direct ? (
              mediaError ? (
                <div className="relative z-10 max-w-lg px-5 text-center">
                  <p role="alert" className="text-sm text-secondary">
                    {mediaError}
                  </p>
                  <button
                    onClick={() => {
                      setOriginalPlayer(true);
                      setNativeError("");
                    }}
                    className={`${button} mt-4`}
                  >
                    Use original player
                  </button>
                  <button onClick={reload} className={`${button} mt-4 ml-2`}>
                    Retry stream
                  </button>
                </div>
              ) : media ? (
                <AdaptiveVideo
                  key={`${episodeId}-${language}`}
                  media={media}
                  title={`${anime.title} episode ${episode?.number} ${language}`}
                  onError={onNativeError}
                  onProgress={(time, duration) => {
                    onProgress(time, duration);
                    // Near the end, get the next episode ready so it starts at once.
                    if (
                      duration > 0 &&
                      time / duration > 0.8 &&
                      warmed.current !== episodeId
                    ) {
                      warmed.current = episodeId;
                      warmNext();
                    }
                  }}
                  onPlaybackReady={discoverDelivery}
                  startTime={
                    savedWatch(anime.id, episodeId)?.language === language
                      ? (savedWatch(anime.id, episodeId)?.time ?? 0)
                      : 0
                  }
                  onEnded={() => {}}
                  onPrevious={
                    index > 0
                      ? () => chooseEpisode(episodes[index - 1].id)
                      : undefined
                  }
                  onNext={
                    episodes[index + 1]
                      ? () => chooseEpisode(episodes[index + 1].id)
                      : undefined
                  }
                  nextLabel={
                    episodes[index + 1]
                      ? `Episode ${episodes[index + 1].number}`
                      : undefined
                  }
                />
              ) : (
                <p role="status" className="text-xs text-secondary">
                  Preparing your stream…
                </p>
              )
            ) : (
              <iframe
                key={`${episodeId}-${selected.url}`}
                src={selected.url}
                title={`${anime.title} episode ${episode?.number} ${language} on ${selected.name}`}
                className="absolute inset-0 size-full border-0"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="origin"
                sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
              />
            )}
          </div>
          <div className="min-w-0 px-4 sm:px-0 xl:pt-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="display text-[20px] leading-tight font-bold sm:text-2xl">
                  {anime.title}
                </h1>
                <p className="t-footnote mt-1 text-secondary">
                  {episode
                    ? episode.title === `Episode ${episode.number}`
                      ? episode.title
                      : `Episode ${episode.number} · ${episode.title}`
                    : "No episodes available"}
                </p>
              </div>
              <a
                href="#series-watch-order"
                className="shrink-0 rounded-full bg-fill px-3.5 py-2 text-xs font-medium text-label/90 transition hover:bg-fill-2"
              >
                Seasons
              </a>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Audio"
                className="inline-flex rounded-full bg-fill p-1"
              >
                {(["sub", "dub"] as const).map((l) => (
                  <button
                    key={l}
                    aria-pressed={language === l}
                    onClick={() => {
                      setLanguage(l);
                      setStarted(false);
                      setNativeError("");
                      setOriginalPlayer(false);
                    }}
                    className={`min-h-9 rounded-full px-4 text-sm font-medium transition ${language === l ? "bg-white text-black" : "text-secondary hover:text-white"}`}
                  >
                    {l === "sub" ? "Sub" : "Dub"}
                  </button>
                ))}
              </div>
              <VideoDownloadButton
                anime={anime}
                episodes={episodes}
                currentEpisode={episodeId}
                audio={language}
              />
              <CollectionPicker
                item={{
                  id: anime.id,
                  media: "anime",
                  title: anime.title,
                  cover: anime.cover,
                  type: "Anime",
                }}
              />
              <div className="hidden xl:block">
                <button
                  className={button}
                  onClick={() => setTheater((t) => !t)}
                >
                  {theater ? "Default view" : "Theater"}
                </button>
              </div>
            </div>
            <details className="disclosure mt-4 rounded-2xl bg-card px-4 py-3 ring-1 ring-white/[0.06]">
              <summary className="cursor-pointer text-sm font-medium">
                Not playing? Change server
              </summary>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {available.map((s) => (
                  <button
                    key={s.name}
                    aria-pressed={selected?.name === s.name}
                    onClick={() => {
                      setServerName(s.name);
                      setStarted(false);
                      setNativeError("");
                      setOriginalPlayer(false);
                    }}
                    disabled={s.reachable === false}
                    className={`min-h-10 rounded-full px-4 text-sm font-medium disabled:opacity-40 ${selected?.name === s.name ? "bg-accent text-white" : "bg-fill text-secondary"}`}
                  >
                    {s.name === "ZokoAnime" ? "Main player" : `Backup · ${s.name}`}
                    {s.reachable === false ? " · Down" : ""}
                  </button>
                ))}
                {!loading && !available.length && (
                  <span className="text-xs text-secondary">
                    Unavailable for this audio
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-4">
                <button
                  disabled={checking}
                  onClick={checkServers}
                  className="min-h-9 text-xs font-medium text-accent"
                >
                  {checking ? "Checking..." : "Check which servers work"}
                </button>
                <button
                  onClick={reload}
                  className="min-h-9 text-xs font-medium text-accent"
                >
                  Reload
                </button>
                <Link
                  href="/settings"
                  className="inline-flex min-h-9 items-center text-xs font-medium text-accent"
                >
                  Player preferences
                </Link>
              </div>
              <p className="mt-2 text-xs leading-5 text-secondary">
                Backup players come from other sites and can show their own ads.
              </p>
            </details>
          </div>
        </div>
        <aside className="mx-4 flex min-h-64 flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-white/[0.06] sm:mx-0 xl:max-h-[680px]">
          <div className="border-b border-hairline p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Episodes</h2>
              <span className="text-xs text-secondary">
                {episodes.length} available
              </span>
            </div>
            <div className="mt-2">
              <Check
                label="Auto-play next episode"
                checked={autoNext}
                onChange={setAutoNext}
              />
            </div>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Find episode"
              placeholder="Find an episode..."
              className="mt-4 h-10 w-full rounded-lg bg-fill px-3 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            {!filter && episodes.length > 50 && (
              <select
                aria-label="Episode range"
                value={episodeWindow}
                onChange={(e) => setEpisodeWindow(Number(e.target.value))}
                className="mt-3 w-full rounded-lg bg-fill p-2 text-xs"
              >
                {Array.from(
                  { length: Math.ceil(episodes.length / 50) },
                  (_, i) => (
                    <option key={i} value={i}>
                      Episodes {episodes[i * 50].number}–
                      {
                        episodes[
                          Math.min(episodes.length - 1, (i + 1) * 50 - 1)
                        ].number
                      }
                    </option>
                  ),
                )}
              </select>
            )}
          </div>
          <div className="min-h-0 flex-1 p-2 xl:overflow-y-auto">
            {visibleEpisodes.map((e) => (
              <button
                key={e.id}
                aria-current={e.id === episodeId ? "true" : undefined}
                onClick={() => chooseEpisode(e.id)}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${e.id === episodeId ? "bg-accent/20 text-white" : watched.includes(e.id) ? "text-tertiary hover:bg-fill" : "text-label/90 hover:bg-fill"}`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg text-xs tabular-nums ${e.id === episodeId ? "bg-accent text-white" : "bg-fill"}`}
                >
                  {e.id === episodeId ? (
                    <PlayIcon className="ml-0.5 size-3.5" />
                  ) : (
                    e.number
                  )}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-relaxed">
                  {e.title}
                  {e.filler && (
                    <span className="ml-2 text-amber-300">Filler</span>
                  )}
                </span>
                {watched.includes(e.id) && e.id !== episodeId && (
                  <CheckIcon className="size-3.5 shrink-0 text-success" />
                )}
              </button>
            ))}
          </div>
        </aside>
      </div>
      <section className="mx-4 mt-10 flex max-w-4xl gap-6 border-t border-hairline pt-8 sm:mx-0">
        <img
          src={coverSrc(anime.cover, 320)}
          alt={anime.title}
          className="hidden h-44 w-28 rounded-xl object-cover sm:block"
        />
        <div>
          <h2 className="t-title3">About</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-secondary">
            {anime.description}
          </p>
        </div>
      </section>
    </div>
  );
}
