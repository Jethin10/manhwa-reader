"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Chapter } from "@/lib/catalog";
import { useHistory } from "@/lib/library";
import { ChevronRight, ExternalIcon, SearchIcon } from "./Icons";
import { TimeAgo } from "./TimeAgo";

const PAGE = 50;

export function ChapterList({
  seriesId,
  chapters,
  showSource,
  pending,
}: {
  seriesId: string;
  chapters: Chapter[];
  /** Label each row with its source when the list merges several. */
  showSource?: boolean;
  /** Other sources are still being checked. */
  pending?: boolean;
}) {
  const [q, setQ] = useState("");
  const [asc, setAsc] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const lastRead = useHistory().find((h) => h.id === seriesId)?.chapterId;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? chapters.filter((c) => (c.number ?? "").includes(term) || (c.title ?? "").toLowerCase().includes(term))
      : chapters;
    return asc ? [...list].reverse() : list;
  }, [chapters, q, asc]);
  const shown = filtered.slice(0, limit);

  return (
    <section aria-busy={pending}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="t-title2 flex items-baseline gap-2">
          Chapters
          <span className="t-sub font-normal text-tertiary tabular-nums">{chapters.length}</span>
        </h2>
        {pending && (
          <span className="t-caption flex items-center gap-1.5 text-secondary">
            <span className="size-3 animate-spin rounded-full border-[1.5px] border-tertiary border-t-transparent" />
            Checking other sources
          </span>
        )}
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <label className="flex h-9 flex-1 items-center gap-2 rounded-[10px] bg-fill px-3 sm:w-48 sm:flex-none">
            <SearchIcon className="size-[14px] text-secondary" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE);
              }}
              inputMode="decimal"
              enterKeyHint="search"
              placeholder="Chapter number"
              aria-label="Find chapter"
              className="t-footnote w-full bg-transparent outline-none placeholder:text-secondary"
            />
          </label>
          <button
            onClick={() => setAsc((v) => !v)}
            className="t-footnote h-9 rounded-[10px] bg-fill px-3.5 font-medium text-label/90 transition hover:bg-fill-2"
          >
            {asc ? "Oldest first" : "Newest first"}
          </button>
        </div>
      </div>

      {chapters.length === 0 ? (
        <p className="grouped t-callout p-10 text-center text-secondary">
          {pending ? "Looking for chapters on other sources…" : "No English chapters are available on any source yet."}
        </p>
      ) : (
        <ul className="grouped">
          {shown.map((c) => {
            const isLast = c.id === lastRead;
            const detail = [c.number && c.title ? c.title : null, c.group].filter(Boolean).join(" · ");
            const body = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="t-callout flex items-center gap-2">
                    {isLast && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Last read" />}
                    <span className={isLast ? "font-semibold" : ""}>
                      {c.number ? `Chapter ${c.number}` : (c.title ?? "Oneshot")}
                    </span>
                  </p>
                  {(detail || (showSource && c.source)) && (
                    <p className="t-caption mt-0.5 flex items-center gap-1.5 truncate text-secondary">
                      {showSource && c.source && (
                        <span className="shrink-0 rounded-[5px] bg-fill px-1.5 py-px text-[11px] font-medium text-label/80">
                          {c.source}
                        </span>
                      )}
                      {detail !== c.source && <span className="truncate">{detail}</span>}
                    </p>
                  )}
                </div>
                <TimeAgo iso={c.readableAt} className="t-caption shrink-0 text-tertiary" />
                {c.externalUrl ? (
                  <ExternalIcon className="size-4 text-tertiary" />
                ) : (
                  <ChevronRight className="size-4 text-tertiary" />
                )}
              </>
            );
            const cls =
              "flex min-h-[52px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.04] active:bg-white/[0.08]";
            return (
              <li key={c.id} className="row-divider">
                {c.externalUrl ? (
                  <a href={c.externalUrl} target="_blank" rel="noreferrer" className={cls} title="Hosted on the official site">
                    {body}
                  </a>
                ) : (
                  <Link href={`/series/${seriesId}/chapter/${c.id}`} prefetch={false} className={cls}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
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
    </section>
  );
}
