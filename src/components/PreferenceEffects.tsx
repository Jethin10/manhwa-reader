"use client";
import { useEffect } from "react";
import { usePreferences } from "@/lib/preferences";
export const ACCENTS = {
  kairo: "#f5f5f7",
  violet: "#bf5af2",
  rose: "#ff375f",
  sky: "#0a84ff",
} as const;

export function PreferenceEffects() {
  const p = usePreferences();
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(p.reduceMotion);
    document.documentElement.style.setProperty(
      "--color-accent",
      ACCENTS[p.accent],
    );
    // Black text on the white Kairo accent, white on the coloured ones.
    document.documentElement.style.setProperty(
      "--on-accent",
      p.accent === "kairo" ? "#000000" : "#ffffff",
    );
  }, [p.reduceMotion, p.accent]);
  return null;
}
