import "server-only";
import { createHmac } from "node:crypto";

/**
 * Optional Cloudflare Worker relay (relay/worker.js). When RELAY_URL and RELAY_KEY are set,
 * video segments stream from it instead of this server, and sources that refuse this
 * server's IP are fetched through it.
 */
export function relayEnabled() {
  return !!(process.env.RELAY_URL && process.env.RELAY_KEY);
}

export function relayUrl(
  url: string,
  opts: { referer?: string; headers?: Record<string, string>; ttl?: number } = {},
) {
  const ref = opts.referer ?? "";
  const h = opts.headers && Object.keys(opts.headers).length ? JSON.stringify(opts.headers) : "";
  const exp = String(Math.floor(Date.now() / 1000) + (opts.ttl ?? 6 * 3600));
  const sig = createHmac("sha256", process.env.RELAY_KEY!)
    .update(`${url}|${ref}|${h}|${exp}`)
    .digest("hex");
  const q = new URLSearchParams({ u: url, ref, exp, sig });
  if (h) q.set("h", h);
  return `${process.env.RELAY_URL!.replace(/\/+$/, "")}/?${q}`;
}
