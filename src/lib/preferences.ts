"use client";
import { useSyncExternalStore } from "react";
export type Preferences = {
  speed: number;
  seekSeconds: number;
  audio: "sub" | "dub";
  autoNext: boolean;
  autoSkipIntro: boolean;
  pauseWhenHidden: boolean;
  fit: "contain" | "cover";
  subtitleSize: number;
  subtitleColor: "white" | "yellow";
  subtitleBackground: boolean;
  buffer: "balanced" | "generous";
  reduceMotion: boolean;
  accent: "violet" | "blue" | "rose";
};
export const DEFAULT_PREFERENCES: Preferences = {
  speed: 1,
  seekSeconds: 10,
  audio: "sub",
  autoNext: false,
  autoSkipIntro: false,
  pauseWhenHidden: false,
  fit: "contain",
  subtitleSize: 24,
  subtitleColor: "white",
  subtitleBackground: true,
  buffer: "balanced",
  reduceMotion: false,
  accent: "blue",
};
export const PREFERENCES_KEY = "mr:preferences";
const EVENT = "mr:preferences";
let memo: Preferences | undefined;
export function normalizePreferences(raw: unknown): Preferences {
  const v = raw && typeof raw === "object" ? (raw as Partial<Preferences>) : {};
  return {
    speed: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(v.speed ?? 0)
      ? v.speed!
      : 1,
    seekSeconds: [5, 10, 30].includes(v.seekSeconds ?? 0) ? v.seekSeconds! : 10,
    audio: v.audio === "dub" ? "dub" : "sub",
    autoNext: v.autoNext === true,
    autoSkipIntro: v.autoSkipIntro === true,
    pauseWhenHidden: v.pauseWhenHidden === true,
    fit: v.fit === "cover" ? "cover" : "contain",
    subtitleSize: [16, 20, 24, 28, 32, 40].includes(v.subtitleSize ?? 0)
      ? v.subtitleSize!
      : 24,
    subtitleColor: v.subtitleColor === "yellow" ? "yellow" : "white",
    subtitleBackground: v.subtitleBackground !== false,
    buffer: v.buffer === "generous" ? "generous" : "balanced",
    reduceMotion: v.reduceMotion === true,
    accent:
      v.accent === "violet" ? "violet" : v.accent === "rose" ? "rose" : "blue",
  };
}
export function getPreferences() {
  if (!memo) {
    try {
      memo = normalizePreferences(
        JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null"),
      );
    } catch {
      memo = DEFAULT_PREFERENCES;
    }
  }
  return memo;
}
function subscribe(cb: () => void) {
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
export function usePreferences() {
  return useSyncExternalStore(
    subscribe,
    getPreferences,
    () => DEFAULT_PREFERENCES,
  );
}
export function updatePreferences(patch: Partial<Preferences>) {
  const next = normalizePreferences({ ...getPreferences(), ...patch });
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
  memo = undefined;
  window.dispatchEvent(new Event(EVENT));
}
