"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  cancelDownload,
  deleteDownloads,
  formatBytes,
  retryDownload,
  useDownloads,
  type DownloadedChapter,
} from "@/lib/downloads";
import type { Chapter } from "@/lib/catalog";
import { Reader, type ChapterNav } from "./Reader";
import { Cover } from "./SeriesCard";
import { ChevronRight } from "./Icons";

const num = (c: { number: string | null }) => {
  const n = parseFloat(c.number ?? "");
  return Number.isFinite(n) ? n : -1;
};
const name = (c: { number: string | null; title: string | null }) =>
  c.number ? `Chapter ${c.number}` : (c.title ?? "Oneshot");

/** Downloaded chapters, the download queue, and the offline reader (?read=<chapter id>). */
export function Downloads() {
  const read = useSearchParams().get("read");
  const { saved, jobs } = useDownloads();
  if (read) {
    const copy = saved[read];
    return copy ? (
      <OfflineReader copy={copy} saved={saved} />
    ) : (
      <div className="gutter mx-auto max-w-md py-28 text-center">
        <h1 className="t-title2">This chapter isn&apos;t downloaded</h1>
        <p className="t-callout mt-2 text-secondary">
          It may have been deleted. Your other downloads are still here.
        </p>
        <Link href="/downloads" className="btn btn-primary mt-8">
          Show downloads
        </Link>
      </div>
    );
  }
  return <DownloadList saved={saved} jobs={jobs} />;
}

