"use client";

import Link from "next/link";
import { useMemo } from "react";
import { deleteDownloads, queueDownloads, useDownloads } from "@/lib/downloads";
import { useAllRead, useHistory } from "@/lib/library";
import {
  refreshUpdates,
  unreadCount,
  useAutoRefresh,
  useLibrarySeries,
  useUpdates,
} from "@/lib/updates";
import { DownloadButton } from "./ChapterList";
import { Cover } from "./SeriesCard";
import { TimeAgo } from "./TimeAgo";

function dayLabel(t: number) {
  const d = new Date(t);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(today) - start(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

/** New chapters across the library, newest first, as in Mihon's Updates tab. */
export function Updates() {
  const series = useLibrarySeries();
  useAutoRefresh(series);
  const { data, refreshing } = useUpdates();
  const read = useAllRead();
  const history = useHistory();
  const { saved, jobs } = useDownloads();

  const rows = useMemo(() => {
    const byId = new Map(series.map((s) => [s.id, s]));
    return Object.entries(data.series)
      .filter(([id]) => byId.has(id))
      .flatMap(([id, u]) =>
        u.recent.map((c) => ({ ...c, series: byId.get(id)!, time: Date.parse(c.at) })),
      )
      .filter((r) => Number.isFinite(r.time))
      .sort((a, b) => b.time - a.time)
      .slice(0, 300);
  }, [data, series]);

  // Per day, one row per series: a burst of releases reads as "Chapters 1–6".
  const groups = useMemo(() => {
    const out: { label: string; rows: (typeof rows)[] }[] = [];
    for (const r of rows) {
      const label = dayLabel(r.time);
      if (out.at(-1)?.label !== label) out.push({ label, rows: [] });
      const day = out.at(-1)!;
      const same = day.rows.find((g) => g[0].series.id === r.series.id);
      if (same) same.push(r);
      else day.rows.push([r]);
    }
    return out;
  }, [rows]);

  const isRead = (seriesId: string, number: string | null, id: string) => {
    const n = parseFloat(number ?? "");
    const key = Number.isFinite(n) ? String(n) : `id:${id}`;
    if (read[seriesId]?.includes(key)) return true;
    const last = parseFloat(history.find((h) => h.id === seriesId)?.chapterNumber ?? "");
    return Number.isFinite(n) && Number.isFinite(last) && n < last;
  };
  const totalUnread = series.reduce(
    (n, s) =>
      n +
      unreadCount(data.series[s.id], read[s.id], history.find((h) => h.id === s.id)),
    0,
  );
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  return (
    <div className="gutter mx-auto max-w-[860px] pt-4 pb-16 lg:pt-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="t-large">Updates</h1>
          <p className="t-sub mt-1 text-secondary">
            {refreshing ? (
              "Checking your library for new chapters…"
            ) : data.at ? (
              <>
                {totalUnread
                  ? `${totalUnread} unread across your library`
                  : "You're all caught up"}{" "}
                · checked <TimeAgo iso={new Date(data.at).toISOString()} />
              </>
            ) : (
              "New chapters from the series in your library."
            )}
          </p>
        </div>
        {series.length > 0 && (
          <button
            onClick={() => void refreshUpdates(series).catch(() => {})}
            disabled={refreshing}
            aria-label="Check for new chapters"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-fill text-accent transition active:scale-95 disabled:opacity-60"
          >
            <svg
              viewBox="0 0 24 24"
              className={`size-5 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>

      {data.failed.length > 0 && !refreshing && (
        <p className="t-footnote mt-4 rounded-xl bg-warning/10 px-4 py-3 text-warning">
          {data.failed.length} {data.failed.length === 1 ? "series" : "series"} couldn&apos;t be
          checked because its source is down. Showing the last known chapters.
        </p>
      )}

      {series.length === 0 ? (
        <Empty
          title="Nothing to follow yet"
          text="Add series to your Library and their new chapters show up here."
          href="/series"
          cta="Browse series"
        />
      ) : !rows.length && !refreshing ? (
        <Empty
          title="No new chapters lately"
          text="Nothing from your library came out in the last six weeks. Pull new ones with the refresh button."
          href="/bookmarks"
          cta="Open Library"
        />
      ) : !rows.length ? (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-[72px] rounded-[14px]" />
          ))}
        </div>
      ) : (
        <div className="mt-8 space-y-7">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="t-footnote mb-2 px-4 font-semibold tracking-[0.02em] text-secondary uppercase">
                {g.label}
              </h2>
              <ul className="grouped">
                {g.rows.map((burst) => {
                  // Oldest first, so the row opens the first chapter you haven't read.
                  const list = [...burst].reverse();
                  const unread = list.filter((c) => !isRead(c.series.id, c.number, c.id));
                  const r = unread[0] ?? list[0];
                  const done = unread.length === 0;
                  const many = list.length > 1;
                  const first = list[0].number;
                  const last = list.at(-1)!.number;
                  const job = list.map((c) => jobById.get(c.id)).find(Boolean);
                  return (
                    <li key={r.id} className="row-divider flex items-center pr-1">
                      <Link
                        href={`/series/${r.series.id}/chapter/${r.id}`}
                        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 transition-colors hover:bg-white/[0.04] active:bg-white/[0.08]"
                      >
                        <Cover
                          cover={r.series.cover}
                          alt=""
                          sizes="44px"
                          className="aspect-[2/3] w-11 shrink-0 rounded-md"
                        />
                        <span className={`min-w-0 flex-1 ${done ? "opacity-45" : ""}`}>
                          <span className="t-callout flex items-center gap-2">
                            {!done && (
                              <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                            )}
                            <span className="truncate font-medium">{r.series.title}</span>
                          </span>
                          <span className="t-footnote block truncate text-secondary">
                            {many && first && last
                              ? `Chapters ${first}–${last} · ${unread.length ? `${unread.length} new` : "read"}`
                              : r.number
                                ? `Chapter ${r.number}${r.title ? ` · ${r.title}` : ""}`
                                : (r.title ?? "Extra")}
                          </span>
                        </span>
                        <TimeAgo iso={r.at} className="t-caption shrink-0 text-tertiary" />
                      </Link>
                      <DownloadButton
                        downloaded={list.every((c) => saved[c.id])}
                        job={job}
                        onDownload={() =>
                          queueDownloads(
                            r.series,
                            list
                              .filter((c) => !saved[c.id])
                              .map((c) => ({ id: c.id, number: c.number, title: c.title })),
                          )
                        }
                        onDelete={() => void deleteDownloads(list.map((c) => c.id))}
                        label={many ? `chapters ${first} to ${last}` : r.number ? `chapter ${r.number}` : "chapter"}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ title, text, href, cta }: { title: string; text: string; href: string; cta: string }) {
  return (
    <div className="mt-16 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-fill text-secondary">
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="t-title3 mt-5">{title}</h2>
      <p className="t-callout mx-auto mt-2 max-w-sm text-secondary">{text}</p>
      <Link href={href} className="btn btn-gray mt-7">
        {cta}
      </Link>
    </div>
  );
}
