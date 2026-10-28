"use client";
import { useEffect } from "react";
import { usePreferences } from "@/lib/preferences";
export function PreferenceEffects() {
  const p = usePreferences();
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(p.reduceMotion);
    document.documentElement.style.setProperty(
      "--color-accent",
      p.accent === "blue"
        ? "#64a9ff"
        : p.accent === "rose"
          ? "#f48ca9"
          : "#a78bfa",
    );
  }, [p.reduceMotion, p.accent]);
  return null;
}
