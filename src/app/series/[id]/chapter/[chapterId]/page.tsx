import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import {
  getAllUploads,
  getChapter,
  getChapters,
  getPages,
  getSeries,
} from "@/lib/catalog";
import { Reader } from "@/components/Reader";
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

export default function ChapterPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div data-reader className="min-h-screen bg-black pt-14">
          <div className="mx-auto max-w-[800px] space-y-3 px-5 pt-10">
            <div className="skeleton mx-auto h-4 w-40 rounded" />
            <div className="skeleton mx-auto h-8 w-56 rounded-lg" />
          </div>
          <div className="skeleton mx-auto mt-10 aspect-[2/3] max-w-[800px]" />
        </div>
      }
    >
      <ChapterContent params={params} />
    </Suspense>
  );
}

async function ChapterContent({ params }: { params: Props["params"] }) {
  try {
    return await LoadChapter({ params });
  } catch (e) {
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

async function LoadChapter({ params }: { params: Props["params"] }) {
  const { id, chapterId } = await params;
  const [series, chapters, uploads, { chapter }] = await Promise.all([
    getSeries(id),
    getChapters(id),
    getAllUploads(id),
    getChapter(chapterId),
  ]);

  if (chapter.externalUrl) {
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

  const pages = await getPages(chapterId);
  const readable = chapters.filter((c) => !c.externalUrl);
  // Newest first, so the next chapter sits before this one in the array.
  const idx = readable.findIndex(
    (c) =>
      c.id === chapterId ||
      (chapter.number != null && c.number === chapter.number),
  );
  const next = idx > 0 ? readable[idx - 1] : null;
  const prev = idx >= 0 && idx < readable.length - 1 ? readable[idx + 1] : null;
  const versions = uploads
    .filter(
      (u) =>
        !u.externalUrl && u.number === chapter.number && chapter.number != null,
    )
    .map((u) => ({ id: u.id, group: u.group, pages: u.pages }));

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
      chapters={readable.map((c) => ({
        id: c.number === chapter.number ? chapter.id : c.id,
        number: c.number,
        title: c.title,
      }))}
      versions={versions}
      pages={pages}
      prevId={prev?.id ?? null}
      nextId={next?.id ?? null}
    />
  );
}
