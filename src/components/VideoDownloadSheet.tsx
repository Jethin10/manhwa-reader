"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
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
  const [scope, setScope] = useState("episode");
  const [from, setFrom] = useState(at + 1),
    [to, setTo] = useState(Math.min(episodes.length, at + 5));
  const [audio, setAudio] = useState(initialAudio),
    [audioTrack, setAudioTrack] = useState("");
  const [quality, setQuality] =
    useState<VideoDownloadOptions["quality"]>("1080");
  const [attempt, setAttempt] = useState(0),
    [submitting, setSubmitting] = useState(false);
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
  const effectiveQuality =
    ready && !inspection.heights.length ? "best" : quality;
  const qualityAvailable =
    !ready ||
    effectiveQuality === "best" ||
    inspection.heights.some((height) => height <= Number(effectiveQuality));
  const chosen =
    scope === "episode"
      ? episodes.slice(at, at + 1)
      : scope === "next"
        ? episodes.slice(at, at + 5)
        : scope === "all"
          ? episodes
          : episodes.slice(Math.max(0, from - 1), Math.max(from, to));
  const existing = new Set(
    [...Object.values(saved), ...jobs]
      .filter(
        (item) =>
          item.anime.id === anime.id &&
          item.audio === audio &&
          item.quality === effectiveQuality &&
          (item.audioTrack ?? "") === audioTrack,
      )
      .map((item) => item.episode.id),
  );
  const pending = chosen.filter((episode) => !existing.has(episode.id));
  const batch = pending.slice(0, 200);
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
          `${count} ${count === 1 ? "episode" : "episodes"} added to downloads`,
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
  return (
    <MediaSheet title="Download episodes" onClose={onClose}>
      <p className="t-headline">{anime.title}</p>
      <label className="block text-sm">
        Episodes
        <select
          className="field mt-2 w-full"
          aria-label="Episodes to download"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <option value="episode">Episode {episodes[at]?.number}</option>
          <option value="next">
            This and the next {Math.min(4, episodes.length - at - 1)}
          </option>
          <option value="all">
            All {episodes.length} episodes in this title
          </option>
          <option value="range">Choose a range</option>
        </select>
      </label>
      {scope === "range" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            First episode
            <select
              aria-label="First episode"
              value={from}
              onChange={(event) => {
                const value = Number(event.target.value);
                setFrom(value);
                setTo((last) => Math.max(value, last));
              }}
              className="field mt-2 w-full"
            >
              {episodes.map((episode, index) => (
                <option key={episode.id} value={index + 1}>
                  Episode {episode.number}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Last episode
            <select
              aria-label="Last episode"
              value={to}
              onChange={(event) => setTo(Number(event.target.value))}
              className="field mt-2 w-full"
            >
              {episodes.slice(from - 1).map((episode, index) => (
                <option key={episode.id} value={from + index}>
                  Episode {episode.number}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label className="block text-sm">
        Version
        <select
          className="field mt-2 w-full"
          value={audio}
          onChange={(event) => {
            setAudio(event.target.value as "sub" | "dub");
            setAudioTrack("");
          }}
        >
          <option value="sub">Subtitled</option>
          <option value="dub">Dubbed</option>
        </select>
      </label>
      {!ready ? (
        <p role="status" className="text-sm text-secondary">
          Checking available quality and languages…
        </p>
      ) : inspection.error ? (
        <div role="alert" className="space-y-2 text-sm text-secondary">
          <p>{inspection.error}</p>
          <button
            className="btn btn-gray"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry options
          </button>
        </div>
      ) : (
        <>
          {!!inspection.audioTracks.length && (
            <label className="block text-sm">
              Audio language
              <select
                aria-label="Download audio language"
                className="field mt-2 w-full"
                value={audioTrack}
                onChange={(event) => setAudioTrack(event.target.value)}
              >
                <option value="">Use this version&apos;s default</option>
                {inspection.audioTracks.map((track) => (
                  <option key={track.name} value={track.name}>
                    {track.name}
                    {track.language ? ` (${track.language})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            Quality limit
            <select
              aria-label="Download quality limit"
              disabled={!inspection.heights.length}
              className="field mt-2 w-full"
              value={effectiveQuality}
              onChange={(event) =>
                setQuality(
                  event.target.value as VideoDownloadOptions["quality"],
                )
              }
            >
              {(
                [
                  ["480", "Up to 480p · smaller files"],
                  ["720", "Up to 720p"],
                  ["1080", "Up to 1080p"],
                  ["2160", "Up to 4K"],
                ] as const
              ).map(([value, text]) => (
                <option
                  key={value}
                  value={value}
                  disabled={
                    !inspection.heights.some(
                      (height) => height <= Number(value),
                    )
                  }
                >
                  {text}
                </option>
              ))}
              <option value="best">Highest source quality</option>
            </select>
          </label>
          {!qualityAvailable && (
            <p role="alert" className="text-sm text-secondary">
              Choose a quality available for this episode.
            </p>
          )}
          <p className="text-xs leading-5 text-secondary">
            {inspection.heights.length
              ? `This episode offers ${inspection.heights.map((height) => `${height}p`).join(", ")}. The highest rendition within your limit is saved.`
              : "This source doesn't list selectable resolutions; its source rendition is saved."}{" "}
            Higher resolutions use more storage. Languages may differ by
            episode.
          </p>
        </>
      )}
      <div className="space-y-2 rounded-xl bg-fill p-4 text-sm">
        <p className="font-semibold">
          {batch.length} {batch.length === 1 ? "episode" : "episodes"} to
          download
        </p>
        <p className="text-secondary">
          {chosen.length - pending.length
            ? `${chosen.length - pending.length} already saved or queued. `
            : ""}
          Keep the app open. Downloads wait while video plays, then continue
          when paused. Saved videos play from this device.
        </p>
        {pending.length > batch.length && (
          <p className="text-secondary">
            Up to 200 episodes per batch. Start another batch afterward for the
            remaining episodes.
          </p>
        )}
      </div>
      <button
        className="btn btn-primary w-full"
        disabled={
          !batch.length ||
          !ready ||
          !qualityAvailable ||
          !!inspection?.error ||
          submitting
        }
        onClick={() => void download()}
      >
        {submitting
          ? "Preparing offline player…"
          : `Download ${batch.length} ${batch.length === 1 ? "episode" : "episodes"}`}
      </button>
      <Link href="/downloads" className="btn btn-gray w-full">
        Manage downloads
      </Link>
      <p className="text-xs leading-5 text-secondary">
        Direct VOD sources only. Unsupported live, DRM and byte-range streams
        show an error. Each title has its own episode list; other seasons are
        selected from Seasons.
      </p>
    </MediaSheet>
  );
}
