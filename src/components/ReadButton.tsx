"use client";

import Link from "next/link";
import { useHistory } from "@/lib/library";

/** "Read Chapter 1", or "Continue Chapter N" once the series is in reading history. */
export function ReadButton({
  seriesId,
  firstId,
  firstNumber,
}: {
  seriesId: string;
  firstId: string;
  firstNumber: string | null;
}) {
  const last = useHistory().find((h) => h.id === seriesId);
  const target = last?.chapterId ?? firstId;
  const text = last
    ? `Continue${last.chapterNumber ? ` Chapter ${last.chapterNumber}` : ""}`
    : `Read${firstNumber ? ` Chapter ${firstNumber}` : ""}`;
  return (
    <Link
      href={`/series/${seriesId}/chapter/${target}`}
      className="btn btn-primary h-[50px] w-full px-8 text-[16px] sm:w-auto"
    >
      {text}
    </Link>
  );
}
