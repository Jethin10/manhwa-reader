import { getChapters, withTimeout } from "@/lib/catalog";
import { sourceOf } from "@/lib/sources";
import { chapterKey } from "@/lib/titles";

const ID = /^[a-zA-Z0-9~._-]{1,240}$/;
const MAX_IDS = 60;
const RECENT_MS = 45 * 24 * 3600 * 1000;

export type SeriesUpdate = {
  /** Every numbered chapter; their keys are String(number), as chapterKey makes them. */
  numbers: number[];
  /** Keys of unnumbered chapters. */
  other: string[];
  /** Recent chapters, newest first. */
  recent: { id: string; number: string | null; title: string | null; at: string }[];
};

async function check(id: string): Promise<SeriesUpdate> {
  const list = await withTimeout(getChapters(id), 15000, sourceOf(id));
  const readable = list.filter((c) => !c.externalUrl);
  const cutoff = Date.now() - RECENT_MS;
  const numbers: number[] = [];
  const other: string[] = [];
  for (const c of readable) {
    const key = chapterKey(c.number);
    if (key === null) other.push(`id:${c.id}`);
    else numbers.push(Number(key));
  }
  return {
    numbers: [...new Set(numbers)],
    other,
    recent: readable
      .filter((c) => Date.parse(c.readableAt) >= cutoff)
      .slice(0, 20)
      .map((c) => ({ id: c.id, number: c.number, title: c.title, at: c.readableAt })),
  };
}

/**
 * POST /api/updates { ids: string[] }
 * Chapter lists for the series in a library, so the client can show unread counts and new
 * chapters (Mihon's Updates). Each source's list is cached for minutes on the server.
 */
export async function POST(request: Request) {
  let ids: string[];
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids) || body.ids.length > MAX_IDS) throw 0;
    ids = [...new Set(body.ids.filter((x): x is string => typeof x === "string" && ID.test(x)))];
  } catch {
    return Response.json({ error: "Send up to 60 series ids." }, { status: 400 });
  }
  const series: Record<string, SeriesUpdate> = {};
  const failed: string[] = [];
  // A few at a time, so one library refresh doesn't hammer every source at once.
  let next = 0;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        try {
          series[id] = await check(id);
        } catch {
          failed.push(id);
        }
      }
    }),
  );
  return Response.json({ series, failed }, { headers: { "Cache-Control": "no-store" } });
}
