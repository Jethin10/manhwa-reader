"use client";

/**
 * Keeps downloads (chapters, anime episodes) going through the things that used to stop
 * them: the app going to the background, the screen turning off, a dropped connection, or
 * the app being reloaded.
 *
 * - A failure caused by the network or a timeout puts the job back in line instead of
 *   failing it; work continues when the page is visible and online again.
 * - In the Android app, the native shell keeps the app alive with a foreground service while
 *   any download runs (MovieDownloadService), so work carries on with the screen off.
 */

export const MAX_TRANSIENT_RETRIES = 8;

/** True for errors that say nothing about the download itself: offline, timeout, 5xx, 429. */
export function isTransient(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  // AbortError here means the browser cancelled the request (the page was reloaded, left
  // or frozen); callers have already ruled out their own pause/cancel signal.
  if (error instanceof DOMException)
    return ["TimeoutError", "NetworkError", "AbortError"].includes(error.name);
  if (error instanceof TypeError) return true; // fetch: "Failed to fetch" / "network error"
  if (error instanceof Error)
    return /HTTP (5\d\d|429)|timed? ?out|network|connection|returned HTTP 5/i.test(
      error.message,
    );
  return false;
}

/** Resolves once the page is visible and online (immediately if it already is). */
export function whenResumable(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const ready = () => document.visibilityState === "visible" && navigator.onLine;
  // In the Android app the native service keeps the app running while hidden, so a hidden
  // page there can keep working; only being offline waits.
  if (ready() || (nativeKeepAlive() && navigator.onLine)) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (!ready() && !(nativeKeepAlive() && navigator.onLine)) return;
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
      resolve();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    window.addEventListener("focus", check);
  });
}

/** Waits `ms`, but no longer than until the page comes back after being hidden. */
export function backoff(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", early);
      window.removeEventListener("online", early);
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const early = () => {
      if (document.visibilityState === "visible" && navigator.onLine) done();
    };
    const abort = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", early);
      window.removeEventListener("online", early);
      reject(signal?.reason);
    };
    const timer = setTimeout(done, ms);
    document.addEventListener("visibilitychange", early);
    window.addEventListener("online", early);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Calls `resume` whenever the page comes back (visible again, back online, restored). */
export function onPageReturn(resume: () => void) {
  if (typeof window === "undefined") return;
  const run = () => {
    if (document.visibilityState === "visible" || navigator.onLine) resume();
  };
  document.addEventListener("visibilitychange", run);
  window.addEventListener("online", run);
  window.addEventListener("pageshow", run);
}

// ---------- the Android app's keep-alive service ----------

type Native = { setBackgroundWork?: (key: string, label: string) => void };
const active = new Map<string, string>();

function native(): Native | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ManhwaNative?: Native }).ManhwaNative ?? null;
}
function nativeKeepAlive() {
  return !!native()?.setBackgroundWork && active.size > 0;
}

/**
 * Tells the Android app that a kind of download is running (label shows in the
 * notification), or has stopped (empty label). No-op on the web.
 */
export function backgroundWork(key: string, label: string) {
  if (label) active.set(key, label);
  else active.delete(key);
  try {
    native()?.setBackgroundWork?.(key, label);
  } catch {
    /* The app keeps working in the foreground regardless. */
  }
}
