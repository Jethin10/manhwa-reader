"use client";
import type { ReactNode } from "react";
import {
  MOVIE_PROVIDERS,
  RESEARCH_MOVIE_PROVIDERS,
} from "@/lib/movie-providers";
import {
  DEFAULT_MOVIE_PREFERENCES,
  setMoviePreferences,
  useMoviePreferences,
} from "@/lib/movie-library";

function SelectRow({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="row-divider flex min-h-14 items-center justify-between gap-3 px-4 py-1.5">
      <span className="t-sub min-w-0">{label}</span>
      <select
        className="field w-44 max-w-[58%] shrink-0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

const TOGGLES = [
  ["autoplay", "Autoplay when allowed", ""],
  ["autoFallback", "Try next provider on reported errors", ""],
  ["rememberProgress", "Remember playback progress", ""],
] as const;

export function MovieProviderSettings({
  compact = false,
}: {
  compact?: boolean;
}) {
  const prefs = useMoviePreferences();
  const enabled = MOVIE_PROVIDERS.filter(
    (p) => !prefs.disabledProviders.includes(p.id),
  ).length;
  return (
    <div>
      <div className="grouped">
        <SelectRow
          label="Preferred provider"
          value={prefs.preferredProvider}
          onChange={(preferredProvider) =>
            setMoviePreferences({ preferredProvider })
          }
        >
          <option value="auto">Auto</option>
          {MOVIE_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectRow>
        <SelectRow
          label="Quality preference"
          value={prefs.quality}
          onChange={(value) =>
            setMoviePreferences({ quality: value as typeof prefs.quality })
          }
        >
          <option value="auto">Adaptive</option>
          <option value="2160">Prefer 4K</option>
          <option value="1080">Prefer 1080p</option>
          <option value="720">Prefer 720p</option>
          <option value="480">Prefer 480p</option>
        </SelectRow>
        <SelectRow
          label="Preferred subtitles"
          value={prefs.subtitles}
          onChange={(subtitles) => setMoviePreferences({ subtitles })}
        >
          {[
            ["en", "English"],
            ["te", "Telugu"],
            ["hi", "Hindi"],
            ["ta", "Tamil"],
            ["ml", "Malayalam"],
            ["kn", "Kannada"],
            ["off", "Off"],
          ].map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </SelectRow>
      </div>
      <div className="grouped mt-3">
        {TOGGLES.map(([key, label, hint]) => (
          <label
            key={key}
            className="row-divider flex min-h-14 cursor-pointer items-center justify-between gap-4 px-4 py-2.5"
          >
            <span className="min-w-0">
              <span className="t-sub block">{label}</span>
              {hint && (
                <span className="t-caption mt-0.5 block text-secondary">
                  {hint}
                </span>
              )}
            </span>
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => setMoviePreferences({ [key]: e.target.checked })}
              className="switch"
            />
          </label>
        ))}
      </div>
      <details className="disclosure mt-3">
        <summary className="t-footnote text-secondary">
          Timing and how preferences apply
        </summary>
        <div className="pt-2 pb-2">
          <div className="grouped">
            <SelectRow
              label="Loading reminder"
              value={prefs.timeout}
              onChange={(value) =>
                setMoviePreferences({ timeout: Number(value) })
              }
            >
              {[15, 20, 30, 45].map((n) => (
                <option key={n} value={n}>
                  {n} seconds
                </option>
              ))}
            </SelectRow>
            <SelectRow
              label="Seek interval"
              value={prefs.seek}
              onChange={(value) => setMoviePreferences({ seek: Number(value) })}
            >
              {[5, 10, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {n} seconds
                </option>
              ))}
            </SelectRow>
          </div>
          <p className="t-footnote mt-3 max-w-2xl text-secondary">
            Settings apply the next time you open a player. Auto follows the
            recommended provider order. Adaptive starts faster. Popup blocking
            uses an iframe sandbox, which some providers reject. CineSrc accepts
            preferred resolution and seek interval, and subtitle preferences
            apply where documented. Audio, speed and available resolutions are
            controlled inside each provider’s player. A preference can’t create
            a missing track or a higher-resolution copy.
          </p>
        </div>
      </details>
      {!compact && (
        <>
          <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="t-title2">Providers</h2>
            <p className="t-footnote text-secondary tabular-nums">
              {enabled} of {MOVIE_PROVIDERS.length} on
            </p>
          </div>
          <p className="t-sub mt-1 max-w-2xl text-secondary">
            Independent services that decide which movies, audio tracks and
            quality you get. Turn off any you don’t want tried. Only one player
            loads at a time.
          </p>
          {enabled === 0 && (
            <p role="alert" className="t-sub mt-3 text-warning">
              All providers are disabled. Enable at least one to watch movies.
            </p>
          )}
          <ul className="grouped mt-3">
            {MOVIE_PROVIDERS.map((p) => (
              <li key={p.id} className="row-divider">
                <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-4 py-3">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="t-sub font-semibold">{p.name}</span>
                      {p.progress && (
                        <span className="t-caption text-success">
                          Saves progress
                        </span>
                      )}
                    </span>
                    <span className="t-footnote mt-0.5 block text-secondary">
                      {p.note}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    aria-label={`Enable ${p.name}`}
                    checked={!prefs.disabledProviders.includes(p.id)}
                    onChange={(e) =>
                      setMoviePreferences({
                        disabledProviders: e.target.checked
                          ? prefs.disabledProviders.filter((id) => id !== p.id)
                          : [...prefs.disabledProviders, p.id],
                      })
                    }
                    className="switch"
                  />
                </label>
              </li>
            ))}
          </ul>
          <details className="disclosure mt-6 border-t border-hairline pt-2">
            <summary className="t-sub font-semibold">
              Regional sources not connected yet (
              {RESEARCH_MOVIE_PROVIDERS.length})
            </summary>
            <p className="t-footnote mt-1 max-w-2xl text-secondary">
              These came up in research or community adapters. They aren’t
              players in this app and can’t be turned on. Each one needs a
              working adapter and title and audio checks before it can be
              offered.
            </p>
            <ul className="mt-4 grid gap-x-6 gap-y-3 pb-3 sm:grid-cols-2">
              {RESEARCH_MOVIE_PROVIDERS.map(([name, note]) => (
                <li key={name}>
                  <p className="t-footnote font-medium break-words">{name}</p>
                  <p className="t-caption mt-0.5 text-secondary">{note}</p>
                </li>
              ))}
            </ul>
          </details>
          <button
            onClick={() => setMoviePreferences(DEFAULT_MOVIE_PREFERENCES)}
            className="btn btn-gray mt-6"
          >
            Reset defaults
          </button>
        </>
      )}
    </div>
  );
}
