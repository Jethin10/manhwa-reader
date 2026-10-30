"use client";

import Link from "next/link";
import { readKey, useHistory, useReadChapters } from "@/lib/library";

type Ref = { id: string; number: string | null };

/**
 * The series' main action, as in Mihon's "Resume": the chapter you're in the middle of,
 * the one after the chapter you finished, or the first unread chapter.
 */
export function ReadButton({
  seriesId,
  chapters,
}: {
  seriesId: string;
  /** Readable chapters, newest first. */
  chapters: Ref[];
}) {
  const last = useHistory().find((h) => h.id === seriesId);
  const read = useReadChapters(seriesId);
  const oldestFirst = [...chapters].reverse();
  const label = (c: Ref) => (c.number ? ` Chapter ${c.number}` : "");

  let target = oldestFirst[0];
  let text = `Start reading${label(target)}`;
  if (last) {
    const at = oldestFirst.findIndex(
      (c) =>
        c.id === last.chapterId ||
        (last.chapterNumber !== null && c.number === last.chapterNumber),
    );
    const finished = read.has(
      readKey({ id: last.chapterId, number: last.chapterNumber }),
    );
    // After a finished chapter, the next one not already marked read.
    const after =
      at >= 0 && finished
        ? (oldestFirst.slice(at + 1).find((c) => !read.has(readKey(c))) ??
          oldestFirst[at + 1])
        : undefined;
    if (after) {
      target = after;
      text = `Read${label(target)}`;
    } else if (at >= 0 && finished) {
      target = oldestFirst[at];
      text = "Read again";
    } else {
      target = at >= 0 ? oldestFirst[at] : { id: last.chapterId, number: last.chapterNumber };
      text = `Continue${label(target)}`;
    }
  } else if (read.size) {
    const unread = oldestFirst.find((c) => !read.has(readKey(c)));
    if (unread) {
      target = unread;
      text = `Read${label(unread)}`;
    }
  }
  return (
    <Link
      href={`/series/${seriesId}/chapter/${target.id}`}
      className="btn btn-primary h-[50px] w-full px-8 text-[16px] sm:w-auto"
    >
      {text}
    </Link>
  );
}
