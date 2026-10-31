// Fetches an upstream URL on behalf of the Manhwa server. Two jobs:
//  - video segments: the browser streams them from here, so Render serves no video bandwidth
//    (the CDN rejects browser requests from other sites, so they can't load directly);
//  - source pages a host refuses to serve to Render's datacenter IPs.
// Only URLs signed by the server (HMAC with RELAY_KEY, with an expiry) are relayed.

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PASS = ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "ETag"];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length, Content-Range" };

async function sign(key, message) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const relay = {
  async fetch(request, env) {
    if (request.method === "OPTIONS")
      return new Response(null, { headers: { ...CORS, "Access-Control-Allow-Headers": "Range", "Access-Control-Max-Age": "86400" } });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: CORS });

    const params = new URL(request.url).searchParams;
    const u = params.get("u") ?? "";
    const ref = params.get("ref") ?? "";
    const h = params.get("h") ?? "";
    const exp = params.get("exp") ?? "";
    const sig = params.get("sig") ?? "";
    if (!env.RELAY_KEY || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000)
      return new Response("Expired", { status: 403, headers: CORS });
    if (!same(sig, await sign(env.RELAY_KEY, `${u}|${ref}|${h}|${exp}`)))
      return new Response("Bad signature", { status: 403, headers: CORS });

    let target;
    try {
      target = new URL(u);
    } catch {
      return new Response("Bad url", { status: 400, headers: CORS });
    }
    if (target.protocol !== "https:") return new Response("Bad url", { status: 400, headers: CORS });

    const range = request.headers.get("Range");
    const headers = { "User-Agent": BROWSER_UA, Accept: "*/*", ...(h ? JSON.parse(h) : {}) };
    if (ref) headers.Referer = ref;
    if (range) headers.Range = range;
    const upstream = await fetch(target, {
      headers,
      redirect: "follow",
      // Whole files are cached at the edge, so a rewatch or a second viewer is free.
      cf: range ? undefined : { cacheEverything: true, cacheTtl: 3600 },
    });

    const out = new Headers(CORS);
    for (const h of PASS) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    out.set("Cache-Control", upstream.ok ? "public, max-age=3600" : "no-store");
    out.set("X-Upstream-Status", String(upstream.status));
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

export default relay;
