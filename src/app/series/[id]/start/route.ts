import { redirect } from "next/navigation";
import { getChapters, withTimeout } from "@/lib/catalog";

/**
 * GET /series/<id>/start: the first readable chapter, so "Start Reading" opens the reader.
 * Uses the series' own source (cached), not every mirror; the reader merges sources anyway.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const first = await withTimeout(getChapters(id), 10000, "The chapter list")
    .then((chapters) => chapters.filter((c) => !c.externalUrl).at(-1))
    .catch(() => undefined);
  redirect(first ? `/series/${id}/chapter/${first.id}` : `/series/${id}`);
}
