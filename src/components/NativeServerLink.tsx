"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const isNativeShell = () => navigator.userAgent.includes("ManhwaApp");

/** In the Android/iOS app, returns to the bundled connect screen to pick another server. */
export function NativeServerLink() {
  const native = useSyncExternalStore(subscribe, isNativeShell, () => false);
  if (!native) return null;
  return (
    <a
      href="https://localhost/?change=1"
      className="grouped t-callout mt-6 flex items-center justify-between px-4 py-3 transition-colors hover:bg-card-2"
    >
      <span>
        <span className="block">Server</span>
        <span className="t-footnote block text-secondary">{location.host}</span>
      </span>
      <span className="text-accent">Change</span>
    </a>
  );
}
