"use client";
import { useEffect } from "react";
import { usePreferences } from "@/lib/preferences";
export function PreferenceEffects() {
  const p = usePreferences();
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(p.reduceMotion);
    document.documentElement.style.setProperty(
      "--color-accent",
      p.accent === "violet" ? "#bf5af2" : p.accent === "rose" ? "#ff375f" : "#0a84ff",
    );
  }, [p.reduceMotion, p.accent]);
  return null;
}
