import { getPages } from "@/lib/catalog";

/**
 * GET /api/chapter/pages?id=<chapter id>
 * Page images for one chapter. The reader calls this for the next chapter while you read,
 * which warms the server's cache and lets the browser fetch its first pages early.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[a-zA-Z0-9~._-]{1,240}$/.test(id))
    return Response.json({ pages: [] }, { status: 400 });
  try {
    const pages = await getPages(id);
    return Response.json(
      { pages },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    return Response.json({ pages: [] }, { status: 502 });
  }
}
