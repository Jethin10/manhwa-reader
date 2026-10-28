import { getAnimeMedia } from "@/lib/anime-media";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (
    !/^\d+$/.test(p.get("episode") ?? "") ||
    !["sub", "dub"].includes(p.get("audio") ?? "")
  )
    return Response.json(
      { error: "Invalid episode or audio." },
      { status: 400 },
    );
  try {
    return Response.json(
      await getAnimeMedia(p.get("episode")!, p.get("audio") as "sub" | "dub"),
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Media unavailable." },
      { status: 502 },
    );
  }
}
