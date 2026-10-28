"use client";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "@/lib/preferences";
import type Hls from "hls.js";
import type { PlaybackMedia, PlaybackMode } from "@/lib/anime-playback";

export default function AdaptiveVideo({
  media,
  title,
  onError,
  onProgress,
  onEnded,
  startTime = 0,
}: {
  media: PlaybackMedia;
  title: string;
  startTime?: number;
  onError: (message: string) => void;
  onProgress: (time: number, duration: number) => void;
  onEnded: () => void;
}) {
  const prefs = usePreferences();
  const preferences = useRef(prefs);
  const [time, setTime] = useState(0);
  const video = useRef<HTMLVideoElement>(null),
    engine = useRef<Hls | null>(null);
  useEffect(() => {
    preferences.current = prefs;
    const el = video.current;
    if (el) el.playbackRate = prefs.speed;
    const hls = engine.current;
    if (hls) {
      hls.config.maxBufferLength = prefs.buffer === "generous" ? 90 : 60;
      hls.config.maxBufferSize =
        (prefs.buffer === "generous" ? 72 : 48) * 1024 * 1024;
    }
  }, [prefs]);
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([]);
  const [quality, setQuality] = useState(-1),
    [height, setHeight] = useState(0),
    [buffer, setBuffer] = useState(0);
  const [mode, setMode] = useState<PlaybackMode>(() => {
    try {
      return localStorage.getItem("mr:playback-mode") === "smooth"
        ? "smooth"
        : "auto";
    } catch {
      return "auto";
    }
  });
  const [status, setStatus] = useState("Loading stream...");
  const [delivery, setDelivery] = useState("auto");
  const deliveryIndex = useRef(0);
  const failedDeliveries = useRef(new Set<number>());
  const callbacks = useRef({ onError, onProgress });
  useEffect(() => {
    callbacks.current = { onError, onProgress };
  }, [onError, onProgress]);
  const initialMode = useRef(mode),
    initialTime = useRef(startTime);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    let disposed = false,
      recoveries = 0;
    const fail = () => {
      if (!disposed)
        callbacks.current.onError(
          "This stream is not responding. Try the alternate server or original player.",
        );
    };
    function resume() {
      if (
        initialTime.current > 0 &&
        Number.isFinite(el!.duration) &&
        initialTime.current < el!.duration - 5
      )
        el!.currentTime = initialTime.current;
      setHeight(el!.videoHeight);
      el!.playbackRate = preferences.current.speed;
      void el!.play().catch(() => {
        if (!disposed) setStatus("Press play to start");
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
          const hls = new Hls({
            enableWorker: true,
            maxBufferLength:
              preferences.current.buffer === "generous" ? 90 : 60,
            maxMaxBufferLength: 120,
            maxBufferSize:
              (preferences.current.buffer === "generous" ? 72 : 48) *
              1024 *
              1024,
            capLevelOnFPSDrop: true,
            backBufferLength: 20,
            startLevel: -1,
            abrEwmaDefaultEstimate: 1500000,
            capLevelToPlayerSize: false,
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
          hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) =>
            setHeight(hls.levels[data.level]?.height ?? 0),
          );
          hls.on(Hls.Events.FRAG_LOADED, () => {
            recoveries = 0;
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal) return;
            if (
              data.type === Hls.ErrorTypes.NETWORK_ERROR &&
              media.servers.length > 1
            ) {
              failedDeliveries.current.add(deliveryIndex.current);
              const nextIndex = media.servers.findIndex(
                (_, i) => !failedDeliveries.current.has(i),
              );
              const fallback = media.servers[nextIndex];
              if (fallback) {
                const position = el.currentTime;
                deliveryIndex.current = nextIndex;
                recoveries = 0;
                setDelivery(fallback.id);
                setQuality(-1);
                hls.loadSource(fallback.src);
                hls.startLoad(position);
                setStatus("Switching delivery server...");
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
              setStatus("Reconnecting...");
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
      let ahead = 0;
      for (let i = 0; i < el.buffered.length; i++)
        if (
          el.buffered.start(i) <= el.currentTime + 0.5 &&
          el.buffered.end(i) > el.currentTime
        )
          ahead = el.buffered.end(i) - el.currentTime;
      setBuffer(Math.floor(ahead));
      setTime(el.currentTime);
      if (Math.abs(el.currentTime - lastSaved) >= 5 && el.duration > 0) {
        callbacks.current.onProgress(el.currentTime, el.duration);
        lastSaved = el.currentTime;
      }
    };
    const timer = window.setInterval(update, 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
      el.removeEventListener("loadedmetadata", resume);
      el.removeEventListener("error", fail);
      engine.current?.destroy();
      engine.current = null;
      el.removeAttribute("src");
      el.load();
    };
  }, [media.src, media.servers]);
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
            "input,select,textarea,button,[contenteditable=true]",
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
          "m",
          "f",
          "p",
          "c",
        ].includes(k)
      )
        return;
      e.preventDefault();
      if (k === " " || k === "k") {
        if (el.paused) void el.play().catch(() => {});
        else el.pause();
      }
      if (["j", "l", "arrowleft", "arrowright"].includes(k))
        el.currentTime = Math.max(
          0,
          Math.min(
            Number.isFinite(el.duration) ? el.duration : Infinity,
            el.currentTime +
              (["j", "arrowleft"].includes(k) ? -1 : 1) *
                preferences.current.seekSeconds,
          ),
        );
      if (k === "m") el.muted = !el.muted;
      if (k === "f") {
        if (document.fullscreenElement)
          void document.exitFullscreen().catch(() => {});
        else void el.parentElement?.requestFullscreen().catch(() => {});
      }
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
    };
    const hidden = () => {
      if (document.hidden && preferences.current.pauseWhenHidden) el.pause();
    };
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
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
    if (engine.current) {
      if (value >= 0) engine.current.autoLevelCapping = -1;
      engine.current.nextLevel = value;
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
      hls.nextLevel = -1;
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
  return (
    <>
      <style>{`.adaptive-video::cue { font-size: ${prefs.subtitleSize}px; color: ${prefs.subtitleColor}; background-color: ${prefs.subtitleBackground ? "rgba(0,0,0,.75)" : "transparent"}; text-shadow: 0 1px 3px black; }`}</style>
      <video
        ref={video}
        controls
        autoPlay
        playsInline
        preload="auto"
        title={title}
        onEnded={onEnded}
        className="adaptive-video absolute inset-0 size-full bg-black"
        style={{ objectFit: prefs.fit }}
        onPlaying={() => setStatus("")}
        onWaiting={() => setStatus("Buffering...")}
        onStalled={() =>
          setStatus("Connection slowed. Auto quality can reduce buffering.")
        }
        onPause={() => {
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
      {activeSkip && (
        <button
          onClick={() => {
            if (video.current && activeSkip.end < video.current.duration)
              video.current.currentTime = activeSkip.end;
          }}
          className="absolute right-4 bottom-16 rounded-lg bg-black/80 px-4 py-2 text-sm ring-1 ring-white/30"
        >
          {activeSkip.label}
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent p-3 pb-8 text-[10px] sm:text-xs">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <select
            aria-label="Video quality"
            disabled={!levels.length}
            value={quality}
            onChange={(e) => chooseQuality(Number(e.target.value))}
            className="max-w-36 rounded-lg bg-black/70 p-2 outline-none focus:ring-2 focus:ring-accent"
          >
            <option value={-1}>
              Auto{height ? ` · ${height}p` : " quality"}
            </option>
            {levels.map((l) => (
              <option key={l.index} value={l.index}>
                {l.height}p{l.height >= 2160 ? " / 4K" : ""}
              </option>
            ))}
          </select>
          <select
            aria-label="Playback mode"
            disabled={!levels.length}
            value={mode}
            onChange={(e) => chooseMode(e.target.value as PlaybackMode)}
            className="max-w-36 rounded-lg bg-black/70 p-2 outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="auto">Best available</option>
            <option value="smooth">Smooth · up to 720p</option>
          </select>
        </div>
        <select
          aria-label="Delivery server"
          value={delivery}
          onChange={(e) => chooseDelivery(e.target.value)}
          className="pointer-events-auto max-w-44 rounded-lg bg-black/70 p-2 outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="auto">
            Auto CDN
            {media.servers[0] ? ` / ${media.servers[0].label}` : ""}
          </option>
          {media.servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} · {s.latencyMs}ms
            </option>
          ))}
        </select>
        <span role="status" className="rounded bg-black/50 px-2 py-1">
          {status ||
            `${buffer}s buffered${levels.length ? ` / source up to ${Math.max(...levels.map((l) => l.height))}p` : height ? ` / playing ${height}p` : " / native quality"}`}
        </span>
      </div>
    </>
  );
}
