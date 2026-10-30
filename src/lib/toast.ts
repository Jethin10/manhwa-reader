"use client";

import { useSyncExternalStore } from "react";

/** Short-lived confirmations ("Marked 6 chapters read · Undo"), shown by <Toaster />. */
export type Toast = {
  id: number;
  text: string;
  tone?: "error";
  /** A button (`run`) or a link (`href`). */
  action?: { label: string; run?: () => void; href?: string };
};

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(
  text: string,
  opts: Omit<Toast, "id" | "text"> & { ms?: number } = {},
) {
  const id = nextId++;
  // One at a time reads best on a phone; the newest replaces the rest.
  toasts = [{ id, text, tone: opts.tone, action: opts.action }];
  emit();
  setTimeout(() => dismiss(id), opts.ms ?? (opts.action ? 5000 : 3000));
  return id;
}

export function dismiss(id: number) {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

const EMPTY: Toast[] = [];
export function useToasts() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
    () => EMPTY,
  );
}
