import type { Metadata } from "next";
import { Suspense } from "react";
import { Downloads } from "@/components/Downloads";

export const metadata: Metadata = { title: "Downloads" };

// Fully static, so the service worker can keep it for offline reading.
export default function DownloadsPage() {
  return (
    <Suspense
      fallback={<div className="gutter mx-auto max-w-[860px] pt-12" aria-busy />}
    >
      <Downloads />
    </Suspense>
  );
}