function OfflineReader({
  copy,
  saved,
}: {
  copy: DownloadedChapter;
  saved: Record<string, DownloadedChapter>;
}) {
  // Navigation stays among this series' downloaded chapters, so it works offline.
  const nav = useMemo(() => {
    const list = Object.values(saved)
      .filter((d) => d.series.id === copy.series.id)
      .sort((a, b) => num(b) - num(a))
      .map((d) => ({ id: d.id, number: d.number, title: d.title }));
    const at = list.findIndex((c) => c.id === copy.id);
    return Promise.resolve<ChapterNav>({
      chapters: list,
      versions: [],
      next: at > 0 ? list[at - 1] : null,
      prev: at >= 0 && at < list.length - 1 ? list[at + 1] : null,
    });
    // The list only matters per chapter; a download finishing elsewhere shouldn't reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy.id]);
  const chapter: Chapter = {
    id: copy.id,
    number: copy.number,
    title: copy.title,
    volume: null,
    pages: copy.pages.length,
    externalUrl: null,
    readableAt: "",
    group: null,
  };
  const links = useMemo(
    () => ({
      chapter: (id: string) => `/downloads?read=${encodeURIComponent(id)}`,
      back: "/downloads",
    }),
    [],
  );
  return (
    <Reader
      key={copy.id}
      series={copy.series}
      chapter={chapter}
      pages={copy.pages.map((u) => ({ src: u, hd: u }))}
      nav={nav}
      links={links}
    />
  );
}

function DownloadList({
  saved,
  jobs,
}: {
  saved: Record<string, DownloadedChapter>;
  jobs: ReturnType<typeof useDownloads>["jobs"];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(
    null,
  );
  const all = Object.values(saved);
  const total = all.reduce((n, d) => n + d.bytes, 0);
  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => setQuota({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => {});
  }, [all.length]);
  const groups = useMemo(() => {
    const by = new Map<string, DownloadedChapter[]>();
    for (const d of Object.values(saved)) {
      const list = by.get(d.series.id) ?? [];
      list.push(d);
      by.set(d.series.id, list);
    }
    return [...by.values()]
      .map((list) => list.sort((a, b) => num(b) - num(a)))
      .sort(
        (a, b) =>
          Math.max(...b.map((d) => d.at)) - Math.max(...a.map((d) => d.at)),
      );
  }, [saved]);

  return (
    <div className="gutter mx-auto max-w-[860px] pt-4 pb-16 lg:pt-12">
      <h1 className="t-large">Downloads</h1>
      <p className="t-sub mt-1 text-secondary">
        {all.length
          ? `${all.length} ${all.length === 1 ? "chapter" : "chapters"} · ${formatBytes(total)} on this device`
          : "Chapters saved here read without a connection."}
        {quota && quota.quota > 0 && (
          <> · {formatBytes(Math.max(0, quota.quota - quota.usage))} free</>
        )}
      </p>

      {jobs.length > 0 && (
        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between px-4">
            <h2 className="t-footnote font-semibold tracking-[0.02em] text-secondary uppercase">
              Queue · {jobs.length}
            </h2>
            <button
              onClick={() => jobs.forEach((j) => cancelDownload(j.id))}
              className="t-footnote font-semibold text-accent"
            >
              Cancel all
            </button>
          </div>
          <ul className="grouped">
            {jobs.map((j) => {
              const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
              return (
                <li key={j.id} className="row-divider flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="t-callout truncate">
                      {j.series.title}{" "}
                      <span className="text-secondary">· {name(j)}</span>
                    </p>
                    <p className="t-caption mt-0.5 text-secondary">
                      {j.state === "failed"
                        ? (j.error ?? "Failed")
                        : j.state === "queued"
                          ? "Waiting"
                          : j.total
                            ? `${j.done} of ${j.total} pages`
                            : "Starting…"}
                    </p>
                    {j.state === "downloading" && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {j.state === "failed" && (
                    <button
                      onClick={() => retryDownload(j.id)}
                      className="t-footnote font-semibold text-accent"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() => cancelDownload(j.id)}
                    className="t-footnote font-semibold text-secondary"
                  >
                    {j.state === "failed" ? "Remove" : "Cancel"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {groups.length === 0 && jobs.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-fill text-secondary">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="t-title3 mt-5">No downloads yet</h2>
          <p className="t-callout mx-auto mt-2 max-w-sm text-secondary">
            On a series page, tap the download icon next to a chapter, or the
            one above the list to save the next few unread chapters.
          </p>
          <Link href="/bookmarks" className="btn btn-gray mt-7">
            Open Library
          </Link>
        </div>
      ) : (
        <section className="mt-8 space-y-3">
          {groups.map((list) => {
            const s = list[0].series;
            const size = list.reduce((n, d) => n + d.bytes, 0);
            const expanded = open === s.id;
            return (
              <div key={s.id} className="grouped">
                <div className="flex items-center gap-3 p-3">
                  <button
                    onClick={() => setOpen(expanded ? null : s.id)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Cover
                      cover={s.cover}
                      alt=""
                      sizes="56px"
                      className="aspect-[2/3] w-14 shrink-0 rounded-lg"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="t-headline line-clamp-2">{s.title}</span>
                      <span className="t-footnote mt-0.5 block text-secondary">
                        {list.length} {list.length === 1 ? "chapter" : "chapters"} · {formatBytes(size)}
                      </span>
                    </span>
                    <ChevronRight
                      className={`size-4 text-tertiary transition-transform ${expanded ? "rotate-90" : ""}`}
                    />
                  </button>
                </div>
                {expanded && (
                  <>
                    <ul>
                      {list.map((d) => (
                        <li
                          key={d.id}
                          className="flex items-center gap-2 border-t border-white/[0.06] pl-4"
                        >
                          <Link
                            href={`/downloads?read=${encodeURIComponent(d.id)}`}
                            className="min-w-0 flex-1 py-3"
                          >
                            <span className="t-callout block">{name(d)}</span>
                            <span className="t-caption text-secondary">
                              {d.pages.length} pages · {formatBytes(d.bytes)}
                            </span>
                          </Link>
                          <button
                            onClick={() => void deleteDownloads([d.id])}
                            aria-label={`Delete ${name(d)}`}
                            className="grid size-11 place-items-center text-secondary transition hover:text-[#ff453a]"
                          >
                            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex gap-2 border-t border-white/[0.06] p-3">
                      <Link
                        href={`/downloads?read=${encodeURIComponent(list[list.length - 1].id)}`}
                        className="btn btn-primary h-10 flex-1 text-[14px]"
                      >
                        Read offline
                      </Link>
                      <Link
                        href={`/series/${s.id}`}
                        className="btn btn-gray h-10 text-[14px]"
                      >
                        Series
                      </Link>
                      <button
                        onClick={() => void deleteDownloads(list.map((d) => d.id))}
                        className="btn h-10 bg-[#ff453a]/15 text-[14px] text-[#ff453a]"
                      >
                        Delete all
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
