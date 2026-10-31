/* eslint-disable @next/next/no-img-element -- Images use the shared resizing proxy. */
"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Anime, AnimeServer, Episode } from "@/lib/anime";
import { savedWatch, saveWatch } from "./AnimeLibrary";
import { clearPlaybackCache, loadMedia, loadServers } from "@/lib/anime-client";
import type { PlaybackMedia } from "@/lib/anime-playback";
import { CollectionPicker } from "./CollectionPicker";
import { PlaybackOptions } from "./PreferenceControls";
import { usePreferences, updatePreferences } from "@/lib/preferences";
import { coverSrc } from "@/lib/images";
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
    if (!direct || !episodeId) return;
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
  }, [direct, episodeId, language, retry]);
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
    "rounded-full bg-fill px-4 py-2 text-xs font-medium transition hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-30";
  return (
    <div
      className={`mx-auto px-4 py-6 sm:px-8 ${theater ? "max-w-none" : "max-w-[1500px]"}`}
    >
      <header className="flex items-center gap-3">
        <Link
          href="/anime"
          aria-label="Back to anime"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-fill text-lg text-label/90 transition hover:bg-fill-2"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-[20px] leading-tight font-bold sm:text-2xl">
            {anime.title}
          </h1>
          <p className="t-caption mt-0.5 text-secondary">
            {episodes.length} episodes · {anime.sub} sub · {anime.dub} dub
          </p>
        </div>
        <a
          href="#series-watch-order"
          className="shrink-0 rounded-full bg-fill px-3.5 py-2 text-xs font-medium text-label/90 transition hover:bg-fill-2"
        >
          Seasons
        </a>
      </header>
      <div
        className={`mt-5 grid gap-6 ${theater ? "" : "xl:grid-cols-[minmax(0,1fr)_310px]"}`}
      >
        <div className="min-w-0">
          <div
            ref={player}
            className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-[#080808] ring-1 ring-white/10"
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
                  <span className="grid size-16 place-items-center rounded-full bg-white pl-1 text-2xl text-black shadow-lg transition hover:scale-105 sm:size-20">
                    ▶
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
                  onProgress={onProgress}
                  startTime={
                    savedWatch(anime.id, episodeId)?.language === language
                      ? (savedWatch(anime.id, episodeId)?.time ?? 0)
                      : 0
                  }
                  onEnded={() => {
                    if (autoNext && episodes[index + 1])
                      chooseEpisode(episodes[index + 1].id);
                  }}
                />
              ) : (
                <p role="status" className="text-xs text-secondary">
                  Finding the fastest delivery server...
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
              />
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-secondary">
              {episode
                ? episode.title === `Episode ${episode.number}`
                  ? episode.title
                  : `Episode ${episode.number} · ${episode.title}`
                : "No episodes available"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={button}
                disabled={index <= 0}
                onClick={() => chooseEpisode(episodes[index - 1].id)}
              >
                ‹ Previous
              </button>
              <button
                className={button}
                disabled={index < 0 || index >= episodes.length - 1}
                onPointerEnter={warmNext}
                onFocus={warmNext}
                onClick={() => chooseEpisode(episodes[index + 1].id)}
              >
                Next ›
              </button>
              <button className={button} onClick={() => setTheater((t) => !t)}>
                {theater ? "Default view" : "Theater"}
              </button>
              <button
                className={button}
                onClick={() =>
                  player.current?.requestFullscreen().catch(() => {})
                }
              >
                Fullscreen
              </button>
            </div>
          </div>
          <section
            aria-label="Playback options"
            className="mt-5 overflow-hidden rounded-2xl bg-card ring-1 ring-white/[0.06]"
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-hairline p-4">
              <span className="mr-2 text-xs text-secondary">Audio</span>
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
                  className={`rounded-full px-5 py-2 text-sm font-medium transition ${language === l ? "bg-white text-black" : "bg-fill text-secondary hover:text-white"}`}
                >
                  {l === "sub" ? "Subtitled" : "English dub"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 p-4">
              <span className="mr-2 text-xs text-secondary">Server</span>
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
                  className={`rounded-lg px-4 py-2 text-sm ${selected?.name === s.name ? "bg-accent text-white" : "bg-fill text-secondary"}`}
                >
                  {s.name}
                  {s.name === "ZokoAnime" ? " · Adaptive HD" : ""}
                  {s.reachable === false
                    ? " · Unavailable"
                    : s.latencyMs
                      ? ` · ${s.latencyMs}ms`
                      : ""}
                </button>
              ))}
              {!loading && !available.length && (
                <span className="text-xs text-secondary">
                  Unavailable for this audio
                </span>
              )}
              <button
                disabled={checking}
                onClick={checkServers}
                className="text-xs text-secondary hover:text-white"
              >
                {checking ? "Checking..." : "Check availability"}
              </button>
              <button
                onClick={reload}
                className="ml-auto text-xs text-secondary hover:text-white"
              >
                Reload servers
              </button>
            </div>
          </section>
          <div className="mt-4">
            <CollectionPicker
              item={{
                id: anime.id,
                media: "anime",
                title: anime.title,
                cover: anime.cover,
                type: "Anime",
              }}
            />
          </div>
          <details className="mt-4 rounded-2xl bg-card p-5">
            <summary className="cursor-pointer text-sm font-semibold">
              Player preferences & shortcuts
            </summary>
            <div className="mt-5">
              <PlaybackOptions
                settings={prefs}
                onChange={(patch) => {
                  updatePreferences(patch);
                  if (patch.audio) setLanguage(patch.audio);
                }}
              />
              <p className="mt-5 text-xs leading-6 text-secondary">
                Space / K: play or pause. J / L or arrows: seek. M: mute. F:
                fullscreen. C: subtitles. P: picture in picture. These controls
                apply to the integrated player.
              </p>
            </div>
          </details>
          <label className="mt-3 inline-flex items-center gap-2 text-xs text-secondary">
            <input
              type="checkbox"
              checked={autoNext}
              onChange={(e) => setAutoNext(e.target.checked)}
              className="accent-[#a78bfa]"
            />
            Auto-play next episode
          </label>
          <p className="mt-3 text-xs leading-relaxed text-tertiary">
            Adaptive HD picks a sustainable quality and buffers ahead. Use
            Smooth on slower connections, or choose a resolution inside the
            video. Available quality depends on the upload; slow connections
            cannot sustain every resolution.
          </p>
        </div>
        <aside className="flex max-h-[680px] min-h-64 flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-white/[0.06]">
          <div className="border-b border-hairline p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Episodes</h2>
              <span className="text-xs text-secondary">
                {episodes.length} available
              </span>
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
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {visibleEpisodes.map((e) => (
              <button
                key={e.id}
                aria-current={e.id === episodeId ? "true" : undefined}
                onClick={() => chooseEpisode(e.id)}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${e.id === episodeId ? "bg-accent/20 text-white" : "text-secondary hover:bg-fill"}`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg text-xs tabular-nums ${e.id === episodeId ? "bg-accent text-white" : "bg-fill"}`}
                >
                  {e.id === episodeId ? "▶" : e.number}
                </span>
                <span className="line-clamp-2 text-xs leading-relaxed">
                  {e.title}
                  {e.filler && (
                    <span className="ml-2 text-amber-300">Filler</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>
      <section className="mt-10 flex max-w-4xl gap-6 border-t border-hairline pt-8">
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
