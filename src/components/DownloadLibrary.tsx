"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  cancelDownload,
  deleteDownloads,
  formatBytes,
  pauseDownload,
  resumeDownload,
  retryDownload,
  type DownloadJob,
  type DownloadedChapter,
} from "@/lib/downloads";
import {
  cancelVideoDownload,
  deleteVideoDownload,
  pauseVideoDownload,
  resumeVideoDownload,
  type SavedVideo,
  type VideoJob,
} from "@/lib/video-downloads";
import { readKey, useReadChapters } from "@/lib/library";
import { useWatched } from "./AnimeLibrary";
import { Cover } from "./SeriesCard";
import { CheckIcon, ChevronLeft, ChevronRight, PlayIcon } from "./Icons";

const CATEGORIES = ["Manhwa", "Manga", "Anime"] as const;
type Category = (typeof CATEGORIES)[number];

type Title = {
  key: string;
  id: string;
  name: string;
  cover: string | null;
  category: Category;
  count: number;
  bytes: number;
  at: number;
  active: number;
  failed: number;
};

type QueueItem = {
  id: string;
  key: string;
  title: string;
  label: string;
  state: DownloadJob["state"];
  done: number;
  total: number;
  note: string;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
};

const chapterNumber = (c: { number: string | null }) => {
  const n = parseFloat(c.number ?? "");
  return Number.isFinite(n) ? n : -1;
};
const chapterName = (c: { number: string | null; title: string | null }) =>
  c.number ? `Chapter ${c.number}` : (c.title ?? "Oneshot");
const categoryOf = (type: string): Category =>
  type.toLowerCase() === "manga" ? "Manga" : "Manhwa";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function chapterQueueItem(j: DownloadJob): QueueItem {
  return {
    id: `c:${j.id}`,
    key: `c:${j.series.id}`,
    title: j.series.title,
    label: chapterName(j),
    state: j.state,
    done: j.done,
    total: j.total,
    note:
      j.state === "failed"
        ? (j.error ?? "Failed")
        : j.state === "paused"
          ? "Paused"
          : j.state === "queued"
            ? "Waiting"
            : j.total
              ? `${j.done} of ${j.total} pages`
              : "Starting…",
    pause: () => pauseDownload(j.id),
    resume: () =>
      j.state === "failed" ? retryDownload(j.id) : resumeDownload(j.id),
    cancel: () => cancelDownload(j.id),
  };
}

function videoQueueItem(j: VideoJob): QueueItem {
  return {
    id: `v:${j.id}`,
    key: `v:${j.anime.id}`,
    title: j.anime.title,
    label: `Episode ${j.episode.number}`,
    state: j.state,
    done: j.done,
    total: j.total,
    note:
      j.error ??
      (j.waitingForPlayback
        ? "Waits until you pause the video"
        : j.state === "paused"
          ? "Paused"
          : j.state === "queued"
            ? "Waiting"
            : j.total
              ? `${Math.round((j.done / j.total) * 100)}% · ${formatBytes(j.bytes)}`
              : "Preparing…"),
    pause: () => pauseVideoDownload(j.id),
    resume: () => resumeVideoDownload(j.id),
    cancel: () => cancelVideoDownload(j.id),
  };
}

