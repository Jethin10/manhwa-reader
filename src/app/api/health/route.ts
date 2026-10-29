import { connection } from "next/server";

/** Uptime checks: answers from the running server without touching any source. */
export async function GET() {
  await connection();
  return Response.json({ ok: true, uptime: Math.round(process.uptime()) });
}
