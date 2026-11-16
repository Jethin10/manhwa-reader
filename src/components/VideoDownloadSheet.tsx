"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Anime, Episode } from "@/lib/anime";
import { loadMedia } from "@/lib/anime-client";
import { inspectHlsDownloadOptions } from "@/lib/offline-hls";
import {
  queueVideoDownloads,
  useVideoDownloads,
  type VideoDownloadOptions,
} from "@/lib/video-downloads";
import { cacheOfflineShell } from "@/lib/downloads";
import { toast } from "@/lib/toast";
import { MediaSheet } from "./MediaSheet";
import { DownloadGlyph } from "./ChapterList";

type Quality = VideoDownloadOptions["quality"];
const LIMITS = [480, 720, 1080, 2160] as const;
const BATCH = 200;
const QUALITY_PREF = "mr:download-quality";

function storedQuality(): Quality {
  try {
    const value = localStorage.getItem(QUALITY_PREF);
    if (value && ["480", "720", "1080", "2160", "best"].includes(value))
      return value as Quality;
  } catch {}
  return "1080";
}

export default function VideoDownloadButton(props: {
  anime: Anime;
  episodes: Episode[];
  currentEpisode: string;
  audio: "sub" | "dub";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn btn-gray"
        disabled={!props.episodes.length}
        onClick={() => setOpen(true)}
      >
        <DownloadGlyph className="size-4" />
        Download
      </button>
      {open && <DownloadSheet {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

type Status =
  | { kind: "saved" }
  | { kind: "active"; progress: number; state: string }
  | { kind: "unavailable" };

function DownloadSheet({
  anime,
  episodes,
  currentEpisode,
  audio: initialAudio,
  onClose,
}: {
  anime: Anime;
  episodes: Episode[];
  currentEpisode: string;
  audio: "sub" | "dub";
  onClose: () => void;
}) {
  const { saved, jobs } = useVideoDownloads();
  const at = Math.max(
    0,
    episodes.findIndex((episode) => episode.id === currentEpisode),
  );
  const [audio, setAudio] = useState(initialAudio),
    [audioTrack, setAudioTrack] = useState("");
  const [quality, setQualityState] = useState<Quality>(storedQuality);
  const setQuality = (value: Quality) => {
    setQualityState(value);
    try {
      localStorage.setItem(QUALITY_PREF, value);
    } catch {}
  };
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(episodes[at] ? [episodes[at].id] : []),
  );
  const [attempt, setAttempt] = useState(0),
    [submitting, setSubmitting] = useState(false);

  // Quality and language options come from the episode on screen.
  const key = `${audio}|${attempt}`;
  const [inspection, setInspection] = useState<{
    key: string;
    heights: number[];
    audioTracks: { name: string; language: string }[];
    error?: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void loadMedia(currentEpisode, audio)
      .then((media) => inspectHlsDownloadOptions(media.src, controller.signal))
      .then((options) => {
        if (!controller.signal.aborted) setInspection({ key, ...options });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setInspection({
            key,
            heights: [],
            audioTracks: [],
            error:
              error instanceof Error
                ? error.message
                : "Download options couldn't load.",
          });
      });
    return () => controller.abort();
  }, [currentEpisode, audio, key]);
  const ready = inspection?.key === key;

  // One button per quality limit that actually changes the result, labelled
  // with the resolution it saves (e.g. a 540p source shows as "540p").
  const qualityChoices = useMemo(() => {
    if (!ready || !inspection.heights.length) return [];
    const heights = [...inspection.heights].sort((a, b) => a - b);
    const choices: { value: Quality; height: number }[] = [];
    for (const limit of LIMITS) {
      const best = heights.filter((height) => height <= limit).pop();
      if (best && !choices.some((choice) => choice.height === best))
        choices.push({ value: String(limit) as Quality, height: best });
    }
    const top = heights[heights.length - 1];
    if (!choices.some((choice) => choice.height === top))
      choices.push({ value: "best", height: top });
    return choices;
  }, [ready, inspection]);
  const effectiveQuality: Quality = !ready
    ? quality
    : !qualityChoices.length
      ? "best"
      : qualityChoices.some((choice) => choice.value === quality)
        ? quality
        : (qualityChoices
            .filter(
              (choice) =>
                choice.value !== "best" &&
                choice.height <= (quality === "best" ? 9999 : Number(quality)),
            )
            .pop()?.value ?? qualityChoices[0].value);

  // What each episode already is on this device, for this version.
  const statuses = useMemo(() => {
    const map = new Map<string, Status>();
    for (const item of Object.values(saved))
      if (item.anime.id === anime.id && item.audio === audio)
        map.set(item.episode.id, { kind: "saved" });
    for (const job of jobs)
      if (
        job.anime.id === anime.id &&
        job.audio === audio &&
        !map.has(job.episode.id)
      )
        map.set(job.episode.id, {
          kind: "active",
          progress: job.total ? job.done / job.total : 0,
          state: job.state,
        });
    if (audio === "dub" && anime.dub > 0 && anime.dub < episodes.length)
      episodes
        .slice(anime.dub)
        .forEach(
          (episode) =>
            !map.has(episode.id) &&
            map.set(episode.id, { kind: "unavailable" }),
        );
    return map;
  }, [saved, jobs, anime.id, anime.dub, audio, episodes]);
  const selectable = (episode: Episode) => !statuses.has(episode.id);
  const chosen = episodes.filter(
    (episode) => picked.has(episode.id) && selectable(episode),
  );
  const batch = chosen.slice(0, BATCH);
  const savedCount = episodes.filter(
    (episode) => statuses.get(episode.id)?.kind === "saved",
  ).length;
  const activeCount = episodes.filter(
    (episode) => statuses.get(episode.id)?.kind === "active",
  ).length;

  function pick(list: Episode[]) {
    setPicked(new Set(list.filter(selectable).map((episode) => episode.id)));
  }
  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const presets: { label: string; list: Episode[] }[] = [
    { label: "This episode", list: episodes.slice(at, at + 1) },
    ...(episodes.length - at > 2
      ? [
          {
            label: `Next ${Math.min(5, episodes.length - at)}`,
            list: episodes.slice(at, at + 5),
          },
        ]
      : []),
    ...(at > 0 && episodes.length - at > 5
      ? [{ label: "From here", list: episodes.slice(at) }]
      : []),
    { label: "All", list: episodes },
  ];
  const isPreset = (list: Episode[]) => {
    const ids = list.filter(selectable);
    return (
      ids.length > 0 &&
      ids.length === chosen.length &&
      ids.every((episode) => picked.has(episode.id))
    );
  };

  async function download() {
    setSubmitting(true);
    try {
      if (!navigator.serviceWorker?.controller || !window.isSecureContext)
        throw new Error(
          "Offline video needs HTTPS and the offline service. Reload the hosted app once, then try again.",
        );
      await Promise.all([
        import("hls.js"),
        import("./AdaptiveVideo"),
        cacheOfflineShell(),
      ]);
      if (!(await (await caches.open("shell-v2")).match("/downloads")))
        throw new Error(
          "The offline screen couldn't be saved. Check your connection and retry.",
        );
      const count = queueVideoDownloads(
        { id: anime.id, title: anime.title, cover: anime.cover },
        batch,
        {
          audio,
          quality: effectiveQuality,
          ...(audioTrack ? { audioTrack } : {}),
        },
      );
      if (count) {
        toast(
          `Downloading ${count} ${count === 1 ? "episode" : "episodes"}`,
          { action: { label: "View", href: "/downloads" } },
        );
        onClose();
      }
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Couldn't prepare downloads.",
        { tone: "error" },
      );
    } finally {
      setSubmitting(false);
    }
  }

  const blocked = !batch.length || !ready || !!inspection?.error || submitting;
  const qualityLabel =
    qualityChoices.find((choice) => choice.value === effectiveQuality)
      ?.height ?? null;

  return (
    <MediaSheet
      title="Download"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Link
            href="/downloads"
            className="btn btn-gray flex-none px-4"
            aria-label="Manage downloads"
          >
            Manage
          </Link>
          <button
            className="btn btn-primary min-w-0 flex-1"
            disabled={blocked}
            onClick={() => void download()}
          >
            <DownloadGlyph className="size-4 flex-none" />
            <span className="truncate">
              {submitting
                ? "Starting…"
                : !batch.length
                  ? chosen.length || picked.size
                    ? "Already downloaded"
                    : "Pick episodes"
                  : `Download ${batch.length} ${batch.length === 1 ? "episode" : "episodes"}${qualityLabel ? ` · ${qualityLabel}p` : ""}`}
            </span>
          </button>
        </div>
      }
    >
      <div>
        <p className="t-headline">{anime.title}</p>
        <p className="mt-1 text-sm text-secondary">
          {episodes.length} {episodes.length === 1 ? "episode" : "episodes"}
          {savedCount ? ` · ${savedCount} saved` : ""}
          {activeCount ? ` · ${activeCount} downloading` : ""}
        </p>
      </div>

      <Row label="Version">
        <Segmented
          label="Version"
          value={audio}
          onChange={(value) => {
            setAudio(value);
            setAudioTrack("");
          }}
          options={[
            { value: "sub", label: "Subtitled" },
            {
              value: "dub",
              label: "Dubbed",
              disabled: anime.dub === 0 && initialAudio !== "dub",
            },
          ]}
        />
      </Row>

      <Row label="Quality">
        {!ready ? (
          <div
            role="status"
            aria-label="Checking available qualities"
            className="flex gap-2"
          >
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className="h-11 flex-1 animate-pulse rounded-lg bg-fill"
              />
            ))}
          </div>
        ) : inspection.error ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-lg bg-fill px-4 py-3 text-sm"
          >
            <span className="text-secondary">
              Couldn&apos;t reach this episode&apos;s video.
            </span>
            <button
              className="btn btn-gray h-9 px-3 text-sm"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        ) : qualityChoices.length === 1 ? (
          <p className="text-sm text-secondary">
            <span className="font-semibold text-label">
              {qualityChoices[0].height}p
            </span>{" "}
            · the only quality this episode offers.
          </p>
        ) : qualityChoices.length ? (
          <>
            <Segmented
              label="Quality"
              value={effectiveQuality}
              onChange={setQuality}
              options={qualityChoices.map((choice) => ({
                value: choice.value,
                label: choice.height >= 2160 ? "4K" : `${choice.height}p`,
              }))}
            />
            <p className="mt-2 text-xs text-secondary">
              {effectiveQuality === qualityChoices[0].value &&
              qualityChoices.length > 1
                ? "Smallest files, saves storage."
                : effectiveQuality ===
                    qualityChoices[qualityChoices.length - 1].value
                  ? "Best picture, uses the most storage."
                  : "Good balance of picture and storage."}
            </p>
          </>
        ) : (
          <p className="text-sm text-secondary">
            Saved at the source&apos;s quality.
          </p>
        )}
      </Row>

      {ready && !inspection.error && inspection.audioTracks.length > 1 && (
        <Row label="Audio">
          <select
            aria-label="Download audio language"
            className="field w-full"
            value={audioTrack}
            onChange={(event) => setAudioTrack(event.target.value)}
          >
            <option value="">Default</option>
            {inspection.audioTracks.map((track) => (
              <option key={track.name} value={track.name}>
                {track.name}
                {track.language ? ` (${track.language})` : ""}
              </option>
            ))}
          </select>
        </Row>
      )}

      <section aria-label="Episodes">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">Episodes</h3>
          <span className="text-xs text-secondary">
            {chosen.length ? `${chosen.length} selected` : "Tap to select"}
          </span>
        </div>
        <div className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
          {presets.map((preset) => (
            <button
              key={preset.label}
              className="chip"
              aria-pressed={isPreset(preset.list)}
              onClick={() => pick(preset.list)}
            >
              {preset.label}
            </button>
          ))}
          {!!chosen.length && (
            <button className="chip" onClick={() => setPicked(new Set())}>
              Clear
            </button>
          )}
        </div>
        <ul
          ref={(grid) => {
            // Start the grid at the episode being watched on long series.
            const tile = grid?.children[at] as HTMLElement | undefined;
            if (grid && tile && !grid.dataset.scrolled) {
              grid.dataset.scrolled = "1";
              grid.scrollTop = tile.offsetTop - grid.offsetTop - 8;
            }
          }}
          className="grid max-h-64 grid-cols-5 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-6"
        >
          {episodes.map((episode) => {
            const status = statuses.get(episode.id);
            const on = !status && picked.has(episode.id);
            return (
              <li key={episode.id}>
                <EpisodeTile
                  episode={episode}
                  status={status}
                  selected={on}
                  current={episode.id === currentEpisode}
                  onToggle={() => toggle(episode.id)}
                />
              </li>
            );
          })}
        </ul>
        {chosen.length > BATCH && (
          <p className="mt-2 text-xs text-secondary">
            The first {BATCH} start now. Come back for the rest afterward.
          </p>
        )}
        <p className="mt-3 text-xs leading-5 text-secondary">
          Downloads run while Kairo is open, and keep going (more slowly) while you watch.
        </p>
      </section>
    </MediaSheet>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">{label}</p>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-1 rounded-[10px] bg-fill p-1"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={on}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`h-10 min-w-0 flex-1 truncate rounded-lg px-2 text-sm font-semibold transition-colors disabled:opacity-35 ${
              on
                ? "bg-label text-bg shadow-sm"
                : "text-secondary hover:text-label"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function EpisodeTile({
  episode,
  status,
  selected,
  current,
  onToggle,
}: {
  episode: Episode;
  status?: Status;
  selected: boolean;
  current: boolean;
  onToggle: () => void;
}) {
  const label = `Episode ${episode.number}${
    status?.kind === "saved"
      ? ", downloaded"
      : status?.kind === "active"
        ? `, ${status.state === "paused" ? "paused" : "downloading"}`
        : status?.kind === "unavailable"
          ? ", not dubbed"
          : ""
  }`;
  return (
    <button
      aria-label={label}
      aria-pressed={status ? undefined : selected}
      disabled={!!status}
      onClick={onToggle}
      className={`relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg text-sm font-semibold tabular-nums transition-colors ${
        selected
          ? "bg-label text-bg"
          : status?.kind === "unavailable"
            ? "bg-fill text-tertiary line-through opacity-50"
            : status
              ? "bg-fill text-secondary"
              : "bg-fill text-label hover:bg-fill-2"
      } ${current && !selected ? "ring-1 ring-label/60 ring-inset" : ""}`}
    >
      {episode.number}
      {status?.kind === "saved" && (
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className="absolute top-1 right-1 size-3 text-success"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="m2.5 6.5 2.2 2 4.8-5" strokeLinecap="round" />
        </svg>
      )}
      {status?.kind === "active" && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10"
        >
          <span
            className={`block h-full ${status.state === "paused" ? "bg-secondary" : "bg-label"}`}
            style={{ width: `${Math.max(6, status.progress * 100)}%` }}
          />
        </span>
      )}
    </button>
  );
}
