"use client";

import { useSyncExternalStore } from "react";

/**
 * Natural sizes of page images, shared by every viewer for the life of the tab. Knowing a
 * page's shape before it reloads keeps the strip from jumping, lets spreads leave wide
 * pages alone, and lets wide pages split in two.
 */
const sizes = new Map<string, [number, number]>();
const listeners = new Set<() => void>();
let version = 0;
let queued = false;

export function pageSize(src: string) {
  return sizes.get(src);
}

/** Width over height, or `fallback` while the page has never loaded. */
export function pageRatio(src: string, fallback = 2 / 3) {
  const s = sizes.get(src);
  return s ? s[0] / s[1] : fallback;
}

/** A page wider than it is tall: a double-page spread. */
export function isWide(src: string) {
  const s = sizes.get(src);
  return !!s && s[0] > s[1] * 1.1;
}

export function setPageSize(src: string, w: number, h: number) {
  if (!w || !h || sizes.has(src)) return;
  sizes.set(src, [w, h]);
  if (sizes.size > 4000) sizes.delete(sizes.keys().next().value!);
  version++;
  // Pages often finish together; one notification per task is enough.
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    listeners.forEach((l) => l());
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Re-renders when a new page size is known. Pass false to opt out without breaking hook order. */
export function usePageSizes(enabled = true) {
  return useSyncExternalStore(
    subscribe,
    () => (enabled ? version : 0),
    () => 0,
  );
}