/** Everything saved on this device, sorted into categories like a Tachiyomi library. */
export function DownloadLibrary({
  saved,
  jobs,
  videos,
  videoJobs,
  tab,
  open,
}: {
  saved: Record<string, DownloadedChapter>;
  jobs: DownloadJob[];
  videos: Record<string, SavedVideo>;
  videoJobs: VideoJob[];
  tab: string | null;
  open: string | null;
}) {
  const queue = useMemo(
    () => [...jobs.map(chapterQueueItem), ...videoJobs.map(videoQueueItem)],
    [jobs, videoJobs],
  );
  const titles = useMemo(() => {
    const by = new Map<string, Title>();
    const entry = (
      key: string,
      id: string,
      name: string,
      cover: string | null,
      category: Category,
    ) => {
      let t = by.get(key);
      if (!t) {
        t = { key, id, name, cover, category, count: 0, bytes: 0, at: 0, active: 0, failed: 0 };
        by.set(key, t);
      }
      return t;
    };
    for (const d of Object.values(saved)) {
      const t = entry(`c:${d.series.id}`, d.series.id, d.series.title, d.series.cover, categoryOf(d.series.type));
      t.count++;
      t.bytes += d.bytes;
      t.at = Math.max(t.at, d.at);
    }
    for (const v of Object.values(videos)) {
      const t = entry(`v:${v.anime.id}`, v.anime.id, v.anime.title, v.anime.cover, "Anime");
      t.count++;
      t.bytes += v.bytes;
      t.at = Math.max(t.at, v.at);
    }
    for (const j of jobs) {
      const t = entry(`c:${j.series.id}`, j.series.id, j.series.title, j.series.cover, categoryOf(j.series.type));
      if (j.state === "failed") t.failed++;
      else t.active++;
    }
    for (const j of videoJobs) {
      const t = entry(`v:${j.anime.id}`, j.anime.id, j.anime.title, j.anime.cover, "Anime");
      if (j.state === "failed") t.failed++;
      else t.active++;
    }
    return [...by.values()].sort((a, b) => b.at - a.at);
  }, [saved, videos, jobs, videoJobs]);

  const title = open ? titles.find((t) => t.key === open) : undefined;
  if (title)
    return title.key.startsWith("c:") ? (
      <ChapterDetail
        title={title}
        chapters={Object.values(saved).filter((d) => d.series.id === title.id)}
        queue={queue.filter((q) => q.key === title.key)}
      />
    ) : (
      <EpisodeDetail
        title={title}
        episodes={Object.values(videos).filter((v) => v.anime.id === title.id)}
        queue={queue.filter((q) => q.key === title.key)}
      />
    );
  return <Overview titles={titles} queue={queue} tab={tab} />;
}

