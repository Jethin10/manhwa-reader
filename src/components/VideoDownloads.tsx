"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getOfflineVideo, type SavedVideo } from "@/lib/video-downloads";
import { markWatched, savedWatch, saveWatch } from "./AnimeLibrary";
import AdaptiveVideo from "./AdaptiveVideo";

const label = (item: SavedVideo) =>
  `${item.anime.title} · Episode ${item.episode.number}`;

export function OfflineVideo({ id }: { id: string }) {
  const [result, setResult] = useState<{
    entry?: SavedVideo;
    error?: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getOfflineVideo(id)
      .then((entry) => {
        if (active) setResult({ entry });
      })
      .catch((failure) => {
        if (active)
          setResult({
            error:
              failure instanceof Error
                ? failure.message
                : "This download couldn't open.",
          });
      });
    return () => {
      active = false;
    };
  }, [id]);
  const entry = result?.entry;
  return (
    <div className="gutter mx-auto max-w-5xl py-5">
      <Link href="/downloads" prefetch={false} className="btn btn-gray mb-5">
        Back to downloads
      </Link>
      {!result ? (
        <p role="status">Opening saved episode…</p>
      ) : result.error || error ? (
        <p role="alert" className="rounded-xl bg-card p-5">
          {error || result.error}
        </p>
      ) : (
        entry && (
          <>
            <h1 className="t-title2 mb-2">{label(entry)}</h1>
            <p className="t-sub mb-5 text-secondary">
              Playing from this device ·{" "}
              {entry.audioTrack ||
                (entry.audio === "dub" ? "Dubbed" : "Subtitled")}
            </p>
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
              <AdaptiveVideo
                media={entry.media}
                title={label(entry)}
                startTime={
                  savedWatch(entry.anime.id, entry.episode.id)?.time ?? 0
                }
                onError={setError}
                onProgress={(time, duration) =>
                  saveWatch({
                    anime: { ...entry.anime, sub: 0, dub: 0, format: "Anime" },
                    episodeId: entry.episode.id,
                    episodeNumber: entry.episode.number,
                    language: entry.audio,
                    time,
                    duration,
                  })
                }
                onEnded={() => markWatched(entry.anime.id, entry.episode.id)}
              />
            </div>
          </>
        )
      )}
    </div>
  );
}
