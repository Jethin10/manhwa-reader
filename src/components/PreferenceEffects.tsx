"use client";
import { useEffect } from "react";
import { usePreferences } from "@/lib/preferences";
export const ACCENTS = {
  kairo: "#f2c14e",
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
    // Dark text on the gold, white on the deeper accents.
    document.documentElement.style.setProperty(
      "--on-accent",
      p.accent === "kairo" ? "#1a1405" : "#ffffff",
    );
  }, [p.reduceMotion, p.accent]);
  return null;
}
