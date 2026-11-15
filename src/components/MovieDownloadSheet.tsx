"use client";
import Link from "next/link";
import type { Movie } from "@/lib/movie-types";
import { formatBytes } from "@/lib/downloads";
import { toast } from "@/lib/toast";
import {
  deleteMovieDownload,
  formatDuration,
  pauseMovieDownload,
  playMovieDownload,
  qualityLabel,
  resumeMovieDownload,
  startMovieDownload,
  type MovieDownload,
  type MovieStream,
} from "@/lib/native-movies";
import { MediaSheet } from "./MediaSheet";

type Choice = { key: string; label: string; detail: string; stream: MovieStream; height?: number };

/** Every quality each found stream offers, best first. */
function choices(streams: MovieStream[]): Choice[] {
  const out: Choice[] = [];
  // A player loads the list of qualities, then one quality's own playlist. Offer the list.
  const hasList = streams.some((s) => s.kind === "hls" && s.variants?.length);
  for (const s of streams) {
    if (hasList && s.kind === "hls" && !s.variants?.length) continue;
    if (s.kind === "file") {
      out.push({
        key: s.url,
        label: "Full movie file",
        detail: s.size ? formatBytes(s.size) : "Size unknown",
        stream: s,
      });
      continue;
    }
    const length = s.duration ? formatDuration(s.duration) : "";
    const heights = [...new Set((s.variants ?? []).map((v) => v.height))]
      .filter((h) => h > 0)
      .sort((a, b) => b - a);
    if (!heights.length)
      out.push({ key: s.url, label: "Best available", detail: length, stream: s });
    for (const h of heights)
      out.push({ key: `${s.url}|${h}`, label: qualityLabel(h), detail: length, stream: s, height: h });
  }
  return out;
}

export function MovieDownloadSheet({
  movie,
  streams,
  saved,
  sourceName,
  cameraCopy,
  onClose,
}: {
  movie: Movie;
  streams: MovieStream[];
  saved?: MovieDownload;
  sourceName: string;
  cameraCopy: boolean;
  onClose: () => void;
}) {
  const options = choices(streams);
  return (
    <MediaSheet title="Download" onClose={onClose}>
      {saved?.state === "done" ? (
        <div>
          <p className="t-callout">
            Saved on this phone · {saved.quality} · {formatBytes(saved.bytes)}
          </p>
          <p className="t-footnote mt-1 text-secondary">
            Plays without a connection, from where you left off.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => playMovieDownload(saved.id)}
              className="btn btn-primary flex-1"
            >
              Play offline
            </button>
            <button
              onClick={() => {
                deleteMovieDownload(saved.id);
                toast("Download deleted.");
              }}
              className="btn btn-gray text-[#ff453a]"
            >
              Delete
            </button>
          </div>
        </div>
      ) : saved ? (
        <div>
          <p className="t-callout">
            {saved.state === "paused"
              ? "Paused"
              : saved.state === "queued"
                ? "Waiting to start"
                : "Saving to this phone"}{" "}
            · {saved.quality}
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{
                width: `${saved.total ? Math.min(100, (saved.bytes / saved.total) * 100) : 2}%`,
              }}
            />
          </div>
          <p className="t-footnote mt-2 text-secondary">
            {formatBytes(saved.bytes)}
            {saved.total ? ` of ${formatBytes(saved.total)}` : ""}. It keeps
            going in the background; you can close the player.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() =>
                saved.state === "paused"
                  ? resumeMovieDownload(saved.id)
                  : pauseMovieDownload(saved.id)
              }
              className="btn btn-gray flex-1"
            >
              {saved.state === "paused" ? "Resume" : "Pause"}
            </button>
            <Link href="/downloads?tab=movies" className="btn btn-gray flex-1">
              Downloads
            </Link>
          </div>
        </div>
      ) : options.length ? (
        <div>
          {cameraCopy && (
            <p className="t-footnote mb-3 rounded-xl bg-[#ff9f0a]/15 p-3 text-[#ffd60a]">
              {sourceName} may be playing a cinema camera recording. Check the
              picture first, or switch source for a better copy.
            </p>
          )}
          <p className="t-footnote mb-3 text-secondary">
            Found while {sourceName} played. Choose a quality to save it on
            this phone.
          </p>
          <ul className="grouped overflow-hidden">
            {options.map((c) => (
              <li key={c.key} className="border-t border-white/[0.06] first:border-t-0">
                <button
                  onClick={() => {
                    const result = startMovieDownload(movie, c.stream, c.height);
                    if ("error" in result) toast(result.error, { tone: "error" });
                    else toast(`Downloading ${movie.title}. Find it in Downloads.`);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 px-4 text-left transition hover:bg-white/5"
                >
                  <span className="t-callout flex-1 font-medium">{c.label}</span>
                  <span className="t-footnote text-secondary">{c.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <p className="t-callout">Start the movie first</p>
          <p className="t-footnote mt-2 text-secondary">
            Once {sourceName} starts playing, Kairo finds the movie&apos;s video
            and offers it here. Some sources hide their video; if nothing shows
            up after the movie has played for a little while, switch source
            and try again.
          </p>
        </div>
      )}
    </MediaSheet>
  );
}
