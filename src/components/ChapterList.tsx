"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Chapter } from "@/lib/catalog";
import { useHistory } from "@/lib/library";
import { ChevronRight, ExternalIcon, SearchIcon } from "./Icons";
import { TimeAgo } from "./TimeAgo";

const PAGE = 50;

export function ChapterList({ seriesId, chapters }: { seriesId: string; chapters: Chapter[] }) {
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
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="display text-[22px] font-semibold">
          Chapters <span className="text-[15px] font-normal text-tertiary">{chapters.length}</span>
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex h-8 w-44 items-center gap-2 rounded-[9px] bg-fill px-2.5">
            <SearchIcon className="size-[14px] text-secondary" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Find chapter"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-secondary"
            />
          </label>
          <button
            onClick={() => setAsc((v) => !v)}
            className="h-8 rounded-[9px] bg-fill px-3 text-[13px] text-label/90 transition hover:bg-fill-2"
          >
            {asc ? "Oldest" : "Newest"}
          </button>
        </div>
      </div>

      {chapters.length === 0 ? (
        <p className="rounded-[18px] bg-card/60 p-10 text-center text-[15px] text-secondary">
          No English chapters are available yet.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[18px] bg-card/60 ring-1 ring-white/[0.06]">
          {shown.map((c) => {
            const isLast = c.id === lastRead;
            const body = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[15px]">
                    {isLast && <span className="size-2 shrink-0 rounded-full bg-accent" />}
                    <span className={isLast ? "font-semibold" : ""}>
                      {c.number ? `Chapter ${c.number}` : (c.title ?? "Oneshot")}
                    </span>
                  </p>
                  <p className="truncate text-[12px] text-secondary">
                    {[c.number && c.title ? c.title : null, c.group].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <TimeAgo iso={c.readableAt} className="shrink-0 text-[12px] text-tertiary" />
                {c.externalUrl ? (
                  <ExternalIcon className="size-4 text-tertiary" />
                ) : (
                  <ChevronRight className="size-4 text-tertiary" />
                )}
              </>
            );
            const cls =
              "flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.04]";
            return (
              <li key={c.id} className="border-t border-hairline first:border-0">
                {c.externalUrl ? (
                  <a href={c.externalUrl} target="_blank" rel="noreferrer" className={cls} title="Hosted on the official site">
                    {body}
                  </a>
                ) : (
                  <Link href={`/series/${seriesId}/chapter/${c.id}`} className={cls}>
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
          className="mt-3 w-full rounded-[14px] bg-fill py-3 text-[14px] font-medium text-accent transition hover:bg-fill-2"
        >
          Show more ({filtered.length - limit} remaining)
        </button>
      )}
    </section>
  );
}
