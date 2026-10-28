export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [secs, name] of units) {
    const n = Math.floor(s / secs);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

export function chapterLabel(c: { number: string | null; title?: string | null }) {
  return c.number ? `Chapter ${c.number}` : (c.title ?? "Oneshot");
}

export function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Strips MangaDex markdown links / trailing credit blocks from synopses. */
export function cleanDescription(d: string) {
  return d
    .split(/\n-{3,}\n/)[0]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
    .trim();
}