function Overview({
  titles,
  queue,
  tab,
}: {
  titles: Title[];
  queue: QueueItem[];
  tab: string | null;
}) {
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const used = titles.reduce((n, t) => n + t.bytes, 0);
  useEffect(() => {
    let active = true;
    navigator.storage
      ?.estimate?.()
      .then((e) => {
        if (active) setQuota({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [used]);
  const present = CATEGORIES.filter((c) => titles.some((t) => t.category === c));
  const selected = CATEGORIES.find((c) => c.toLowerCase() === tab);
  const shown = selected ? [selected] : present;
  const libraryCount = titles.filter((t) => t.count > 0).length;

  return (
    <div className="gutter mx-auto max-w-[1100px] pt-2 pb-16 lg:pt-6">
      <Link
        href="/bookmarks"
        className="t-sub -ml-1 inline-flex min-h-11 items-center gap-1 text-accent"
      >
        <ChevronLeft className="size-4" />
        Library
      </Link>
      <h1 className="t-large mt-1">Downloads</h1>
      {(used > 0 || (quota && quota.quota > 0)) && (
        <div className="mt-3">
          <p className="t-footnote text-secondary">
            {formatBytes(used)} used
            {quota && quota.quota > 0
              ? ` · ${formatBytes(Math.max(0, quota.quota - quota.usage))} free`
              : ""}
          </p>
          {quota && quota.quota > 0 && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(1, Math.min(100, (quota.usage / quota.quota) * 100))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {queue.length > 0 && <QueueCard queue={queue} />}

      {titles.length === 0 ? (
        <div className="mt-16 text-center">
          <h2 className="t-title3">Nothing downloaded yet</h2>
          <p className="t-callout mx-auto mt-2 max-w-sm text-secondary">
            Tap the download icon on any chapter or episode and it shows up
            here, ready without a connection.
          </p>
          <div className="mt-7 flex justify-center gap-2">
            <Link href="/series" className="btn btn-primary">
              Browse manhwa
            </Link>
            <Link href="/anime" className="btn btn-gray">
              Browse anime
            </Link>
          </div>
        </div>
      ) : (
        <>
          <nav
            aria-label="Download categories"
            className="no-scrollbar mt-6 flex gap-2 overflow-x-auto"
          >
            {[null, ...present].map((c) => {
              const on = (selected ?? null) === c;
              const count = c
                ? titles.filter((t) => t.category === c).length
                : titles.length;
              return (
                <Link
                  key={c ?? "all"}
                  href={c ? `/downloads?tab=${c.toLowerCase()}` : "/downloads"}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={`t-footnote inline-flex h-9 shrink-0 items-center rounded-full px-4 font-medium transition ${on ? "bg-label text-black" : "bg-fill text-label/80 hover:bg-fill-2"}`}
                >
                  {c ?? "All"} · {count}
                </Link>
              );
            })}
          </nav>
          {shown.map((category) => {
            const list = titles.filter((t) => t.category === category);
            return (
              <section key={category} className="mt-7">
                <h2 className="t-title3 mb-3">{category}</h2>
                {list.length ? (
                  <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {list.map((t) => (
                      <Poster key={t.key} title={t} />
                    ))}
                  </div>
                ) : (
                  <p className="t-callout text-secondary">
                    No {category.toLowerCase()} downloaded.
                  </p>
                )}
              </section>
            );
          })}
          {libraryCount === 0 && (
            <p className="t-footnote mt-6 text-secondary">
              Titles appear here as soon as their first download finishes.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Poster({ title: t }: { title: Title }) {
  const unit = t.category === "Anime" ? "episode" : "chapter";
  return (
    <Link
      href={`/downloads?open=${encodeURIComponent(t.key)}`}
      prefetch={false}
      className="group pressable block min-w-0"
    >
      <div className="relative">
        <Cover cover={t.cover} alt="" sizes="160px" className="aspect-[2/3] w-full" />
        {t.count > 0 && (
          <span className="absolute top-1.5 left-1.5 min-w-6 rounded-md bg-accent px-1.5 py-0.5 text-center text-[12px] font-bold text-white tabular-nums">
            {t.count}
          </span>
        )}
        {t.active > 0 && (
          <span
            aria-label="Downloading"
            className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-black/75"
          >
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </span>
        )}
        {t.failed > 0 && t.active === 0 && (
          <span className="absolute right-1.5 bottom-1.5 rounded-md bg-[#ff453a] px-1.5 py-0.5 text-[11px] font-bold text-white">
            Failed
          </span>
        )}
      </div>
      <p className="t-footnote mt-1.5 line-clamp-2 font-medium">{t.name}</p>
      <p className="t-caption mt-0.5 text-secondary">
        {t.count > 0
          ? plural(t.count, unit)
          : "Downloading"}
      </p>
    </Link>
  );
}

function QueueCard({ queue }: { queue: QueueItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const running = queue.filter((q) => q.state === "downloading" || q.state === "queued");
  const paused = queue.filter((q) => q.state === "paused");
  const failed = queue.filter((q) => q.state === "failed");
  const current = queue.find((q) => q.state === "downloading");
  const pct = current?.total ? (current.done / current.total) * 100 : 0;
  const heading = running.length
    ? `Downloading · ${running.length} left`
    : paused.length
      ? `Paused · ${paused.length}`
      : `${failed.length} failed`;
  return (
    <section className="grouped mt-5 overflow-hidden" aria-label="Download queue">
      <div className="flex items-center gap-2 py-2 pr-2 pl-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="t-callout block font-semibold">{heading}</span>
            {current && (
              <span className="t-caption block truncate text-secondary">
                {current.title} · {current.label}
              </span>
            )}
          </span>
          <ChevronRight
            className={`size-4 shrink-0 text-tertiary transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </button>
        {running.length > 0 ? (
          <button
            onClick={() => running.forEach((q) => q.pause())}
            className="t-footnote min-h-11 px-2 font-semibold text-accent"
          >
            Pause all
          </button>
        ) : (
          <button
            onClick={() => [...paused, ...failed].forEach((q) => q.resume())}
            className="t-footnote min-h-11 px-2 font-semibold text-accent"
          >
            {paused.length ? "Resume all" : "Retry all"}
          </button>
        )}
      </div>
      {current && (
        <div className="h-0.5 bg-white/10">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {expanded && (
        <ul>
          {queue.map((q) => (
            <QueueRow key={q.id} item={q} showTitle />
          ))}
        </ul>
      )}
    </section>
  );
}

function QueueRow({ item: q, showTitle }: { item: QueueItem; showTitle?: boolean }) {
  const stopped = q.state === "paused" || q.state === "failed";
  return (
    <li className="flex items-center gap-1 border-t border-white/[0.06] py-1.5 pr-2 pl-4">
      <div className="min-w-0 flex-1">
        <p className="t-callout truncate">
          {showTitle ? `${q.title} · ${q.label}` : q.label}
        </p>
        <p className={`t-caption truncate ${q.state === "failed" ? "text-[#ff453a]" : "text-secondary"}`}>
          {q.note}
        </p>
      </div>
      <button
        onClick={stopped ? q.resume : q.pause}
        className="t-footnote min-h-11 px-2 font-semibold text-accent"
      >
        {q.state === "failed" ? "Retry" : stopped ? "Resume" : "Pause"}
      </button>
      <button
        onClick={q.cancel}
        className="t-footnote min-h-11 px-2 font-semibold text-secondary"
      >
        {q.state === "failed" ? "Remove" : "Cancel"}
      </button>
    </li>
  );
}

/** Deleting asks once more on the same button, so a stray tap can't lose a download. */
function DeleteButton({
  label,
  onDelete,
  children,
  className,
}: {
  label: string;
  onDelete: () => void;
  children?: (armed: boolean) => React.ReactNode;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      aria-label={armed ? `Confirm: ${label}` : label}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onDelete();
        } else setArmed(true);
      }}
      className={
        className ??
        `grid size-11 shrink-0 place-items-center rounded-full transition ${armed ? "bg-[#ff453a]/15 text-[#ff453a]" : "text-tertiary hover:text-label"}`
      }
    >
      {children ? (
        children(armed)
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function DetailShell({
  title,
  queue,
  primary,
  sourceHref,
  actions,
  children,
}: {
  title: Title;
  queue: QueueItem[];
  primary: { href: string; label: string } | null;
  sourceHref: string;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  const unit = title.category === "Anime" ? "episode" : "chapter";
  return (
    <div className="gutter mx-auto max-w-[760px] pt-2 pb-16 lg:pt-6">
      <Link
        href={`/downloads?tab=${title.category.toLowerCase()}`}
        className="t-sub -ml-1 inline-flex min-h-11 items-center gap-1 text-accent"
      >
        <ChevronLeft className="size-4" />
        {title.category}
      </Link>
      <header className="mt-2 flex gap-4">
        <Cover cover={title.cover} alt="" sizes="112px" className="aspect-[2/3] w-28 shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col justify-end">
          <h1 className="t-title2 line-clamp-3">{title.name}</h1>
          <p className="t-footnote mt-1 text-secondary">
            {plural(title.count, unit)} · {formatBytes(title.bytes)}
          </p>
          <Link
            href={sourceHref}
            prefetch={false}
            className="t-footnote mt-1 font-medium text-accent"
          >
            Open title page
          </Link>
        </div>
      </header>
      {primary && (
        <Link href={primary.href} prefetch={false} className="btn btn-primary mt-5 w-full gap-2">
          <PlayIcon className="size-4" />
          {primary.label}
        </Link>
      )}
      {queue.length > 0 && (
        <section className="grouped mt-5 overflow-hidden" aria-label="Downloading">
          <ul>
            {queue.map((q) => (
              <QueueRow key={q.id} item={q} />
            ))}
          </ul>
        </section>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <h2 className="t-headline">Downloaded</h2>
        <div className="flex items-center gap-3">{actions}</div>
      </div>
      {children}
    </div>
  );
}

const textDelete = "t-footnote min-h-11 font-semibold text-[#ff453a]";

function ChapterDetail({
  title,
  chapters,
  queue,
}: {
  title: Title;
  chapters: DownloadedChapter[];
  queue: QueueItem[];
}) {
  const read = useReadChapters(title.id);
  const [oldestFirst, setOldestFirst] = useState(false);
  const ascending = useMemo(
    () => [...chapters].sort((a, b) => chapterNumber(a) - chapterNumber(b)),
    [chapters],
  );
  const shown = oldestFirst ? ascending : [...ascending].reverse();
  const isRead = (c: DownloadedChapter) => read.has(readKey(c));
  const next = ascending.find((c) => !isRead(c));
  const start = next ?? ascending[0];
  const finished = chapters.filter(isRead);
  return (
    <DetailShell
      title={title}
      queue={queue}
      sourceHref={`/series/${title.id}`}
      primary={
        start
          ? {
              href: `/downloads?read=${encodeURIComponent(start.id)}`,
              label: `${next ? "Continue" : "Read again"} · ${chapterName(start)}`,
            }
          : null
      }
      actions={
        <>
          <button
            onClick={() => setOldestFirst((v) => !v)}
            className="t-footnote min-h-11 font-semibold text-accent"
          >
            {oldestFirst ? "Oldest first" : "Newest first"}
          </button>
          {finished.length > 0 && (
            <DeleteButton
              label={`Delete ${finished.length} read`}
              className={textDelete}
              onDelete={() => void deleteDownloads(finished.map((c) => c.id))}
            >
              {(armed) => (armed ? "Tap to confirm" : `Delete read (${finished.length})`)}
            </DeleteButton>
          )}
          <DeleteButton
            label="Delete all downloads of this title"
            className={textDelete}
            onDelete={() => void deleteDownloads(chapters.map((c) => c.id))}
          >
            {(armed) => (armed ? "Tap to confirm" : "Delete all")}
          </DeleteButton>
        </>
      }
    >
      <ul className="grouped mt-2 overflow-hidden">
        {shown.map((c) => (
          <li key={c.id} className="row-divider flex items-center pr-1">
            <Link
              href={`/downloads?read=${encodeURIComponent(c.id)}`}
              prefetch={false}
              className={`min-w-0 flex-1 py-3 pl-4 ${isRead(c) ? "opacity-45" : ""}`}
            >
              <span className="t-callout flex items-center gap-1.5">
                {chapterName(c)}
                {isRead(c) && <CheckIcon className="size-3.5 text-success" />}
              </span>
              <span className="t-caption text-secondary">
                {c.pages.length} pages · {formatBytes(c.bytes)}
              </span>
            </Link>
            <DeleteButton
              label={`Delete ${chapterName(c)}`}
              onDelete={() => void deleteDownloads([c.id])}
            />
          </li>
        ))}
      </ul>
    </DetailShell>
  );
}

function EpisodeDetail({
  title,
  episodes,
  queue,
}: {
  title: Title;
  episodes: SavedVideo[];
  queue: QueueItem[];
}) {
  const watched = useWatched(title.id);
  const ascending = useMemo(
    () => [...episodes].sort((a, b) => a.episode.number - b.episode.number),
    [episodes],
  );
  const isWatched = (v: SavedVideo) => watched.includes(v.episode.id);
  const next = ascending.find((v) => !isWatched(v));
  const start = next ?? ascending[0];
  const seen = episodes.filter(isWatched);
  return (
    <DetailShell
      title={title}
      queue={queue}
      sourceHref={`/anime/${title.id}`}
      primary={
        start
          ? {
              href: `/downloads?video=${encodeURIComponent(start.id)}`,
              label: `${next ? "Play" : "Watch again"} · Episode ${start.episode.number}`,
            }
          : null
      }
      actions={
        <>
          {seen.length > 0 && (
            <DeleteButton
              label={`Delete ${seen.length} watched`}
              className={textDelete}
              onDelete={() => seen.forEach((v) => void deleteVideoDownload(v.id))}
            >
              {(armed) => (armed ? "Tap to confirm" : `Delete watched (${seen.length})`)}
            </DeleteButton>
          )}
          <DeleteButton
            label="Delete all downloads of this title"
            className={textDelete}
            onDelete={() => episodes.forEach((v) => void deleteVideoDownload(v.id))}
          >
            {(armed) => (armed ? "Tap to confirm" : "Delete all")}
          </DeleteButton>
        </>
      }
    >
      <ul className="grouped mt-2 overflow-hidden">
        {ascending.map((v) => (
          <li key={v.id} className="row-divider flex items-center pr-1">
            <Link
              href={`/downloads?video=${encodeURIComponent(v.id)}`}
              prefetch={false}
              className={`flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 ${isWatched(v) ? "opacity-45" : ""}`}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-fill text-xs font-semibold tabular-nums">
                {v.episode.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-callout block truncate">
                  {v.episode.title || `Episode ${v.episode.number}`}
                </span>
                <span className="t-caption text-secondary">
                  {v.audioTrack || (v.audio === "dub" ? "Dub" : "Sub")}
                  {v.actualHeight > 0 ? ` · ${v.actualHeight}p` : ""} ·{" "}
                  {formatBytes(v.bytes)}
                </span>
              </span>
            </Link>
            <DeleteButton
              label={`Delete episode ${v.episode.number}`}
              onDelete={() => void deleteVideoDownload(v.id)}
            />
          </li>
        ))}
      </ul>
    </DetailShell>
  );
}
