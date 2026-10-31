import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import {
  getChapter,
  getChapters,
  getPages,
  getSeries,
  withTimeout,
  type Chapter,
  type PageImage,
} from "@/lib/catalog";
import { getMergedChapters, versionsOf } from "@/lib/unified";
import { chapterKey } from "@/lib/titles";
import { Reader, type ChapterNav } from "@/components/Reader";
import { SourceIssue } from "@/components/SourceIssue";

type Props = PageProps<"/series/[id]/chapter/[chapterId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, chapterId } = await params;
  const result = await Promise.all([
    getSeries(id),
    getChapter(chapterId),
  ]).catch(() => null);
  if (!result) return { title: "Chapter unavailable" };
  const [s, { chapter }] = result;
  return {
    title:
      `${s.title} ${chapter.number ? `Chapter ${chapter.number}` : ""}`.trim(),
  };
}

export default function ChapterPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <div
          data-reader
          className="grid min-h-dvh place-items-center bg-black"
          aria-busy
        >
          <span className="size-7 animate-spin rounded-full border-2 border-white/15 border-t-white/70" />
          <span className="sr-only">Loading chapter</span>
        </div>
      }
    >
      <ChapterContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ChapterContent(props: Pick<Props, "params" | "searchParams">) {
  try {
    return await LoadChapter(props);
  } catch (e) {
    unstable_rethrow(e);
    return (
      <SourceIssue
        message={
          e instanceof Error
            ? e.message
            : "The source could not load this chapter."
        }
      />
    );
  }
}

async function LoadChapter({
  params,
  searchParams,
}: Pick<Props, "params" | "searchParams">) {
  const { id, chapterId } = await params;
  // Copies that already failed on the way here, so fallbacks never loop between two.
  const raw = (await searchParams).skip;
  const tried = new Set(
    (Array.isArray(raw) ? raw.join(",") : (raw ?? ""))
      .split(",")
      .filter(Boolean),
  );
  tried.add(chapterId);
  // Pages start loading with everything else; they're what the reader waits on.
  const pagesJob = getPages(chapterId);
  pagesJob.catch(() => {});
  const [series, { chapter }] = await Promise.all([
    getSeries(id),
    getChapter(chapterId),
  ]);
  // Every source's chapter list. The reader doesn't wait for it: a slow or dead mirror
  // would hold the first page back, so navigation streams in when it's ready.
  const merged = withTimeout(getMergedChapters(id), 25000, "The chapter list");
  merged.catch(() => {});
  const otherCopy = async () =>
    versionsOf((await merged).uploads, chapter.number, id).find(
      (c) => !tried.has(c.id),
    );
  const open = (copy: Chapter) =>
    redirect(
      `/series/${id}/chapter/${copy.id}?skip=${encodeURIComponent([...tried].join(","))}`,
    );

  // A licensed chapter may still be hosted by another source.
  if (chapter.externalUrl) {
    const hosted = await otherCopy().catch(() => undefined);
    if (hosted) open(hosted);
    return (
      <div className="mx-auto max-w-md px-5 py-28 text-center">
        <h1 className="display text-[24px] font-semibold">
          Available on the official site
        </h1>
        <p className="mt-2 text-[15px] text-secondary">
          The publisher only allows this chapter to be read on their platform.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <a
            href={chapter.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-black"
          >
            Open Official Site
          </a>
          <Link
            href={`/series/${id}`}
            className="rounded-full bg-fill px-6 py-3 text-[15px] font-semibold"
          >
            Back
          </Link>
        </div>
      </div>
    );
  }

  let pages: PageImage[] = [];
  let failure: unknown;
  try {
    pages = await pagesJob;
    if (!pages.length) failure = new Error("This chapter has no pages yet.");
  } catch (error) {
    failure = error;
  }
  if (failure) {
    // Keep reading: switch to the best other copy of this chapter.
    const fallback = await otherCopy().catch(() => undefined);
    if (!fallback) throw failure;
    open(fallback);
  }

  const nav: Promise<ChapterNav> = merged
    .catch(async () => ({
      // Mirrors failed: navigate within this source alone.
      chapters: await getChapters(id).catch(() => [] as Chapter[]),
      uploads: [] as Chapter[],
    }))
    .then(({ chapters, uploads }) => {
      const key = chapterKey(chapter.number);
      const same = (c: Chapter) =>
        c.id === chapterId || (key !== null && chapterKey(c.number) === key);
      const readable = chapters.filter((c) => !c.externalUrl);
      // Newest first, so the next chapter sits before this one in the array.
      const idx = readable.findIndex(same);
      const next = idx > 0 ? readable[idx - 1] : null;
      const prev =
        idx >= 0 && idx < readable.length - 1 ? readable[idx + 1] : null;
      return {
        chapters: readable.map((c) => ({
          id: same(c) ? chapterId : c.id,
          number: c.number,
          title: c.title,
        })),
        versions: versionsOf(uploads, chapter.number, id).map((u) => ({
          id: u.id,
          group:
            u.source && u.group !== u.source
              ? `${u.group ?? "Unknown group"} · ${u.source}`
              : (u.group ?? u.source ?? null),
          pages: u.pages,
        })),
        prev: prev && { id: prev.id, number: prev.number, title: prev.title },
        next: next && { id: next.id, number: next.number, title: next.title },
      };
    });

  return (
    <Reader
      key={chapter.id}
      series={{
        id: series.id,
        title: series.title,
        cover: series.cover,
        type: series.type,
      }}
      chapter={chapter}
      pages={pages}
      nav={nav}
    />
  );
}
