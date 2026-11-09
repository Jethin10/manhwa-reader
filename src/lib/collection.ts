"use client";
import { useSyncExternalStore } from "react";
import { toast } from "./toast";
export const STATUSES = [
  { value: "planned", label: "Plan to start" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
  { value: "dropped", label: "Dropped" },
] as const;
export type CollectionStatus = (typeof STATUSES)[number]["value"];
export type CollectionItem = {
  id: string;
  media: "anime" | "series" | "movie";
  title: string;
  cover: string | null;
  type: string;
  status: CollectionStatus;
  updatedAt: number;
};
export const COLLECTION_KEY = "mr:collection";
const EVENT = "mr:collection",
  empty: CollectionItem[] = [];
let memo: CollectionItem[] | undefined;
export function getCollection(): CollectionItem[] {
  if (!memo) {
    try {
      const value = JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? "[]");
      memo = Array.isArray(value) ? value : [];
    } catch {
      memo = [];
    }
  }
  return memo ?? empty;
}
function subscribe(cb: () => void) {
  memo = undefined;
  const fn = () => {
    memo = undefined;
    cb();
  };
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
export function useCollection() {
  return useSyncExternalStore(subscribe, getCollection, () => empty);
}
export function resetCollectionCache() {
  memo = undefined;
}
export function setCollection(
  item: Omit<CollectionItem, "status" | "updatedAt">,
  status: CollectionStatus | null,
) {
  const list = getCollection().filter(
    (x) => x.id !== item.id || x.media !== item.media,
  );
  try {
    localStorage.setItem(
      COLLECTION_KEY,
      JSON.stringify(
        status
          ? [{ ...item, status, updatedAt: Date.now() }, ...list].slice(0, 500)
          : list,
      ),
    );
  } catch {
    toast("Couldn't save your library. Check your device storage.", {
      tone: "error",
    });
    return;
  }
  memo = undefined;
  window.dispatchEvent(new Event(EVENT));
}
