"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useDownloads, type DownloadedChapter } from "@/lib/downloads";
import type { Chapter } from "@/lib/catalog";
import { Reader, type ChapterNav } from "./Reader";
import { useVideoDownloads } from "@/lib/video-downloads";
import { OfflineVideo } from "./VideoDownloads";
import { DownloadLibrary } from "./DownloadLibrary";

const num = (c: { number: string | null }) => {
  const n = parseFloat(c.number ?? "");
  return Number.isFinite(n) ? n : -1;
};
/** Downloaded chapters, the download queue, and the offline reader (?read=<chapter id>). */
export function Downloads() {
  const params = useSearchParams();
  const read = params.get("read"),
    video = params.get("video");
  const { saved, jobs } = useDownloads();
  const videoDownloads = useVideoDownloads();
  if (video) return <OfflineVideo key={video} id={video} />;
  if (read) {
    const copy = saved[read];
    return copy ? (
      <OfflineReader copy={copy} saved={saved} />
    ) : (
      <div className="gutter mx-auto max-w-md py-28 text-center">
        <h1 className="t-title2">This chapter isn&apos;t downloaded</h1>
        <p className="t-callout mt-2 text-secondary">
          It may have been deleted. Your other downloads are still here.
        </p>
        <Link href="/downloads" className="btn btn-primary mt-8">
          Show downloads
        </Link>
      </div>
    );
  }
  return (
    <DownloadLibrary
      saved={saved}
      jobs={jobs}
      videos={videoDownloads.saved}
      videoJobs={videoDownloads.jobs}
      tab={params.get("tab")}
      open={params.get("open")}
    />
  );
}

function OfflineReader({
  copy,
  saved,
}: {
  copy: DownloadedChapter;
  saved: Record<string, DownloadedChapter>;
}) {
  // Navigation stays among this series' downloaded chapters, so it works offline.
  const nav = useMemo(() => {
    const list = Object.values(saved)
      .filter((d) => d.series.id === copy.series.id)
      .sort((a, b) => num(b) - num(a))
      .map((d) => ({ id: d.id, number: d.number, title: d.title }));
    const at = list.findIndex((c) => c.id === copy.id);
    return Promise.resolve<ChapterNav>({
      chapters: list,
      versions: [],
      next: at > 0 ? list[at - 1] : null,
      prev: at >= 0 && at < list.length - 1 ? list[at + 1] : null,
    });
    // The list only matters per chapter; a download finishing elsewhere shouldn't reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy.id]);
  const chapter: Chapter = {
    id: copy.id,
    number: copy.number,
    title: copy.title,
    volume: null,
    pages: copy.pages.length,
    externalUrl: null,
    readableAt: "",
    group: null,
  };
  const links = useMemo(
    () => ({
      chapter: (id: string) => `/downloads?read=${encodeURIComponent(id)}`,
      back: "/downloads",
    }),
    [],
  );
  return (
    <Reader
      key={copy.id}
      series={copy.series}
      chapter={chapter}
      pages={copy.pages.map((u) => ({ src: u, hd: u }))}
      nav={nav}
      links={links}
    />
  );
}
