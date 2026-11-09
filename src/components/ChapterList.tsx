"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Chapter } from "@/lib/catalog";
import {
  readKey,
  setChaptersRead,
  useHistory,
  useReadChapters,
  type SavedSeries,
} from "@/lib/library";
import {
  cancelDownload,
  deleteDownloads,
  queueDownloads,
  retryDownload,
  resumeDownload,
  useDownloads,
  type DownloadJob,
} from "@/lib/downloads";
import { toast } from "@/lib/toast";
import { ExternalIcon, SearchIcon } from "./Icons";
import { TimeAgo } from "./TimeAgo";
import { MediaSheet } from "./MediaSheet";

const PAGE = 150;
type Filter = "all" | "unread" | "downloaded";

/**
 * The series chapter list, modeled on Mihon's: read chapters dim, the one in progress shows
 * how far you got, every chapter downloads for offline reading, and a long press (or Select)
 * picks several to mark read, unread, download or delete at once.
 */
export function ChapterList({
  series,
  chapters,
  showSource,
  pending,
}: {
  series: SavedSeries;
  chapters: Chapter[];
  /** Label each row with its source when the list merges several. */
  showSource?: boolean;
  /** Other sources are still being checked. */
  pending?: boolean;
}) {
  const [q, setQ] = useState("");
  const [asc, setAsc] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [menu, setMenu] = useState(false);
  const history = useHistory().find((h) => h.id === series.id);
  const read = useReadChapters(series.id);
  const { saved, jobs } = useDownloads();
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const readable = useMemo(
    () => chapters.filter((c) => !c.externalUrl),
    [chapters],
  );
  const isRead = (c: Chapter) => read.has(readKey(c));

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = term
      ? chapters.filter(
          (c) =>
            (c.number ?? "") === term ||
            (c.number ?? "").startsWith(term) ||
            (c.title ?? "").toLowerCase().includes(term),
        )
      : chapters;
    if (filter === "unread") list = list.filter((c) => !read.has(readKey(c)));
    if (filter === "downloaded")
      list = list.filter((c) => saved[c.id] || jobById.has(c.id));
    return asc ? [...list].reverse() : list;
  }, [chapters, q, asc, filter, read, saved, jobById]);
  const shown = filtered.slice(0, limit);
  const seriesJobs = jobs.filter((j) => j.series.id === series.id);
  const downloadedCount = readable.filter((c) => saved[c.id]).length;

  // Unread, oldest first: what "download next" should fetch.
  const unreadAhead = useMemo(
    () =>
      [...readable]
        .reverse()
        .filter(
          (c) => !read.has(readKey(c)) && !saved[c.id] && !jobById.has(c.id),
        ),
    [readable, read, saved, jobById],
  );
  const download = (list: Chapter[]) => {
    const count = queueDownloads(
      series,
      list.map((c) => ({ id: c.id, number: c.number, title: c.title })),
    );
    if (count)
      toast(
        `${count} ${count === 1 ? "chapter" : "chapters"} added to downloads`,
        { action: { label: "View", href: "/downloads" } },
      );
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size ? next : null;
    });
  const picked = readable.filter((c) => selected?.has(c.id));
  const done = () => setSelected(null);
  const mark = (keys: string[], isRead: boolean) => {
    const changed = setChaptersRead(series.id, keys, isRead);
    const n = changed.length;
    toast(
      n
        ? `Marked ${n} ${n === 1 ? "chapter" : "chapters"} ${isRead ? "read" : "unread"}`
        : `Already ${isRead ? "read" : "unread"}`,
      n
        ? {
            action: {
              label: "Undo",
              run: () => setChaptersRead(series.id, changed, !isRead),
            },
          }
        : {},
    );
  };

  return (
    <section aria-busy={pending}>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="t-title2 flex items-baseline gap-2">
          Chapters
          <span className="t-sub font-normal text-tertiary tabular-nums">
            {chapters.length}
          </span>
        </h2>
        {pending && (
          <span className="t-caption flex items-center gap-1.5 text-secondary">
            <span className="size-3 animate-spin rounded-full border-[1.5px] border-tertiary border-t-transparent" />
            Checking other sources
          </span>
        )}
        <div className="relative ml-auto flex items-center gap-1">
          {readable.length > 0 && (
            <>
              <button
                onClick={() => setMenu((m) => !m)}
                aria-expanded={menu}
                aria-label="Download chapters"
                className="flex min-h-11 items-center gap-2 rounded-full bg-fill px-3 text-sm font-medium text-accent transition hover:bg-fill-2"
              >
                <DownloadGlyph className="size-[19px]" />
                Download
              </button>
              <button
                onClick={() =>
                  setSelected((s) => (s ? null : new Set<string>()))
                }
                className="t-footnote min-h-11 rounded-full px-3 font-semibold text-accent transition hover:bg-fill"
              >
                {selected ? "Cancel" : "Select"}
              </button>
            </>
          )}
          {menu && (
            <DownloadMenu
              onClose={() => setMenu(false)}
              options={[
                ["Next 5 unread", unreadAhead.slice(0, 5)],
                ["Next 10 unread", unreadAhead.slice(0, 10)],
                [`All unread (${unreadAhead.length})`, unreadAhead],
                [
                  "All remaining chapters",
                  [...readable]
                    .reverse()
                    .filter(
                      (chapter) =>
                        !saved[chapter.id] && !jobById.has(chapter.id),
                    ),
                ],
              ]}
              onPick={(list) => {
                download(list);
                setMenu(false);
              }}
            />
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-[10px] bg-fill px-3">
          <SearchIcon className="size-[14px] text-secondary" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            inputMode="decimal"
            enterKeyHint="search"
            placeholder="Find a chapter"
            aria-label="Find chapter"
            className="t-footnote w-full bg-transparent outline-none placeholder:text-secondary"
          />
        </label>
        <button
          onClick={() => setAsc((v) => !v)}
          aria-label={asc ? "Oldest first" : "Newest first"}
          className="t-footnote flex h-9 items-center gap-1.5 rounded-[10px] bg-fill px-3 font-medium text-label/90 transition hover:bg-fill-2"
        >
          <SortGlyph asc={asc} />
          {asc ? "Oldest" : "Newest"}
        </button>
      </div>
      <div
        role="radiogroup"
        aria-label="Show"
        className="no-scrollbar mb-3 flex gap-2 overflow-x-auto"
      >
        {(
          [
            ["all", "All"],
            [
              "unread",
              `Unread${chapters.length ? ` · ${unreadCount(readable, read)}` : ""}`,
            ],
            [
              "downloaded",
              `Downloaded${downloadedCount ? ` · ${downloadedCount}` : ""}`,
            ],
          ] as const
        ).map(([v, text]) => (
          <button
            key={v}
            role="radio"
            aria-checked={filter === v}
            onClick={() => {
              setFilter(v);
              setLimit(PAGE);
            }}
            className={`t-footnote h-8 shrink-0 rounded-full px-3.5 font-medium transition ${
              filter === v
                ? "bg-label text-black"
                : "bg-fill text-label/80 hover:bg-fill-2"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {seriesJobs.length > 0 && (
        <QueueBanner
          jobs={seriesJobs}
          onCancel={() => seriesJobs.forEach((j) => cancelDownload(j.id))}
        />
      )}

      {chapters.length === 0 ? (
        <p className="grouped t-callout p-10 text-center text-secondary">
          {pending
            ? "Looking for chapters on other sources…"
            : "No English chapters are available on any source yet."}
        </p>
      ) : filtered.length === 0 ? (
        <p className="grouped t-callout p-8 text-center text-secondary">
          {filter === "unread"
            ? "You're all caught up."
            : filter === "downloaded"
              ? "Nothing downloaded yet. Tap the download icon on a chapter to keep it for offline reading."
              : "No chapters match."}
        </p>
      ) : (
        <ul className="grouped">
          {shown.map((c) => (
            <Row
              key={c.id}
              chapter={c}
              seriesId={series.id}
              read={isRead(c)}
              last={history?.chapterId === c.id}
              progress={
                history?.chapterId === c.id && !isRead(c)
                  ? (history.progress ?? 0)
                  : 0
              }
              showSource={showSource}
              downloaded={!!saved[c.id]}
              job={jobById.get(c.id)}
              selecting={!!selected}
              selected={!!selected?.has(c.id)}
              onToggle={() => toggle(c.id)}
              onDownload={() => download([c])}
            />
          ))}
        </ul>
      )}
      {filtered.length > limit && (
        <button
          onClick={() => setLimit((l) => l + PAGE * 2)}
          className="grouped t-callout mt-3 w-full py-3 font-medium text-accent transition hover:bg-card-2"
        >
          Show {Math.min(PAGE * 2, filtered.length - limit)} more
        </button>
      )}

      {selected && (
        <SelectionBar
          count={picked.length}
          onAll={() =>
            setSelected(
              new Set(filtered.filter((c) => !c.externalUrl).map((c) => c.id)),
            )
          }
          onRead={() => {
            mark(picked.map(readKey), true);
            done();
          }}
          onUnread={() => {
            mark(picked.map(readKey), false);
            done();
          }}
          onPrevious={
            picked.length === 1
              ? () => {
                  const n = parseFloat(picked[0].number ?? "");
                  const older = Number.isFinite(n)
                    ? readable.filter((c) => parseFloat(c.number ?? "") <= n)
                    : picked;
                  mark(older.map(readKey), true);
                  done();
                }
              : undefined
          }
          onDownload={() => {
            download(picked.filter((c) => !saved[c.id]).reverse());
            done();
          }}
          onDelete={
            picked.some((c) => saved[c.id])
              ? () => {
                  const ids = picked
                    .filter((c) => saved[c.id])
                    .map((c) => c.id);
                  void deleteDownloads(ids);
                  toast(
                    ids.length === 1
                      ? "Download deleted"
                      : `${ids.length} downloads deleted`,
                  );
                  done();
                }
              : undefined
          }
          onCancel={done}
        />
      )}
    </section>
  );
}

function unreadCount(list: Chapter[], read: ReadonlySet<string>) {
  return list.filter((c) => !read.has(readKey(c))).length;
}

function Row({
  chapter: c,
  seriesId,
  read,
  last,
  progress,
  showSource,
  downloaded,
  job,
  selecting,
  selected,
  onToggle,
  onDownload,
}: {
  chapter: Chapter;
  seriesId: string;
  read: boolean;
  last: boolean;
  progress: number;
  showSource?: boolean;
  downloaded: boolean;
  job?: DownloadJob;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
  onDownload: () => void;
}) {
  const press = useRef<{
    timer?: ReturnType<typeof setTimeout>;
    fired: boolean;
    x: number;
    y: number;
  }>({
    fired: false,
    x: 0,
    y: 0,
  });
  const detail = [c.number && c.title ? c.title : null, c.group]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      {selecting && (
        <span
          aria-hidden
          className={`grid size-[22px] shrink-0 place-items-center rounded-full border-2 transition ${
            selected ? "border-accent bg-accent" : "border-white/30"
          }`}
        >
          {selected && (
            <svg
              viewBox="0 0 24 24"
              className="size-3.5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={3.5}
            >
              <path
                d="m5 12.5 4.5 4.5L19 7.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      )}
      <div className={`min-w-0 flex-1 ${read ? "opacity-45" : ""}`}>
        <p className="t-callout flex items-center gap-2">
          {last && !read && (
            <span
              className="size-2 shrink-0 rounded-full bg-accent"
              aria-label="Last read"
            />
          )}
          <span className={last && !read ? "font-semibold" : ""}>
            {c.number ? `Chapter ${c.number}` : (c.title ?? "Oneshot")}
          </span>
          {progress > 0 && progress < 1 && (
            <span className="t-caption rounded-full bg-accent/15 px-1.5 py-px font-semibold text-accent tabular-nums">
              {Math.round(progress * 100)}%
            </span>
          )}
        </p>
        <p className="t-caption mt-0.5 flex items-center gap-1.5 truncate text-secondary">
          {showSource && c.source && (
            <span className="shrink-0 rounded-[5px] bg-fill px-1.5 py-px text-[11px] font-medium text-label/80">
              {c.source}
            </span>
          )}
          {detail && detail !== c.source && (
            <span className="truncate">{detail}</span>
          )}
          <TimeAgo iso={c.readableAt} className="shrink-0 text-tertiary" />
        </p>
      </div>
    </>
  );
  const cls =
    "flex min-h-[58px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.08]";
  const longPress = {
    onPointerDown: (e: React.PointerEvent) => {
      const p = press.current;
      p.fired = false;
      p.x = e.clientX;
      p.y = e.clientY;
      clearTimeout(p.timer);
      if (e.pointerType === "mouse") return;
      p.timer = setTimeout(() => {
        p.fired = true;
        navigator.vibrate?.(10);
        onToggle();
      }, 450);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8)
        clearTimeout(p.timer);
    },
    onPointerUp: () => clearTimeout(press.current.timer),
    onPointerCancel: () => clearTimeout(press.current.timer),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!press.current.fired) onToggle();
    },
    onClickCapture: (e: React.MouseEvent) => {
      // The long press already selected; don't open the chapter too.
      if (press.current.fired) {
        e.preventDefault();
        e.stopPropagation();
        press.current.fired = false;
      }
    },
  };

  return (
    <li
      className={`row-divider flex items-center pr-1 ${selected ? "bg-accent/10" : ""}`}
    >
      {c.externalUrl ? (
        <a
          href={c.externalUrl}
          target="_blank"
          rel="noreferrer"
          className={`${cls} pr-3`}
          title="Hosted on the official site"
        >
          {body}
          <ExternalIcon className="size-4 text-tertiary" />
        </a>
      ) : selecting ? (
        <button onClick={onToggle} aria-pressed={selected} className={cls}>
          {body}
        </button>
      ) : (
        <Link
          href={`/series/${seriesId}/chapter/${c.id}`}
          prefetch={false}
          className={cls}
          {...longPress}
        >
          {body}
        </Link>
      )}
      {!c.externalUrl && (
        <DownloadButton
          downloaded={downloaded}
          job={job}
          onDownload={onDownload}
          onDelete={() => void deleteDownloads([c.id])}
          label={c.number ? `chapter ${c.number}` : "chapter"}
        />
      )}
    </li>
  );
}

/** Download state for one chapter. A downloaded chapter deletes on a second, confirming tap. */
export function DownloadButton({
  downloaded,
  job,
  onDownload,
  onDelete,
  label,
}: {
  downloaded: boolean;
  job?: DownloadJob;
  onDownload: () => void;
  onDelete: () => void;
  label: string;
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 2500);
    return () => clearTimeout(t);
  }, [confirm]);
  const base =
    "grid size-11 shrink-0 place-items-center rounded-full transition active:scale-90";
  if (job) {
    if (job.state === "paused")
      return (
        <button
          onClick={() => resumeDownload(job.id)}
          aria-label={`Resume download of ${label}`}
          className={`${base} text-accent`}
        >
          <PlaySmall />
        </button>
      );
    const pct = job.total ? job.done / job.total : 0;
    if (job.state === "failed")
      return (
        <button
          onClick={() => retryDownload(job.id)}
          aria-label={`Retry download of ${label}: ${job.error ?? "failed"}`}
          title={job.error}
          className={`${base} text-[#ff453a]`}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      );
    return (
      <button
        onClick={() => cancelDownload(job.id)}
        aria-label={`Cancel download of ${label}`}
        className={`${base} text-accent`}
      >
        <svg viewBox="0 0 24 24" className="size-6 -rotate-90">
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={2.5}
          />
          {job.state === "downloading" && job.total > 0 ? (
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={`${pct * 56.5} 56.5`}
              className="transition-[stroke-dasharray] duration-300"
            />
          ) : (
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeDasharray="14 56.5"
              className="origin-center animate-spin"
            />
          )}
          <rect
            x="9.5"
            y="9.5"
            width="5"
            height="5"
            rx="1"
            fill="currentColor"
            className="rotate-90 origin-center"
          />
        </svg>
      </button>
    );
  }
  if (downloaded)
    return (
      <button
        onClick={() => (confirm ? onDelete() : setConfirm(true))}
        aria-label={
          confirm
            ? `Delete download of ${label}`
            : `Downloaded ${label}. Tap again to delete`
        }
        className={`${base} ${confirm ? "bg-[#ff453a]/15 text-[#ff453a]" : "text-success"}`}
      >
        {confirm ? (
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-[22px]" fill="currentColor">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.7 7.7-5.5 5.5a1 1 0 0 1-1.4 0l-2.5-2.5a1 1 0 1 1 1.4-1.4l1.8 1.8 4.8-4.8a1 1 0 1 1 1.4 1.4Z" />
          </svg>
        )}
      </button>
    );
  return (
    <button
      onClick={onDownload}
      aria-label={`Download ${label}`}
      className={`${base} text-tertiary hover:text-label`}
    >
      <DownloadGlyph className="size-5" />
    </button>
  );
}

export function DownloadGlyph({
  className = "size-5",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SortGlyph({ asc }: { asc: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
    >
      <path
        d={
          asc
            ? "M8 19V5m0 0L4 9m4-4 4 4M16 5v14m0 0-4-4m4 4 4-4"
            : "M8 5v14m0 0-4-4m4 4 4-4M16 19V5m0 0-4 4m4-4 4 4"
        }
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadMenu({
  options,
  onPick,
  onClose,
}: {
  options: [string, Chapter[]][];
  onPick: (list: Chapter[]) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState(0);
  const list = options[choice]?.[1] ?? [];
  return (
    <MediaSheet title="Download chapters" onClose={onClose}>
      <p className="t-sub text-secondary">
        Choose how much to save. Chapters already downloaded or queued are
        skipped.
      </p>
      <fieldset className="grouped">
        <legend className="sr-only">Chapters to save</legend>
        {options.map(([text, chapters], index) => (
          <label
            key={text}
            className="row-divider flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3"
          >
            <input
              type="radio"
              name="chapter-download-scope"
              checked={choice === index}
              disabled={!chapters.length}
              onChange={() => setChoice(index)}
              className="size-5 accent-[var(--color-accent)]"
            />
            <span className="flex-1 text-sm">
              {text.replace(/ \(\d+\)$/, "")}
            </span>
            <span className="text-sm text-secondary">{chapters.length}</span>
          </label>
        ))}
      </fieldset>
      <p className="t-footnote text-secondary">
        Keep the app running. You can pause and resume the queue in Downloads;
        completed pages are kept.
      </p>
      <button
        className="btn btn-primary w-full"
        disabled={!list.length}
        onClick={() => onPick(list)}
      >
        Download {list.length} {list.length === 1 ? "chapter" : "chapters"}
      </button>
      <Link href="/downloads" className="btn btn-gray w-full">
        Manage downloads
      </Link>
    </MediaSheet>
  );
}

function PlaySmall() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M8 4v16l12-8z" />
    </svg>
  );
}

function QueueBanner({
  jobs,
  onCancel,
}: {
  jobs: DownloadJob[];
  onCancel: () => void;
}) {
  const active = jobs.find((j) => j.state === "downloading");
  const failed = jobs.filter((j) => j.state === "failed").length;
  const pct = active?.total
    ? Math.round((active.done / active.total) * 100)
    : 0;
  return (
    <div className="grouped mb-3 flex items-center gap-3 px-4 py-3">
      <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />
      <div className="min-w-0 flex-1">
        <p className="t-footnote font-medium">
          Downloading {jobs.length} {jobs.length === 1 ? "chapter" : "chapters"}
          {failed ? ` · ${failed} failed` : ""}
        </p>
        {active && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      <Link href="/downloads" className="t-footnote font-semibold text-accent">
        View
      </Link>
      <button
        onClick={onCancel}
        className="t-footnote font-semibold text-secondary"
      >
        Cancel
      </button>
    </div>
  );
}

function SelectionBar({
  count,
  onAll,
  onRead,
  onUnread,
  onPrevious,
  onDownload,
  onDelete,
  onCancel,
}: {
  count: number;
  onAll: () => void;
  onRead: () => void;
  onUnread: () => void;
  onPrevious?: () => void;
  onDownload: () => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const action =
    "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition hover:bg-white/[0.08] disabled:opacity-30";
  const off = count === 0;
  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+10px)] z-40 px-3 lg:bottom-6">
      <div className="sheet-in glass mx-auto max-w-xl rounded-[22px] p-2 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
          <p className="t-footnote font-semibold">
            {count ? `${count} selected` : "Tap chapters to select"}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onAll}
              className="t-footnote font-semibold text-accent"
            >
              Select all
            </button>
            <button
              onClick={onCancel}
              className="t-footnote font-semibold text-secondary"
            >
              Done
            </button>
          </div>
        </div>
        <div className="flex">
          <button disabled={off} onClick={onRead} className={action}>
            <Glyph d="m5 12.5 4.5 4.5L19 7.5" />
            Mark read
          </button>
          <button disabled={off} onClick={onUnread} className={action}>
            <Glyph d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12Zm9 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
            Mark unread
          </button>
          {onPrevious && (
            <button onClick={onPrevious} className={action}>
              <Glyph d="m5 9 4.5 4.5L19 4M5 16l4.5 4.5L19 11" />
              Read up to here
            </button>
          )}
          <button disabled={off} onClick={onDownload} className={action}>
            <Glyph d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
            Download
          </button>
          {onDelete && (
            <button onClick={onDelete} className={`${action} text-[#ff453a]`}>
              <Glyph d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
