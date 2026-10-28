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
      className="rounded-full bg-white px-7 py-3 text-[15px] font-semibold text-black transition hover:bg-white/85 active:scale-[0.98]"
    >
      {text}
    </Link>
  );
}
