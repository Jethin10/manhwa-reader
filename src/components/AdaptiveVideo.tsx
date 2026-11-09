"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { updatePreferences, usePreferences } from "@/lib/preferences";
import type Hls from "hls.js";
import type { PlaybackMedia, PlaybackMode } from "@/lib/anime-playback";
import { saveDataEnabled } from "@/lib/playback-policy";
import { MediaSheet } from "./MediaSheet";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const HIDE_AFTER = 3000;
const MAX_READ_AHEAD = 4;

// hls.js counts its buffer in seconds of video, so faster playback needs proportionally
// more of it to cover the same wall-clock time.
function bufferPlan(
  buffer: "balanced" | "generous",
  rate: number,
  saveData = false,
) {
  const seconds =
    (saveData ? 15 : buffer === "generous" ? 60 : 30) * Math.max(1, rate);
  return {
    maxBufferLength: seconds,
    maxMaxBufferLength: Math.max(saveData ? 30 : 60, seconds * 2),
    maxBufferSize:
      (saveData ? 15 : buffer === "generous" ? 100 : 48) * 1024 * 1024,
  };
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60);
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function toggleFullscreen(root: HTMLElement | null, el: HTMLVideoElement | null) {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
    return;
  }
  // The stage outlives this component, so moving to the next episode stays full screen.
  const stage = root?.closest<HTMLElement>("[data-player]") ?? root;
  if (stage?.requestFullscreen) {
    void stage
      .requestFullscreen()
      .then(() =>
        (
          screen.orientation as ScreenOrientation & {
            lock?: (o: string) => Promise<void>;
          }
        ).lock?.("landscape"),
      )
      .catch(() => {});
    return;
  }
  // iPhone Safari only allows the video element itself to go full screen.
  (el as HTMLVideoElement & { webkitEnterFullscreen?: () => void })
    ?.webkitEnterFullscreen?.();
}

