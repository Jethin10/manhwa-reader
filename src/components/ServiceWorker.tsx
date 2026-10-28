"use client";

import { useEffect } from "react";

/** Registers the offline/image-cache worker in production builds only; dev keeps fresh HMR. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
