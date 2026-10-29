import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// A key lets the proxy accept rotating CDN hosts only for image URLs discovered by a
// source adapter. It never accepts arbitrary user-supplied hosts. Hosted servers set
// IMAGE_SIGNING_KEY so signed URLs survive restarts; locally a random key is kept on disk.
let key: Buffer | undefined;
function signingKey() {
  if (!key && process.env.IMAGE_SIGNING_KEY) key = Buffer.from(process.env.IMAGE_SIGNING_KEY);
  if (!key) {
    const dir = join(tmpdir(), "manhwa-reader-img");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "proxy-signing-key");
    try {
      writeFileSync(file, randomBytes(32), { flag: "wx" });
    } catch {}
    key = readFileSync(file);
  }
  return key;
}
export function imageSignature(url: string) {
  return createHmac("sha256", signingKey()).update(url).digest("hex");
}
export function validImageSignature(url: string, signature: string) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(imageSignature(url), "hex"),
    Buffer.from(signature, "hex"),
  );
}