function Icon({ d, className = "size-6" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const PLAY = "M8 5.14v13.72c0 .8.87 1.3 1.56.88l10.8-6.86a1.04 1.04 0 0 0 0-1.76L9.56 4.26A1.03 1.03 0 0 0 8 5.14Z";
const PAUSE = "M7 4h3.5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm6.5 0H17a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z";
const NEXT = "M6 18.2V5.8c0-.8.9-1.3 1.6-.8l8.4 6.2V6a1 1 0 0 1 2 0v12a1 1 0 0 1-2 0v-5.2l-8.4 6.2c-.7.5-1.6 0-1.6-.8Z";
const PREV = "M18 18.2V5.8c0-.8-.9-1.3-1.6-.8L8 11.2V6a1 1 0 0 0-2 0v12a1 1 0 0 0 2 0v-5.2l8.4 6.2c.7.5 1.6 0 1.6-.8Z";
const VOLUME = "M11 5.3 6.7 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.7l4.3 3.7c.6.5 1.6.1 1.6-.8V6c0-.8-1-1.3-1.6-.7ZM16 8.5a1 1 0 0 0-.7 1.7 2.6 2.6 0 0 1 0 3.6 1 1 0 1 0 1.4 1.4 4.6 4.6 0 0 0 0-6.4 1 1 0 0 0-.7-.3Z";
const MUTED = "M11 5.3 6.7 9H4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2.7l4.3 3.7c.6.5 1.6.1 1.6-.8V6c0-.8-1-1.3-1.6-.7Zm9.7 4a1 1 0 0 0-1.4-1.4L18 9.2l-1.3-1.3a1 1 0 1 0-1.4 1.4l1.3 1.3-1.3 1.3a1 1 0 0 0 1.4 1.4l1.3-1.3 1.3 1.3a1 1 0 0 0 1.4-1.4l-1.3-1.3 1.3-1.3Z";
const GEAR = "M19.4 13a7.5 7.5 0 0 0 0-2l2-1.5a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7.3 7.3 0 0 0-1.7-1L14.5 3a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5a7.3 7.3 0 0 0-1.7 1l-2.4-1a.5.5 0 0 0-.6.2L2.7 8.9a.5.5 0 0 0 .1.6L4.8 11a7.5 7.5 0 0 0 0 2l-2 1.5a.5.5 0 0 0-.1.6l1.9 3.3c.1.2.4.3.6.2l2.4-1c.5.4 1.1.7 1.7 1l.4 2.5c0 .2.2.4.5.4H14c.3 0 .5-.2.5-.4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1c.2.1.5 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6l-2-1.5ZM12.1 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z";
const CC = "M5 5h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Zm5.2 8.6a2 2 0 1 1 0-3.2l1.2-1.6a4 4 0 1 0 0 6.4l-1.2-1.6Zm7 0a2 2 0 1 1 0-3.2l1.2-1.6a4 4 0 1 0 0 6.4l-1.2-1.6Z";
const FULL = "M4 9a1 1 0 0 0 2 0V6h3a1 1 0 0 0 0-2H5a1 1 0 0 0-1 1v4Zm16 0a1 1 0 1 1-2 0V6h-3a1 1 0 1 1 0-2h4a1 1 0 0 1 1 1v4ZM4 15a1 1 0 1 1 2 0v3h3a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1v-4Zm16 0a1 1 0 1 0-2 0v3h-3a1 1 0 1 0 0 2h4a1 1 0 0 0 1-1v-4Z";
const SHRINK = "M9 4a1 1 0 0 0-1 1v3H5a1 1 0 0 0 0 2h4a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Zm6 0a1 1 0 0 1 1 1v3h3a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM9 20a1 1 0 0 1-1-1v-3H5a1 1 0 1 1 0-2h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1Zm6 0a1 1 0 0 0 1-1v-3h3a1 1 0 1 0 0-2h-4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1Z";
const PIP = "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7c0-1.1.9-2 2-2Zm0 2v10h16V7H4Zm8 5h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z";

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-11 rounded-full px-4 text-sm font-medium transition ${on ? "bg-white text-black" : "bg-fill text-label/85 hover:bg-fill-2"}`}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="t-footnote mb-2 font-semibold text-secondary">{label}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

export default function AdaptiveVideo({
  media,
  title,
  onError,
  onProgress,
  onEnded,
  onPlaybackReady,
  onPrevious,
  onNext,
  nextLabel,
  startTime = 0,
}: {
  media: PlaybackMedia;
  title: string;
  startTime?: number;
  onError: (message: string) => void;
  onProgress: (time: number, duration: number) => void;
  onEnded: () => void;
  onPlaybackReady?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  nextLabel?: string;
}) {
  const prefs = usePreferences();
  const preferences = useRef(prefs);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ranges, setRanges] = useState<[number, number][]>([]);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [controls, setControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ id: number; text: string; side: "left" | "right" | "center" } | null>(null);
  const [boost, setBoost] = useState(false);
  const [finished, setFinished] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [captionTracks, setCaptionTracks] = useState<string[]>([]);
  const [caption, setCaption] = useState(-1);
  const [stageHeight, setStageHeight] = useState(0);
  const video = useRef<HTMLVideoElement>(null),
    engine = useRef<Hls | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tap = useRef<{
    timer?: ReturnType<typeof setTimeout>;
    press?: ReturnType<typeof setTimeout>;
    last: number;
    x: number;
    y: number;
    boosted: boolean;
  }>({ last: 0, x: 0, y: 0, boosted: false });
  useEffect(() => {
    preferences.current = prefs;
    const el = video.current;
    if (el) el.playbackRate = prefs.speed;
    const hls = engine.current;
    if (hls)
      Object.assign(
        hls.config,
        bufferPlan(prefs.buffer, prefs.speed, saveDataEnabled(prefs.dataSaver)),
      );
  }, [prefs]);
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([]);
  // Streams that carry several dubs list each language as an audio track.
  const [audioTracks, setAudioTracks] = useState<string[]>([]);
  const [audioTrack, setAudioTrack] = useState(-1);
  const [quality, setQuality] = useState(-1),
    [height, setHeight] = useState(0);
  const [mode, setMode] = useState<PlaybackMode>(() => {
    try {
      return localStorage.getItem("mr:playback-mode") === "smooth"
        ? "smooth"
        : "auto";
    } catch {
      return "auto";
    }
  });
  const [status, setStatus] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [delivery, setDelivery] = useState("auto");
  const deliveryIndex = useRef(0);
  const failedDeliveries = useRef(new Set<number>());
  const callbacks = useRef({ onError, onProgress });
  useEffect(() => {
    callbacks.current = { onError, onProgress };
  }, [onError, onProgress]);
  const initialMode = useRef(mode),
    initialTime = useRef(startTime);
  const deliveryServers = useRef(media.servers);
  useEffect(() => {
    deliveryServers.current = media.servers;
  }, [media.servers]);

  const reveal = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const el = video.current;
      if (el && !el.paused) setControls(false);
    }, HIDE_AFTER);
  }, []);
  const showFlash = useCallback(
    (text: string, side: "left" | "right" | "center") =>
      setFlash((f) => ({ id: (f?.id ?? 0) + 1, text, side })),
    [],
  );
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 650);
    return () => clearTimeout(t);
  }, [flash]);
  const seekBy = useCallback(
    (delta: number) => {
      const el = video.current;
      if (!el) return;
      el.currentTime = Math.max(
        0,
        Math.min(
          Number.isFinite(el.duration) ? el.duration - 0.5 : Infinity,
          el.currentTime + delta,
        ),
      );
      showFlash(
        `${delta < 0 ? "−" : "+"}${Math.abs(delta)}s`,
        delta < 0 ? "left" : "right",
      );
    },
    [showFlash],
  );
  const togglePlay = useCallback(() => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, []);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    let disposed = false,
      recoveries = 0;
    const readAhead = new Map<string, AbortController>();
    const stopReadAhead = () => {
      readAhead.forEach((c) => c.abort());
      readAhead.clear();
    };
    const slowConnection = () =>
      saveDataEnabled(preferences.current.dataSaver) ||
      /(^|-)[23]g$/.test(
        (navigator as Navigator & { connection?: { effectiveType?: string } })
          .connection?.effectiveType ?? "",
      );
    el.addEventListener("seeking", stopReadAhead);
    const fail = () => {
      if (!disposed)
        callbacks.current.onError(
          "This stream is not responding. Try the backup player or reload it.",
        );
    };
    function resume() {
      if (Number.isFinite(el!.duration) && initialTime.current > 0) {
        // A position saved at the very end means the episode is done: start it over.
        if (initialTime.current < el!.duration - 5)
          el!.currentTime = initialTime.current;
        else el!.currentTime = 0;
      }
      setHeight(el!.videoHeight);
      el!.playbackRate = preferences.current.speed;
      void el!.play().catch(() => {
        // Autoplay refused: the large play button stays up.
        if (!disposed) setBuffering(false);
      });
    }
    el.addEventListener("loadedmetadata", resume, { once: true });
    if (
      /Version\/[\d.]+.*Safari/.test(navigator.userAgent) &&
      !/Chrom/.test(navigator.userAgent) &&
      el.canPlayType("application/vnd.apple.mpegurl")
    ) {
      el.src = media.src;
      el.addEventListener("error", fail);
    } else {
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (disposed) return;
          if (!Hls.isSupported()) {
            if (el.canPlayType("application/vnd.apple.mpegurl")) {
              el.src = media.src;
              el.addEventListener("error", fail);
            } else fail();
            return;
          }
          const dataSaver = saveDataEnabled(preferences.current.dataSaver);
          const hls = new Hls({
            enableWorker: true,
            ...bufferPlan(
              preferences.current.buffer,
              preferences.current.speed,
              dataSaver,
            ),
            // Keep hls.js's native loader: it measures real transfer times, streams
            // data progressively, aborts stale requests and handles byte ranges.
            capLevelOnFPSDrop: true,
            ...(media.audio ? { audioPreference: { name: media.audio } } : {}),
            backBufferLength: 15,
            startLevel: -1,
            // Fetch the first segment as soon as the playlist is known, before play starts.
            startFragPrefetch: true,
            // Read-ahead downloads land in the browser cache and look instant to the
            // bandwidth estimate, so be cautious about stepping quality up.
            abrBandWidthFactor: 0.85,
            abrBandWidthUpFactor: 0.6,
            // Starting at the saved spot avoids fetching the opening just to seek away.
            startPosition: initialTime.current > 0 ? initialTime.current : -1,
            // A narrow player must not mean a blurry picture: phones have dense screens
            // and go full screen. Only an explicit data saver limits by size.
            capLevelToPlayerSize: dataSaver,
            lowLatencyMode: false,
          });
          engine.current = hls;
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            const choices = hls.levels.map((l, index) => ({
              height: l.height,
              index,
            }));
            setLevels(choices);
            if (initialMode.current === "smooth")
              hls.autoLevelCapping =
                choices.filter((l) => l.height <= 720).at(-1)?.index ?? 0;
          });
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
            const names = data.audioTracks.map(
              (t) => t.name || t.lang || "Audio",
            );
            setAudioTracks(names);
            // Start on the language this version is for (English for dub, Japanese for sub).
            const wanted = media.audio?.toLowerCase();
            const lang =
              wanted === "english" ? "en" : wanted === "japanese" ? "ja" : "";
            const pick = data.audioTracks.findIndex(
              (t) =>
                (t.name ?? "").toLowerCase() === wanted ||
                (!!lang && t.lang === lang),
            );
            if (pick >= 0 && hls.audioTrack !== pick) hls.audioTrack = pick;
          });
          hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) =>
            setAudioTrack(data.id),
          );
          hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) =>
            setHeight(hls.levels[data.level]?.height ?? 0),
          );
          // The old 2x trick, kept honest: fetch the next segments in parallel so a far-away
          // server's round trips don't starve playback, but abort them on seek or quality change.
          hls.on(Hls.Events.FRAG_LOADING, (_, data) => {
            const frag = data.frag;
            if (slowConnection() || typeof frag.sn !== "number") return;
            const details = hls.levels[frag.level]?.details;
            if (!details || frag.byteRangeEndOffset) return;
            const ahead = preferences.current.speed >= 1.5 ? 4 : 2;
            const at = frag.sn - details.startSN;
            for (let k = 1; k <= ahead && readAhead.size < MAX_READ_AHEAD; k++) {
              const url = details.fragments[at + k]?.url;
              if (!url || readAhead.has(url)) continue;
              const controller = new AbortController();
              readAhead.set(url, controller);
              void fetch(url, { signal: controller.signal, priority: "low" })
                .then((r) => r.arrayBuffer())
                .catch(() => {})
                .finally(() => readAhead.delete(url));
            }
          });
          hls.on(Hls.Events.LEVEL_SWITCHING, stopReadAhead);
          hls.on(Hls.Events.FRAG_LOADED, () => {
            recoveries = 0;
            setStatus("");
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal) return;
            if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR &&
              deliveryServers.current.length > 1
            ) {
              failedDeliveries.current.add(deliveryIndex.current);
              const nextIndex = deliveryServers.current.findIndex(
                (_, i) => !failedDeliveries.current.has(i),
              );
              const fallback = deliveryServers.current[nextIndex];
              if (fallback) {
                const position = el.currentTime;
                deliveryIndex.current = nextIndex;
                recoveries = 0;
                setDelivery(fallback.id);
                setQuality(-1);
                hls.loadSource(fallback.src);
                hls.startLoad(position);
                setStatus("Switching server…");
                return;
              }
              fail();
              return;
            }
            if (recoveries++ >= 2) {
              fail();
              return;
            }
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              setStatus("Reconnecting…");
              const position = el.currentTime;
              hls.loadSource(media.src);
              hls.startLoad(position);
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR)
              hls.recoverMediaError();
            else fail();
          });
          hls.loadSource(media.src);
          hls.attachMedia(el);
        })
        .catch(fail);
    }
    let lastSaved = -10;
    const update = () => {
      const next: [number, number][] = [];
      for (let i = 0; i < el.buffered.length; i++)
        next.push([el.buffered.start(i), el.buffered.end(i)]);
      setRanges(next);
      if (Math.abs(el.currentTime - lastSaved) >= 5 && el.duration > 0) {
        callbacks.current.onProgress(el.currentTime, el.duration);
        lastSaved = el.currentTime;
      }
    };
    const timer = window.setInterval(update, 1000);
    return () => {
      disposed = true;
      stopReadAhead();
      el.removeEventListener("seeking", stopReadAhead);
      window.dispatchEvent(
        new CustomEvent("mr:playback-active", { detail: false }),
      );
      clearInterval(timer);
      el.removeEventListener("loadedmetadata", resume);
      el.removeEventListener("error", fail);
      engine.current?.destroy();
      engine.current = null;
      el.removeAttribute("src");
      el.load();
    };
  }, [media.src, media.audio]);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const key = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest(
            "input,select,textarea,dialog,[contenteditable=true]",
          ))
      )
        return;
      const k = e.key.toLowerCase();
      if (
        ![
          " ",
          "k",
          "j",
          "l",
          "arrowleft",
          "arrowright",
          "arrowup",
          "arrowdown",
          "m",
          "f",
          "p",
          "c",
        ].includes(k)
      )
        return;
      // Space on a focused player button should press that button, not also toggle play.
      if (k === " " && e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (k === " " || k === "k") togglePlay();
      if (["j", "l", "arrowleft", "arrowright"].includes(k))
        seekBy(
          (["j", "arrowleft"].includes(k) ? -1 : 1) *
            preferences.current.seekSeconds,
        );
      if (k === "arrowup" || k === "arrowdown") {
        el.muted = false;
        el.volume = Math.max(
          0,
          Math.min(1, el.volume + (k === "arrowup" ? 0.1 : -0.1)),
        );
        showFlash(`${Math.round(el.volume * 100)}%`, "center");
      }
      if (k === "m") el.muted = !el.muted;
      if (k === "f") toggleFullscreen(root.current, el);
      if (k === "p") {
        if (document.pictureInPictureElement)
          void document.exitPictureInPicture().catch(() => {});
        else if (document.pictureInPictureEnabled)
          void el.requestPictureInPicture().catch(() => {});
      }
      if (k === "c" && el.textTracks.length) {
        const showing = Array.from(el.textTracks).some(
          (t) => t.mode === "showing",
        );
        Array.from(el.textTracks).forEach((t, i) => {
          t.mode = !showing && i === 0 ? "showing" : "disabled";
        });
      }
      reveal();
    };
    const hidden = () => {
      if (document.hidden && preferences.current.pauseWhenHidden) el.pause();
    };
    const fs = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("fullscreenchange", fs);
    };
  }, [reveal, seekBy, showFlash, togglePlay]);

  // Keep the subtitle menu in step with what the browser shows, including the default track.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    const sync = () => {
      const tracks = Array.from(el.textTracks).filter(
        (t) => t.kind === "subtitles" || t.kind === "captions",
      );
      setCaptionTracks(tracks.map((t) => t.label || t.language || "Subtitles"));
      setCaption(tracks.findIndex((t) => t.mode === "showing"));
    };
    sync();
    el.textTracks.addEventListener("change", sync);
    el.textTracks.addEventListener("addtrack", sync);
    return () => {
      el.textTracks.removeEventListener("change", sync);
      el.textTracks.removeEventListener("addtrack", sync);
    };
  }, [media.tracks]);
  function chooseCaption(index: number) {
    const el = video.current;
    if (!el) return;
    Array.from(el.textTracks).forEach((t, i) => {
      t.mode = i === index ? "showing" : "disabled";
    });
    setCaption(index);
  }

  // Subtitle sizes are set for a full-size picture; a phone's inline player is far shorter.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setStageHeight(entry.contentRect.height),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const cueSize = Math.max(
    12,
    Math.round(prefs.subtitleSize * Math.min(1, (stageHeight || 720) / 620)),
  );

  // Lock screen and notification controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title });
    const session = navigator.mediaSession;
    const seconds = preferences.current.seekSeconds;
    session.setActionHandler("seekbackward", () => seekBy(-seconds));
    session.setActionHandler("seekforward", () => seekBy(seconds));
    session.setActionHandler("nexttrack", onNext ?? null);
    session.setActionHandler("previoustrack", onPrevious ?? null);
    return () => {
      session.setActionHandler("seekbackward", null);
      session.setActionHandler("seekforward", null);
      session.setActionHandler("nexttrack", null);
      session.setActionHandler("previoustrack", null);
    };
  }, [title, seekBy, onNext, onPrevious]);

  // The end card counts down only when auto-play is on.
  const autoNext = prefs.autoNext && !!onNext;
  useEffect(() => {
    if (!finished || !autoNext) return;
    const start = setTimeout(() => setCountdown(5), 0);
    const tick = setInterval(() => setCountdown((n) => n - 1), 1000);
    return () => {
      clearTimeout(start);
      clearInterval(tick);
      setCountdown(0);
    };
  }, [finished, autoNext]);
  const nextRef = useRef(onNext);
  useEffect(() => {
    nextRef.current = onNext;
  }, [onNext]);
  useEffect(() => {
    if (finished && autoNext && countdown < 0) nextRef.current?.();
  }, [countdown, finished, autoNext]);

  const intro = media.skip?.intro,
    outro = media.skip?.outro;
  const activeSkip =
    intro && time >= intro.start && time < intro.end
      ? { ...intro, label: "Skip intro" }
      : outro && time >= outro.start && time < outro.end
        ? { ...outro, label: "Skip outro" }
        : null;
  useEffect(() => {
    const el = video.current;
    if (
      el &&
      prefs.autoSkipIntro &&
      intro &&
      time >= intro.start &&
      time < intro.end &&
      intro.end < el.duration
    )
      el.currentTime = intro.end;
  }, [time, prefs.autoSkipIntro, intro]);

  function chooseQuality(value: number) {
    setQuality(value);
    if (value >= 0) {
      setMode("auto");
      try {
        localStorage.setItem("mr:playback-mode", "auto");
      } catch {}
    }
    const hls = engine.current;
    if (hls) {
      if (value >= 0) hls.autoLevelCapping = -1;
      // currentLevel drops what's buffered so the change is visible right away.
      hls.currentLevel = value;
    }
  }
  function chooseMode(value: PlaybackMode) {
    setMode(value);
    setQuality(-1);
    try {
      localStorage.setItem("mr:playback-mode", value);
    } catch {}
    const hls = engine.current;
    if (hls) {
      hls.autoLevelCapping =
        value === "smooth"
          ? (levels.filter((l) => l.height <= 720).at(-1)?.index ?? 0)
          : -1;
      hls.currentLevel = -1;
    }
  }
  function chooseDelivery(id: string) {
    failedDeliveries.current.clear();
    const choice =
      id === "auto" ? media.servers[0] : media.servers.find((s) => s.id === id);
    setDelivery(id);
    setQuality(-1);
    deliveryIndex.current = Math.max(
      0,
      media.servers.findIndex((s) => s.id === choice?.id),
    );
    const el = video.current;
    if (!el) return;
    const position = el.currentTime,
      src = choice?.src ?? media.src;
    if (engine.current) {
      engine.current.loadSource(src);
      engine.current.startLoad(position);
    } else {
      el.src = src;
      el.addEventListener(
        "loadedmetadata",
        () => {
          el.currentTime = position;
          void el.play().catch(() => {});
        },
        { once: true },
      );
    }
  }

  const ratioAt = (clientX: number) => {
    const box = bar.current?.getBoundingClientRect();
    if (!box || !box.width) return 0;
    return Math.max(0, Math.min(1, (clientX - box.left) / box.width));
  };
  const seconds = prefs.seekSeconds;
  const shownTime = scrub !== null ? scrub * duration : time;
  const pct = (n: number) => (duration > 0 ? `${(n / duration) * 100}%` : "0%");
  const iconButton =
    "grid size-11 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15 active:scale-90";
  const visible = controls || !playing || scrub !== null;

  return (
    <div
      ref={root}
      className="player-stage absolute inset-0 select-none"
      onPointerMove={(e) => {
        if (e.pointerType === "mouse") reveal();
      }}
      onMouseLeave={() => {
        if (playing) setControls(false);
      }}
    >
      <style>{`.adaptive-video::cue { font-size: ${cueSize}px; color: ${prefs.subtitleColor}; background-color: ${prefs.subtitleBackground ? "rgba(0,0,0,.75)" : "transparent"}; text-shadow: 0 1px 3px black; }`}</style>
      <video
        ref={video}
        autoPlay
        playsInline
        preload="auto"
        title={title}
        onEnded={() => {
          setStatus("");
          setPlaying(false);
          setFinished(true);
          window.dispatchEvent(
            new CustomEvent("mr:playback-active", { detail: false }),
          );
          onEnded();
        }}
        className="adaptive-video absolute inset-0 size-full bg-black"
        style={{ objectFit: prefs.fit }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          setDuration(Number.isFinite(d) ? d : 0);
        }}
        onVolumeChange={(e) => {
          setMuted(e.currentTarget.muted);
          setVolume(e.currentTarget.volume);
        }}
        onPlay={() => {
          setPlaying(true);
          setFinished(false);
          reveal();
        }}
        onPlaying={() => {
          setStatus("");
          setPlaying(true);
          setBuffering(false);
          setHeight(video.current?.videoHeight ?? 0);
          onPlaybackReady?.();
          window.dispatchEvent(
            new CustomEvent("mr:playback-active", { detail: true }),
          );
        }}
        onCanPlay={() => setBuffering(false)}
        onWaiting={() => setBuffering(true)}
        onSeeking={() => setBuffering(true)}
        onSeeked={() => setBuffering(false)}
        onPause={() => {
          setPlaying(false);
          setControls(true);
          window.dispatchEvent(
            new CustomEvent("mr:playback-active", { detail: false }),
          );
          const v = video.current;
          if (v && v.duration > 0)
            callbacks.current.onProgress(v.currentTime, v.duration);
        }}
      >
        {media.tracks.map((t) => (
          <track
            key={t.src}
            kind="subtitles"
            src={t.src}
            label={t.label}
            srcLang={t.language}
            default={t.default}
          />
        ))}
      </video>

      {/* Tap once for controls, double tap the sides to seek, hold for 2x. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ touchAction: "manipulation" }}
        onPointerDown={(e) => {
          const p = tap.current;
          p.x = e.clientX;
          p.y = e.clientY;
          p.boosted = false;
          if (e.pointerType === "mouse") return;
          p.press = setTimeout(() => {
            const el = video.current;
            if (!el || el.paused) return;
            p.boosted = true;
            el.playbackRate = 2;
            setBoost(true);
          }, 450);
        }}
        onPointerMove={(e) => {
          const p = tap.current;
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12)
            clearTimeout(p.press);
        }}
        onPointerCancel={() => clearTimeout(tap.current.press)}
        onPointerUp={(e) => {
          const p = tap.current;
          clearTimeout(p.press);
          if (p.boosted) {
            p.boosted = false;
            if (video.current)
              video.current.playbackRate = preferences.current.speed;
            setBoost(false);
            return;
          }
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) return;
          const now = Date.now();
          const box = e.currentTarget.getBoundingClientRect();
          const at = (e.clientX - box.left) / box.width;
          const double = now - p.last < 280;
          p.last = now;
          clearTimeout(p.timer);
          if (e.pointerType === "mouse") {
            if (double) {
              // Undoes the pause from the first click of the pair.
              togglePlay();
              toggleFullscreen(root.current, video.current);
            } else togglePlay();
            return;
          }
          if (double && (at < 0.38 || at > 0.62)) {
            seekBy((at < 0.38 ? -1 : 1) * preferences.current.seekSeconds);
            return;
          }
          p.timer = setTimeout(() => {
            if (controls && playing) setControls(false);
            else reveal();
          }, 240);
        }}
      />

      {flash && (
        <div
          key={flash.id}
          className={`player-flash pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold ${flash.side === "left" ? "left-[12%]" : flash.side === "right" ? "right-[12%]" : "left-1/2 -translate-x-1/2"}`}
        >
          {flash.text}
        </div>
      )}
      {boost && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold">
          2× speed
        </div>
      )}
      {status && (
        <p
          role="status"
          className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1.5 text-xs text-white"
        >
          {status}
        </p>
      )}
      {buffering && !finished && (
        <div
          role="status"
          aria-label="Loading video"
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <span className="size-12 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
        </div>
      )}

      {activeSkip && !finished && (
        <button
          onClick={() => {
            if (video.current && activeSkip.end < video.current.duration)
              video.current.currentTime = activeSkip.end;
          }}
          className={`absolute right-3 z-20 min-h-11 rounded-full bg-white px-4 text-sm font-semibold text-black shadow-lg transition-[bottom] ${visible ? "bottom-[76px]" : "bottom-4"}`}
        >
          {activeSkip.label}
        </button>
      )}

      <div
        className={`player-controls pointer-events-none absolute inset-0 z-10 flex flex-col justify-between transition-opacity duration-200 ${visible && !finished ? "opacity-100" : "opacity-0"}`}
        data-shown={visible && !finished ? "true" : "false"}
      >
        <div className="flex items-center gap-1 bg-gradient-to-b from-black/70 to-transparent px-2 pt-1 pb-6">
          <p className="t-footnote min-w-0 flex-1 truncate px-2 font-medium text-white">
            {fullscreen ? title : ""}
          </p>
          {captionTracks.length > 0 && (
            <button
              onClick={() =>
                chooseCaption(caption >= 0 ? -1 : 0)
              }
              aria-label={caption >= 0 ? "Turn subtitles off" : "Turn subtitles on"}
              aria-pressed={caption >= 0}
              className={`${iconButton} pointer-events-auto ${caption >= 0 ? "" : "opacity-60"}`}
            >
              <Icon d={CC} />
            </button>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            className={`${iconButton} pointer-events-auto`}
            aria-label="Open playback settings"
          >
            <Icon d={GEAR} />
          </button>
        </div>

        <div className="pointer-events-none flex items-center justify-center gap-5 sm:gap-10">
          <button
            onClick={() => seekBy(-seconds)}
            aria-label={`Back ${seconds} seconds`}
            className={`${iconButton} pointer-events-auto bg-black/35 text-[13px] font-bold`}
          >
            −{seconds}
          </button>
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className={`pointer-events-auto grid size-14 place-items-center rounded-full bg-black/45 text-white transition hover:bg-black/60 active:scale-90 sm:size-16 ${buffering ? "opacity-0" : ""}`}
          >
            <Icon d={playing ? PAUSE : PLAY} className="size-8" />
          </button>
          <button
            onClick={() => seekBy(seconds)}
            aria-label={`Forward ${seconds} seconds`}
            className={`${iconButton} pointer-events-auto bg-black/35 text-[13px] font-bold`}
          >
            +{seconds}
          </button>
        </div>

        <div className="bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-1">
          <div
            ref={bar}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(shownTime)}
            aria-valuetext={clock(shownTime)}
            className="group/bar pointer-events-auto relative flex h-6 cursor-pointer items-center"
            style={{ touchAction: "none" }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setScrub(ratioAt(e.clientX));
            }}
            onPointerMove={(e) => {
              if (scrub !== null) setScrub(ratioAt(e.clientX));
            }}
            onPointerUp={(e) => {
              if (scrub === null) return;
              const el = video.current;
              const to = ratioAt(e.clientX) * duration;
              if (el && duration > 0) {
                el.currentTime = to;
                setTime(to);
              }
              setScrub(null);
              reveal();
            }}
            onPointerCancel={() => setScrub(null)}
          >
            {scrub !== null && (
              <span
                className="absolute -top-7 -translate-x-1/2 rounded-md bg-black/85 px-2 py-0.5 text-xs font-semibold tabular-nums"
                style={{ left: `clamp(24px, ${scrub * 100}%, calc(100% - 24px))` }}
              >
                {clock(shownTime)}
              </span>
            )}
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/bar:h-1.5">
              {ranges.map(([start, end], i) => (
                <span
                  key={i}
                  className="absolute inset-y-0 bg-white/35"
                  style={{ left: pct(start), width: pct(end - start) }}
                />
              ))}
              {[intro, outro].map(
                (part, i) =>
                  part && (
                    <span
                      key={i}
                      className="absolute inset-y-0 bg-amber-300/60"
                      style={{
                        left: pct(part.start),
                        width: pct(part.end - part.start),
                      }}
                    />
                  ),
              )}
              <span
                className="absolute inset-y-0 left-0 bg-accent"
                style={{ width: pct(shownTime) }}
              />
            </div>
            <span
              className="absolute size-3.5 -translate-x-1/2 rounded-full bg-accent shadow"
              style={{ left: pct(shownTime) }}
            />
          </div>
          <div className="flex items-center gap-0.5 text-white">
            <span className="px-1 text-xs font-medium tabular-nums">
              {clock(shownTime)}
              <span className="text-white/60"> / {clock(duration)}</span>
            </span>
            <span className="flex-1" />
            {onPrevious && (
              <button
                onClick={onPrevious}
                aria-label="Previous episode"
                className={`${iconButton} pointer-events-auto`}
              >
                <Icon d={PREV} className="size-5" />
              </button>
            )}
            {onNext && (
              <button
                onClick={onNext}
                aria-label={nextLabel ? `Next: ${nextLabel}` : "Next episode"}
                className={`${iconButton} pointer-events-auto`}
              >
                <Icon d={NEXT} className="size-5" />
              </button>
            )}
            <button
              onClick={() => {
                if (video.current) video.current.muted = !video.current.muted;
              }}
              aria-label={muted ? "Unmute" : "Mute"}
              className={`${iconButton} pointer-events-auto`}
            >
              <Icon d={muted || volume === 0 ? MUTED : VOLUME} className="size-5" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              aria-label="Volume"
              onChange={(e) => {
                const el = video.current;
                if (!el) return;
                el.muted = false;
                el.volume = Number(e.target.value);
              }}
              className="pointer-events-auto mr-1 hidden w-20 accent-white lg:block"
            />
            <button
              onClick={() => {
                const el = video.current;
                if (document.pictureInPictureElement)
                  void document.exitPictureInPicture().catch(() => {});
                else void el?.requestPictureInPicture?.().catch(() => {});
              }}
              aria-label="Picture in picture"
              className={`${iconButton} pointer-events-auto hidden sm:grid`}
            >
              <Icon d={PIP} className="size-5" />
            </button>
            <button
              onClick={() => toggleFullscreen(root.current, video.current)}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              className={`${iconButton} pointer-events-auto`}
            >
              <Icon d={fullscreen ? SHRINK : FULL} className="size-5" />
            </button>
          </div>
        </div>
      </div>

      {finished && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/75 px-4 text-center">
          <div>
            {onNext ? (
              <>
                <p className="t-footnote text-secondary">
                  {autoNext && countdown > 0
                    ? `Playing in ${countdown}…`
                    : "Up next"}
                </p>
                <p className="t-headline mt-1">{nextLabel ?? "Next episode"}</p>
              </>
            ) : (
              <p className="t-headline">That&apos;s the last episode</p>
            )}
            <div className="mt-4 flex justify-center gap-2">
              {onNext && (
                <button onClick={onNext} className="btn btn-primary">
                  Play next
                </button>
              )}
              <button
                onClick={() => {
                  const el = video.current;
                  if (!el) return;
                  el.currentTime = 0;
                  void el.play().catch(() => {});
                }}
                className="btn btn-gray"
              >
                Replay
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <MediaSheet
          title="Playback settings"
          onClose={() => setSettingsOpen(false)}
        >
          {levels.length > 0 && (
            <Group label="Quality">
              <Choice
                on={quality < 0 && mode === "auto"}
                onClick={() => {
                  chooseMode("auto");
                  chooseQuality(-1);
                }}
              >
                Auto{height && quality < 0 ? ` · ${height}p` : ""}
              </Choice>
              {levels.some((l) => l.height > 720) && (
                <Choice
                  on={quality < 0 && mode === "smooth"}
                  onClick={() => chooseMode("smooth")}
                >
                  Smooth · 720p max
                </Choice>
              )}
              {[...levels]
                .sort((a, b) => b.height - a.height)
                .map((l) => (
                  <Choice
                    key={l.index}
                    on={quality === l.index}
                    onClick={() => chooseQuality(l.index)}
                  >
                    {l.height
                      ? `${l.height}p${l.height >= 2160 ? " · 4K" : ""}`
                      : "Source"}
                  </Choice>
                ))}
            </Group>
          )}
          <Group label="Speed">
            {SPEEDS.map((s) => (
              <Choice
                key={s}
                on={prefs.speed === s}
                onClick={() => updatePreferences({ speed: s })}
              >
                {s === 1 ? "Normal" : `${s}×`}
              </Choice>
            ))}
          </Group>
          {captionTracks.length > 0 && (
            <Group label="Subtitles">
              <Choice on={caption < 0} onClick={() => chooseCaption(-1)}>
                Off
              </Choice>
              {captionTracks.map((name, i) => (
                <Choice
                  key={`${name}-${i}`}
                  on={caption === i}
                  onClick={() => chooseCaption(i)}
                >
                  {name}
                </Choice>
              ))}
            </Group>
          )}
          {audioTracks.length > 1 && (
            <Group label="Audio">
              {audioTracks.map((name, i) => (
                <Choice
                  key={`${name}-${i}`}
                  on={audioTrack === i}
                  onClick={() => {
                    if (engine.current) engine.current.audioTrack = i;
                  }}
                >
                  {name}
                </Choice>
              ))}
            </Group>
          )}
          {media.servers.length > 1 && (
            <Group label="Server">
              <Choice on={delivery === "auto"} onClick={() => chooseDelivery("auto")}>
                Auto
              </Choice>
              {media.servers
                .filter(
                  (s, i, all) =>
                    all.findIndex((x) => x.label === s.label) === i,
                )
                .map((s) => (
                <Choice
                  key={s.id}
                  on={delivery === s.id}
                  onClick={() => chooseDelivery(s.id)}
                >
                  {s.label}
                </Choice>
              ))}
            </Group>
          )}
        </MediaSheet>
      )}
    </div>
  );
}
