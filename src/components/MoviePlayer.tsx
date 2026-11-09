"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Movie } from "@/lib/movie-types";
import {
  availableProviders,
  decodeMovieEvent,
  type MovieProvider,
  type MoviePlaybackOptions,
  type MoviePlayerEvent,
} from "@/lib/movie-providers";
import { MediaSheet } from "./MediaSheet";
import { ChevronLeft } from "./Icons";
import {
  getMovieHistory,
  getMoviePreferences,
  saveMovieProgress,
} from "@/lib/movie-library";
const FRAME_WIDTH = 720;

type PlayerCommand = {
  id: number;
  name: "play" | "pause" | "seek" | "setVolume";
  args: number[];
};

export default function MoviePlayer({
  movie,
  onClose,
}: {
  movie: Movie;
  onClose: () => void;
}) {
  const [prefs] = useState(getMoviePreferences);
  const providers = useMemo(
    () =>
      availableProviders(
        movie,
        prefs.disabledProviders,
        prefs.preferredProvider,
      ),
    [movie, prefs],
  );
  const [selected, setSelected] = useState(() => {
    const last = getMovieHistory().find((m) => m.id === movie.id);
    return prefs.preferredProvider === "auto" &&
      last &&
      providers.some((p) => p.id === last.provider)
      ? last.provider
      : (providers[0]?.id ?? "");
  });
  const [attempt, setAttempt] = useState(0),
    [sources, setSources] = useState(false),
    [notice, setNotice] = useState("");
  const [command, setCommand] = useState<PlayerCommand | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [initialPosition] = useState(() => {
    const last = prefs.rememberProgress
      ? getMovieHistory().find((m) => m.id === movie.id && !m.completed)
      : null;
    return { time: last?.time ?? 0, duration: last?.duration ?? 0 };
  });
  const startAt = initialPosition.time;
  const position = useRef({
    ...initialPosition,
    completed: false,
    observed: false,
  });
  const [resumeAt, setResumeAt] = useState(startAt);
  const container = useRef<HTMLDivElement>(null);
  const provider = providers.find((p) => p.id === selected);
  const lastSave = useRef(0);
  const switchTo = useCallback(
    (id: string) => {
      if (position.current.observed)
        saveMovieProgress(
          movie,
          selected,
          position.current.time,
          position.current.duration,
          position.current.completed,
        );
      position.current.observed = false;
      setCommand(null);
      setResumeAt(position.current.time);
      setSelected(id);
      setAttempt((n) => n + 1);
    },
    [movie, selected],
  );
  const next = useCallback(
    (automatic = false) => {
      const failures = automatic ? [...failed, selected] : failed;
      if (automatic) setFailed(failures);
      const current = providers.findIndex((p) => p.id === selected);
      const ordered = [
        ...providers.slice(current + 1),
        ...providers.slice(0, current),
      ];
      const candidate = ordered.find((p) => !failures.includes(p.id));
      if (candidate) {
        if (automatic)
          setNotice(
            `${provider?.name ?? "Provider"} could not continue playback. Trying ${candidate.name}.`,
          );
        else
          setNotice(
            `Trying ${candidate.name}. Saved progress is used where supported.`,
          );
        switchTo(candidate.id);
      } else
        setNotice(
          "All enabled alternatives have been tried. Retry this provider, enable more in settings, or try again later.",
        );
    },
    [providers, selected, provider?.name, switchTo, failed],
  );
  const receive = useCallback(
    (event: MoviePlayerEvent) => {
      if (event.event === "error") {
        if (prefs.autoFallback) next(true);
        return;
      }
      if (
        event.event === "timeupdate" &&
        event.time === 0 &&
        !position.current.observed
      )
        return;
      position.current.observed = true;
      if (event.event === "ended") position.current.completed = true;
      else if (
        event.event === "play" &&
        event.time !== undefined &&
        event.time < position.current.duration - 30
      )
        position.current.completed = false;
      if (event.time !== undefined) position.current.time = event.time;
      if (event.duration !== undefined)
        position.current.duration = event.duration;
      if (event.event === "timeupdate" && Date.now() - lastSave.current < 5000)
        return;
      if (
        event.time !== undefined ||
        event.event === "ended" ||
        event.event === "pause"
      ) {
        saveMovieProgress(
          movie,
          selected,
          position.current.time,
          position.current.duration,
          position.current.completed,
        );
        lastSave.current = Date.now();
      }
    },
    [movie, selected, prefs.autoFallback, next],
  );
  useEffect(() => {
    // Flush observed progress on exit. Merely loading an iframe never creates history.
    const flush = () => {
      if (position.current.observed && position.current.time > 0)
        saveMovieProgress(
          movie,
          selected,
          position.current.time,
          position.current.duration,
          position.current.completed,
        );
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [movie, selected]);
  useEffect(() => {
    window.history.pushState(window.history.state, "", window.location.href);
    const back = () => onClose();
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [onClose]);
  if (!provider)
    return (
      <div className="rounded-2xl bg-card p-6 sm:p-8">
        <h2 className="t-title3">No provider can open this movie</h2>
        <p role="alert" className="t-sub mt-2 max-w-xl text-secondary">
          No enabled provider can open this movie. Enable more providers in
          playback settings, then watch again.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/movies/providers" className="btn btn-primary">
            Open playback settings
          </Link>
          <button onClick={onClose} className="btn btn-gray">
            Close player
          </button>
        </div>
      </div>
    );
  const options: MoviePlaybackOptions = { ...prefs, startAt: resumeAt };
  return (
    <section
      ref={container}
      className="movie-immersive fixed inset-0 z-50 flex flex-col bg-black"
      aria-label="Movie player"
    >
      <header className="flex shrink-0 items-center gap-2 px-2 pt-[max(8px,var(--safe-top))] pb-2">
        <button
          onClick={() => window.history.back()}
          aria-label="Close player"
          className="grid size-11 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15"
        >
          <ChevronLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="t-headline truncate">{movie.title}</h2>
          {startAt > 0 && provider.progress && (
            <p className="t-caption text-secondary">
              Resuming from {Math.floor(startAt / 60)} min
            </p>
          )}
        </div>
        <button
          onClick={() => setSources(true)}
          className="t-footnote min-h-11 rounded-full px-3 font-semibold text-white transition hover:bg-white/15"
        >
          Sources
        </button>
        <button
          onClick={() => {
            const stage =
              container.current?.querySelector<HTMLElement>(".movie-stage");
            void stage
              ?.requestFullscreen?.()
              .then(() =>
                (
                  screen.orientation as ScreenOrientation & {
                    lock?: (o: string) => Promise<void>;
                  }
                ).lock?.("landscape"),
              )
              .catch(() => {});
          }}
          aria-label="Full screen"
          className="grid size-11 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/15"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
          </svg>
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center pb-[var(--safe-bottom)]">
        <MovieFrame
          key={`${movie.id}|${provider.id}|${attempt}`}
          movie={movie}
          provider={provider}
          options={options}
          command={command}
          timeout={prefs.timeout}
          onEvent={receive}
        />
        {notice && (
          <p role="status" className="t-footnote mt-3 max-w-xl px-4 text-center text-secondary">
            {notice}
          </p>
        )}
      </div>
      {sources && (
        <MediaSheet title="Sources" onClose={() => setSources(false)}>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Change source">
            {providers.map((p) => (
              <button
                key={p.id}
                aria-pressed={selected === p.id}
                onClick={() => {
                  setNotice("");
                  switchTo(p.id);
                  setSources(false);
                }}
                className={`min-h-11 rounded-full px-4 text-sm font-medium transition ${selected === p.id ? "bg-white text-black" : "bg-fill text-label/85 hover:bg-fill-2"}`}
              >
                {p.name}
                {failed.includes(p.id) ? " · failed" : ""}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                next();
                setSources(false);
              }}
              className="btn btn-primary flex-1"
            >
              Try next source
            </button>
            <button
              onClick={() => {
                setFailed((ids) => ids.filter((id) => id !== selected));
                switchTo(selected);
                setSources(false);
              }}
              className="btn btn-gray"
            >
              Reload
            </button>
          </div>
      <details className="disclosure">
        <summary className="t-footnote text-secondary">
          More options and playback help
        </summary>
        <div className="pt-2 pb-1">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                position.current.time = 0;
                position.current.completed = false;
                setResumeAt(0);
                setAttempt((n) => n + 1);
                setNotice(
                  provider.progress
                    ? "Restarting from the beginning."
                    : "This provider controls its own resume position. Use its timeline to restart.",
                );
              }}
              className="btn btn-gray"
            >
              Start over
            </button>
          </div>
          {provider.progress === "cinesrc" && (
            <div
              className="mt-2 flex flex-wrap items-center gap-2"
              aria-label="Movie remote controls"
            >
              <button
                onClick={() =>
                  setCommand((c) => ({
                    id: (c?.id ?? 0) + 1,
                    name: "play",
                    args: [],
                  }))
                }
                className="btn btn-gray"
              >
                Play
              </button>
              <button
                onClick={() =>
                  setCommand((c) => ({
                    id: (c?.id ?? 0) + 1,
                    name: "pause",
                    args: [],
                  }))
                }
                className="btn btn-gray"
              >
                Pause
              </button>
              <button
                onClick={() =>
                  setCommand((c) => ({
                    id: (c?.id ?? 0) + 1,
                    name: "seek",
                    args: [Math.max(0, position.current.time - prefs.seek)],
                  }))
                }
                className="btn btn-gray"
              >
                Back {prefs.seek}s
              </button>
              <button
                onClick={() =>
                  setCommand((c) => ({
                    id: (c?.id ?? 0) + 1,
                    name: "seek",
                    args: [
                      Math.min(
                        position.current.duration || 86400,
                        position.current.time + prefs.seek,
                      ),
                    ],
                  }))
                }
                className="btn btn-gray"
              >
                Forward {prefs.seek}s
              </button>
              <label className="t-footnote flex h-11 items-center gap-2 px-2 text-secondary">
                Volume
                <input
                  aria-label="Movie volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  defaultValue="1"
                  onChange={(e) => {
                    const volume = Number(e.target.value);
                    setCommand((c) => ({
                      id: (c?.id ?? 0) + 1,
                      name: "setVolume",
                      args: [volume],
                    }));
                  }}
                  className="h-11 w-24 accent-[var(--color-accent)]"
                />
              </label>
            </div>
          )}
          <div className="t-footnote mt-3 max-w-2xl space-y-2 text-secondary">
            <p>
              {provider.note}{" "}
              {provider.progress
                ? "Progress is saved when this provider reports playback events."
                : "This provider doesn't expose progress; resume stays inside its own player."}{" "}
              {!provider.qualityPreference && prefs.quality !== "auto"
                ? "Choose quality inside this player; your resolution preference is not supported here."
                : ""}
            </p>
            <p>
              These providers expose embedded players, not downloadable video
              files, so offline movie downloads aren’t available. Use the
              player’s own settings for audio language, speed, subtitles and
              quality. Popups and redirects are always blocked, and a player that
              navigates away is put back. Some providers refuse to run this way.
              If a player stays blank or buffers, try the next provider.
            </p>
          </div>
        </div>
      </details>
        </MediaSheet>
      )}
    </section>
  );
}

function MovieFrame({
  movie,
  provider,
  options,
  timeout,
  onEvent,
  command,
}: {
  movie: Movie;
  provider: MovieProvider;
  options: MoviePlaybackOptions;
  timeout: number;
  command: PlayerCommand | null;
  onEvent: (event: MoviePlayerEvent) => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [src] = useState(() => provider.url(movie, options));
  const [status, setStatus] = useState(""),
    [waiting, setWaiting] = useState(true);
  const hasPlayed = useRef(false);
  // A frame's load event fires again only when the frame itself navigated: an ad taking over.
  const loads = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Providers switch to a cramped stacked layout in a phone-width frame. Lay the frame out
  // at a desktop width and shrink the result, which keeps their normal one-row controls.
  const scale =
    box.width > 0 && box.width < FRAME_WIDTH ? box.width / FRAME_WIDTH : 1;
  useEffect(() => {
    if (provider.progress !== "cinesrc" || !command) return;
    iframe.current?.contentWindow?.postMessage(
      { type: "cinesrc:command", command: command.name, args: command.args },
      provider.origin,
    );
  }, [command, provider]);
  useEffect(() => {
    let active = false,
      lastTime = options.startAt,
      lastAdvance = Date.now(),
      failed = false;
    const timer = setTimeout(() => {
      if (!hasPlayed.current) {
        setStatus(
          "Playback hasn't been confirmed. Press play inside the player, or try the next provider.",
        );
        setWaiting(false);
      }
    }, timeout * 1000);
    const watchdog = setInterval(() => {
      if (!active || failed || Date.now() - lastAdvance < timeout * 1000)
        return;
      failed = true;
      active = false;
      setWaiting(false);
      setStatus(
        "Playback stopped advancing. Try another provider or retry this one.",
      );
      onEvent({ event: "error" });
    }, 1000);
    const message = (event: MessageEvent) => {
      if (
        event.origin !== provider.origin ||
        event.source !== iframe.current?.contentWindow
      )
        return;
      const decoded = decodeMovieEvent(provider, event.data, movie);
      if (!decoded) return;
      if (decoded.event === "play") {
        active = true;
        lastAdvance = Date.now();
      }
      if (decoded.time !== undefined) {
        // Backward seeks reset the baseline too; otherwise healthy playback can look stuck
        // until it reaches the old position again.
        if (Math.abs(decoded.time - lastTime) > 0.05) lastAdvance = Date.now();
        lastTime = decoded.time;
      }
      if (
        decoded.event === "play" ||
        (decoded.event === "timeupdate" &&
          (decoded.time ?? 0) > options.startAt)
      ) {
        hasPlayed.current = true;
        setWaiting(false);
        setStatus("");
        clearTimeout(timer);
      } else if (decoded.event === "error") {
        active = false;
        failed = true;
        clearTimeout(timer);
        setWaiting(false);
        setStatus("The provider reported a playback error.");
      } else if (decoded.event === "pause") {
        active = false;
      } else if (decoded.event === "ended") {
        active = false;
      }
      onEvent(decoded);
    };
    window.addEventListener("message", message);
    return () => {
      clearTimeout(timer);
      clearInterval(watchdog);
      window.removeEventListener("message", message);
    };
  }, [provider, movie, timeout, onEvent, options.startAt]);
  return (
    <>
      <div
        ref={stage}
        className="movie-stage relative aspect-video w-[min(100vw,calc((100dvh-72px)*16/9))] shrink-0 overflow-hidden bg-black"
      >
        <iframe
          ref={iframe}
          src={src}
          title={`${movie.title} on ${provider.name}`}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="no-referrer"
          // Never add allow-popups or allow-top-navigation: they let ads leave the app.
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          className="absolute top-0 left-0 size-full border-0"
          style={
            scale < 1
              ? {
                  width: FRAME_WIDTH,
                  height: box.height / scale,
                  transform: `scale(${scale})`,
                  transformOrigin: "0 0",
                }
              : undefined
          }
          onLoad={(e) => {
            setWaiting(false);
            loads.current += 1;
            if (loads.current > 1) {
              if (loads.current > 4) {
                setStatus(
                  "This provider keeps redirecting. Try the next provider.",
                );
                e.currentTarget.removeAttribute("src");
                onEvent({ event: "error" });
                return;
              }
              e.currentTarget.src = src;
              setStatus("Blocked a redirect and restored the player.");
            }
          }}
          onError={() => {
            setWaiting(false);
            setStatus("Player couldn't open.");
            onEvent({ event: "error" });
          }}
        />
        {waiting && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
            <p className="rounded-full bg-black/80 px-5 py-3 text-sm">
              Opening {provider.name}…
            </p>
          </div>
        )}
      </div>
      {status && (
        <p role="status" className="t-footnote mt-3 max-w-xl px-4 text-center text-secondary">
          {status}
        </p>
      )}
    </>
  );
}
