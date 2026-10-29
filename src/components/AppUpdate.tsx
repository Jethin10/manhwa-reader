"use client";

import { useEffect, useState } from "react";

const REPO = "Jethin10/manhwa-reader";
const CHECKED = "manhwa:update-check";

type Release = { version: string; url: string };

// "1.0.12" > "1.0.9"
function newer(a: string, b: string) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  }
  return false;
}

async function latestRelease(): Promise<Release | null> {
  const cached = sessionStorage.getItem(CHECKED);
  if (cached) return JSON.parse(cached);
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (!res.ok) return null;
  const data = await res.json();
  const apk = (data.assets as { name: string; browser_download_url: string }[]).find((a) =>
    a.name.endsWith(".apk"),
  );
  const release = apk ? { version: String(data.tag_name).replace(/^v/, ""), url: apk.browser_download_url } : null;
  sessionStorage.setItem(CHECKED, JSON.stringify(release));
  return release;
}

/**
 * Keeps installs current. The web app updates itself: pages are network-first and the
 * service worker is re-checked whenever the app comes back to the foreground. The Android
 * shell reports its version in the user agent ("ManhwaApp/1.0.12"); when GitHub has a newer
 * APK, this offers it. The shell hands the download to the system browser.
 */
export function AppUpdate() {
  const [update, setUpdate] = useState<Release | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let reg: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((r) => (reg = r))
      .catch(() => {});
    const check = () => document.visibilityState === "visible" && reg?.update().catch(() => {});
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  useEffect(() => {
    const installed = navigator.userAgent.match(/ManhwaApp\/(\d+(?:\.\d+)*)/)?.[1];
    if (!installed) return;
    latestRelease()
      .then((r) => r && newer(r.version, installed) && setUpdate(r))
      .catch(() => {});
  }, []);

  if (!update) return null;
  return (
    <div
      role="status"
      className="site-chrome glass fixed inset-x-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 shadow-lg"
      style={{ bottom: "calc(var(--tabbar-h) + 12px)" }}
    >
      <span className="flex-1 text-[15px] leading-5">
        <span className="block font-semibold">Update available</span>
        <span className="block text-[13px] text-secondary">Version {update.version} is ready to install.</span>
      </span>
      <button type="button" className="pressable px-2 text-[15px] text-secondary" onClick={() => setUpdate(null)}>
        Later
      </button>
      <a href={update.url} className="pressable rounded-full bg-accent px-4 py-1.5 text-[15px] font-semibold text-white">
        Update
      </a>
    </div>
  );
}
