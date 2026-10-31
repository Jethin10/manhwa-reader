"use client";
import { normalizeReader } from "./library";
import { normalizePreferences } from "./preferences";
import { STATUSES } from "./collection";
const KEYS = [
  "mr:bookmarks",
  "mr:history",
  "mr:reader",
  "mr:reader-series",
  "mr:positions",
  "mr:watch-history",
  "mr:collection",
  "mr:preferences",
  "mr:playback-mode",
  "mr:read",
  "mr:reader-mode",
];
const ID = /^[a-zA-Z0-9~._-]{1,240}$/;
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("The backup contains an invalid record.");
  return v as Record<string, unknown>;
}
function text(v: unknown, max = 500): string {
  if (typeof v !== "string" || v.length > max)
    throw new Error("The backup contains invalid text.");
  return v;
}
function id(v: unknown) {
  const value = text(v, 240);
  if (
    !ID.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  )
    throw new Error("The backup contains an invalid title or chapter ID.");
  return value;
}
function number(v: unknown, max: number, fallback = 0) {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(max, Math.max(0, v))
    : fallback;
}
function cover(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const value = text(v, 4000);
  if (value.startsWith("/api/img?")) return value;
  try {
    if (new URL(value).protocol === "https:") return value;
  } catch {}
  throw new Error("The backup contains an invalid image URL.");
}
function series(v: unknown) {
  const r = record(v);
  return {
    id: id(r.id),
    title: text(r.title),
    cover: cover(r.cover),
    type: text(r.type ?? "Comic", 60),
  };
}
function clean(key: string, value: unknown): unknown {
  if (key === "mr:reader") return normalizeReader(value);
  if (key === "mr:preferences") return normalizePreferences(value);
  if (key === "mr:playback-mode") return value === "smooth" ? "smooth" : "auto";
  if (key === "mr:positions")
    return Object.fromEntries(
      Object.entries(record(value))
        .slice(-300)
        .map(([k, v]) => [id(k), Math.floor(number(v, 100000))]),
    );
  if (key === "mr:read")
    return Object.fromEntries(
      Object.entries(record(value))
        .slice(-1000)
        .map(([k, v]) => {
          if (!Array.isArray(v) || v.length > 5000)
            throw new Error("The backup contains an invalid read list.");
          return [id(k), v.map((x) => text(x, 260))];
        }),
    );
  if (key === "mr:reader-mode")
    return Object.fromEntries(
      Object.entries(record(value))
        .slice(-500)
        .filter(([, v]) =>
          ["auto", "webtoon", "webtoon-gaps", "ltr", "rtl", "vertical"].includes(
            String(v),
          ),
        )
        .map(([k, v]) => [id(k), v]),
    );
  if (key === "mr:reader-series")
    return Object.fromEntries(
      Object.entries(record(value))
        .slice(-100)
        .map(([k, v]) => [id(k), normalizeReader(v)]),
    );
  if (!Array.isArray(value) || value.length > 500)
    throw new Error("The backup contains an invalid or oversized list.");
  if (key === "mr:bookmarks") return value.map(series);
  if (key === "mr:history")
    return value.map((v) => {
      const r = record(v);
      return {
        ...series(r),
        chapterId: id(r.chapterId),
        chapterNumber:
          r.chapterNumber == null ? null : text(r.chapterNumber, 40),
        at: number(r.at, 9e15),
        progress: number(r.progress, 1),
      };
    });
  if (key === "mr:collection")
    return value.map((v) => {
      const r = record(v);
      if (
        !STATUSES.some((s) => s.value === r.status) ||
        !["series", "anime"].includes(String(r.media))
      )
        throw new Error("The backup contains an invalid library status.");
      return {
        ...series(r),
        media: r.media,
        status: r.status,
        updatedAt: number(r.updatedAt, 9e15),
      };
    });
  if (key === "mr:watch-history")
    return value.map((v) => {
      const r = record(v),
        a = record(r.anime);
      if (!/^\d+$/.test(String(r.episodeId)))
        throw new Error("The backup contains an invalid episode.");
      return {
        anime: {
          id: id(a.id),
          title: text(a.title),
          cover: cover(a.cover) ?? "",
          sub: number(a.sub, 100000),
          dub: number(a.dub, 100000),
          format: text(a.format ?? "Anime", 60),
        },
        episodeId: String(r.episodeId),
        episodeNumber: number(r.episodeNumber, 100000),
        language: r.language === "dub" ? "dub" : "sub",
        at: number(r.at, 9e15),
        time: number(r.time, 86400),
        duration: number(r.duration, 86400),
      };
    });
  throw new Error("Unsupported backup data.");
}
export function exportBackup() {
  const storage: Record<string, unknown> = {};
  for (const key of KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      try {
        storage[key] = clean(
          key,
          key === "mr:playback-mode" ? value : JSON.parse(value),
        );
      } catch {}
    }
  }
  return JSON.stringify(
    {
      app: "Manhwa",
      version: 1,
      exportedAt: new Date().toISOString(),
      storage,
    },
    null,
    2,
  );
}
export function importBackup(json: string) {
  if (new Blob([json]).size > 2 * 1024 * 1024)
    throw new Error("Choose a backup smaller than 2 MB.");
  let backup: Record<string, unknown>;
  try {
    backup = record(JSON.parse(json));
  } catch {
    throw new Error("This is not a valid JSON backup.");
  }
  if (backup.app !== "Manhwa" || backup.version !== 1)
    throw new Error("Choose a version 1 Manhwa library backup.");
  const incoming = record(backup.storage),
    prepared: [string, string][] = [];
  for (const key of KEYS) {
    if (!(key in incoming)) continue;
    let next = clean(key, incoming[key]);
    const oldRaw = localStorage.getItem(key);
    if (
      oldRaw &&
      [
        "mr:bookmarks",
        "mr:history",
        "mr:watch-history",
        "mr:collection",
      ].includes(key)
    ) {
      let old: unknown[] = [];
      try {
        const parsed = clean(key, JSON.parse(oldRaw));
        if (Array.isArray(parsed)) old = parsed;
      } catch {}
      const identity = (v: unknown) => {
        const r = record(v);
        return key === "mr:watch-history"
          ? record(r.anime).id
          : `${r.media ?? ""}:${r.id}`;
      };
      next = [
        ...new Map(
          [...old, ...(next as unknown[])].map((v) => [identity(v), v]),
        ).values(),
      ].slice(-500);
    }
    if (oldRaw && ["mr:positions", "mr:reader-series"].includes(key)) {
      try {
        next = Object.fromEntries(
          Object.entries({
            ...record(clean(key, JSON.parse(oldRaw))),
            ...record(next),
          }).slice(key === "mr:positions" ? -300 : -100),
        );
      } catch {}
    }
    prepared.push([
      key,
      key === "mr:playback-mode" ? String(next) : JSON.stringify(next),
    ]);
  }
  if (!prepared.length) throw new Error("This backup has no supported data.");
  const previous = prepared.map(
    ([key]) => [key, localStorage.getItem(key)] as const,
  );
  try {
    for (const [key, value] of prepared) localStorage.setItem(key, value);
  } catch {
    for (const [key] of prepared) localStorage.removeItem(key);
    for (const [key, value] of previous) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    throw new Error(
      "The device could not save the backup. Free some browser storage and retry.",
    );
  }
  window.dispatchEvent(new Event("storage"));
  return prepared.length;
}
