import { getAnimeServers, getAnimeServerHealth } from "@/lib/anime";
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    if (!/^\d+$/.test(p.get("episode") ?? ""))
      return Response.json({ error: "Invalid episode." }, { status: 400 });
    const servers = await (
      p.get("check") === "1" ? getAnimeServerHealth : getAnimeServers
    )(p.get("episode")!);
    return Response.json(
      { servers },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=60",
        },
      },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Could not load servers." },
      { status: 502 },
    );
  }
}
