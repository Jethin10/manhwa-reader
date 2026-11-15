"use client";
import { useDownloads } from "@/lib/downloads";
import { useVideoDownloads } from "@/lib/video-downloads";

/**
 * Restores the chapter and episode download queues on every page, so downloads that were
 * running when the app closed carry on without opening Downloads first. Renders nothing.
 */
export function DownloadResumer() {
  useDownloads();
  useVideoDownloads();
  return null;
}
