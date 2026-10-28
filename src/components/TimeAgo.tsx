"use client";

import { useSyncExternalStore } from "react";
import { timeAgo } from "@/lib/format";

const noop = () => () => {};

export function TimeAgo({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const text = useSyncExternalStore(
    noop,
    () => (iso ? timeAgo(iso) : ""),
    () =>
      iso
        ? new Date(iso).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "",
  );
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
