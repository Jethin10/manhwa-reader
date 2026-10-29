"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PageImage as Page } from "@/lib/catalog";
import { retryUrl } from "@/lib/images";
import type { ReaderSettings } from "@/lib/library";

export function pageFilter(s: ReaderSettings) {
  const parts = [];
  if (s.brightness > 100) parts.push(`brightness(${s.brightness}%)`);
  if (s.contrast !== 100) parts.push(`contrast(${s.contrast}%)`);
  if (s.grayscale) parts.push("grayscale(1)");
  if (s.invert) parts.push("invert(1)");
  return parts.join(" ") || undefined;
}

/**
 * One page image: loads when asked (or when near the viewport), retries quietly, upgrades
 * to the sharpened HD copy when the screen has more pixels than the original, and reports
 * its natural size so viewers can lay pages out before they finish loading.
 */
export function PageImage({
  page,
  index,
  settings,
  load,
  lazyMargin,
  className = "",
  style,
  onSize,
}: {
  page: Page;
  index: number;
  settings: ReaderSettings;
  /** Load now, regardless of position. */
  load?: boolean;
  /** Start loading this far (px) before the image scrolls into view. */
  lazyMargin?: number;
  className?: string;
  style?: React.CSSProperties;
  onSize?: (index: number, w: number, h: number) => void;
}) {
  const ref = useRef<HTMLImageElement | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(retryTimer.current), []);
  const [near, setNear] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [natural, setNatural] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [hdReady, setHdReady] = useState(false);
  const [hdFailed, setHdFailed] = useState(false);
  const active = load || near;

  useEffect(() => {
    if (load || near || lazyMargin === undefined || !ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: `${lazyMargin}px 0px` },
    );
    io.observe(ref.current.parentElement ?? ref.current);
    return () => io.disconnect();
  }, [load, near, lazyMargin]);

  // Only fetch the HD copy when the original is smaller than the device pixels it fills.
  const wantsHd = useMemo(() => {
    if (!settings.hd || hdFailed || !loaded || !natural || page.hd === page.src)
      return false;
    if (typeof window === "undefined") return false;
    return natural < window.innerWidth * window.devicePixelRatio * 0.9;
  }, [settings.hd, hdFailed, loaded, natural, page.hd, page.src]);

  useEffect(() => {
    if (!wantsHd || hdReady) return;
    const im = new Image();
    im.decoding = "async";
    im.src = page.hd;
    let cancelled = false;
    im.decode().then(
      () => !cancelled && setHdReady(true),
      () => !cancelled && setHdFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [wantsHd, hdReady, page.hd]);

  const done = (el: HTMLImageElement) => {
    setLoaded(true);
    if (!natural) {
      setNatural(el.naturalWidth);
      onSize?.(index, el.naturalWidth, el.naturalHeight);
    }
  };

  if (failed)
    return (
      <div
        className={`grid min-h-40 place-items-center ${className}`}
        style={style}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setFailed(false);
            setAttempt((a) => a + 1);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="rounded-full bg-black/80 px-5 py-2.5 text-[14px] font-medium text-white ring-1 ring-white/20 backdrop-blur"
        >
          Couldn&apos;t load page {index + 1} · Retry
        </button>
      </div>
    );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={(el) => {
        ref.current = el;
        // Pages rendered on the server can finish before hydration attaches onLoad.
        if (el?.complete && el.naturalWidth && !loaded) done(el);
      }}
      src={
        active
          ? wantsHd && hdReady
            ? page.hd
            : attempt
              ? retryUrl(page.src, attempt)
              : page.src
          : undefined
      }
      alt={`Page ${index + 1}`}
      decoding="async"
      draggable={false}
      fetchPriority={index < 2 ? "high" : "auto"}
      onLoad={(e) => done(e.currentTarget)}
      onError={() => {
        if (hdReady) {
          setHdReady(false);
          setHdFailed(true);
        } else if (attempt < 2)
          retryTimer.current = setTimeout(
            () => setAttempt((a) => a + 1),
            600 * (attempt + 1),
          );
        else setFailed(true);
      }}
      className={`select-none transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
      style={{
        filter: pageFilter(settings),
        WebkitTouchCallout: "none",
        ...style,
      }}
    />
  );
}

export function Spinner({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`animate-spin text-white/40 ${className}`}
      aria-label="Loading"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x="11"
          y="2"
          width="2"
          height="6"
          rx="1"
          fill="currentColor"
          opacity={(i + 1) / 8}
          transform={`rotate(${i * 45} 12 12)`}
        />
      ))}
    </svg>
  );
}
