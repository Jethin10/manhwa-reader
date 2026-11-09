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
import {
  getMovieHistory,
  getMoviePreferences,
  saveMovieProgress,
} from "@/lib/movie-library";
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
    [theater, setTheater] = useState(false),
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
      className={
        theater
          ? "fixed inset-0 z-50 overflow-auto bg-black px-3 pt-[max(12px,var(--safe-top))] pb-[max(12px,var(--safe-bottom))] sm:px-6"
          : "-mx-5 border-y border-hairline bg-black p-4 sm:mx-0 sm:rounded-2xl sm:border sm:p-5"
      }
      aria-label="Movie player"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="t-headline truncate">{movie.title}</h2>
          <p className="t-footnote mt-0.5 text-secondary">
            {provider.name}
            {startAt > 0 && provider.progress
              ? `, resuming from ${Math.floor(startAt / 60)} min`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTheater((v) => !v)}
            className="btn btn-gray"
          >
            {theater ? "Exit theater" : "Theater"}
          </button>
          <button
            onClick={() => {
              void container.current
                ?.requestFullscreen?.()
                .catch(() =>
                  setNotice(
                    "Fullscreen isn't available here. Use Theater instead.",
                  ),
                );
            }}
            className="btn btn-gray"
          >
            Full screen
          </button>
          <button
            onClick={onClose}
            aria-label="Close player"
            title="Close player"
            className="grid size-11 place-items-center rounded-full bg-fill transition-colors hover:bg-fill-2"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-4">
        <MovieFrame
          key={`${movie.id}|${provider.id}|${attempt}`}
          movie={movie}
          provider={provider}
          options={options}
          isolate={prefs.isolatePlayer}
          command={command}
          timeout={prefs.timeout}
          onEvent={receive}
        />
      </div>
      {notice && (
        <p role="status" className="t-footnote mt-3 rounded-xl bg-fill px-3 py-2.5">
          {notice}
        </p>
      )}
      <div
        role="group"
        aria-label="Change provider"
        className="mt-4 grid gap-2 border-t border-hairline pt-4 sm:flex sm:flex-wrap sm:items-center"
      >
        <label className="t-footnote flex items-center gap-3 text-secondary">
          Provider
          <select
            aria-label="Movie playback provider"
            value={selected}
            onChange={(e) => {
              setNotice("");
              switchTo(e.target.value);
            }}
            className="field min-w-0 flex-1 sm:w-52 sm:flex-none"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {failed.includes(p.id) ? " · reported error" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex">
          <button onClick={() => next()} className="btn btn-tinted">
            Try next provider
          </button>
          <button
            onClick={() => {
              setFailed((ids) => ids.filter((id) => id !== selected));
              switchTo(selected);
              setNotice("Reloading this provider.");
            }}
            className="btn btn-gray"
          >
            Retry
          </button>
        </div>
      </div>
      <details className="disclosure mt-3">
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
            <a
              href={provider.url(movie, options)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-gray"
            >
              Open in new tab
            </a>
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
              quality. Popup blocking is optional in playback settings; some
              providers reject blocked popups or sandboxed frames. If a player
              stays blank or buffers, try the next provider.
            </p>
          </div>
        </div>
      </details>
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
  isolate,
}: {
  movie: Movie;
  provider: MovieProvider;
  options: MoviePlaybackOptions;
  timeout: number;
  command: PlayerCommand | null;
  isolate: boolean;
  onEvent: (event: MoviePlayerEvent) => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [src] = useState(() => provider.url(movie, options));
  const [status, setStatus] = useState("Opening player…"),
    [waiting, setWaiting] = useState(true);
  const hasPlayed = useRef(false);
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
        setStatus("Playback confirmed");
        clearTimeout(timer);
      } else if (decoded.event === "error") {
        active = false;
        failed = true;
        clearTimeout(timer);
        setWaiting(false);
        setStatus("The provider reported a playback error.");
      } else if (decoded.event === "pause") {
        active = false;
        setStatus("Paused");
      } else if (decoded.event === "ended") {
        active = false;
        setStatus("Finished");
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
      <div className="relative aspect-video overflow-hidden rounded-xl bg-card">
        <iframe
          ref={iframe}
          src={src}
          title={`${movie.title} on ${provider.name}`}
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          referrerPolicy="no-referrer"
          sandbox={
            isolate
              ? "allow-scripts allow-same-origin allow-forms allow-presentation"
              : undefined
          }
          className="absolute inset-0 size-full border-0"
          onLoad={() => {
            setWaiting(false);
            if (!hasPlayed.current)
              setStatus("Player frame loaded. Press play inside it to start.");
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
      <p role="status" className="t-footnote mt-2 text-secondary">
        {status}
      </p>
    </>
  );
}
