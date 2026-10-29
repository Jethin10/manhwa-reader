"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chapter, PageImage } from "@/lib/catalog";
import { coverSrc, retryUrl } from "@/lib/images";
import {
  getSavedPage,
  recordRead,
  saveProgress,
  updateReaderSettings,
  useReaderSettings,
  saveSeriesReaderSettings,
  clearSeriesReaderSettings,
  useSeriesReaderPreset,
  type ReaderSettings,
  type SavedSeries,
} from "@/lib/library";
import { ChevronLeft, ChevronRight, ListIcon, SearchIcon } from "./Icons";
import { ReaderOptions } from "./PreferenceControls";

type ChapterRef = Pick<Chapter, "id" | "number" | "title">;
type Version = Pick<Chapter, "id" | "group" | "pages">;

const label = (c: { number: string | null; title?: string | null }) =>
  c.number ? `Chapter ${c.number}` : (c.title ?? "Oneshot");

export function Reader({
  series,
  chapter,
  chapters,
  versions,
  pages,
  prevId,
  nextId,
}: {
  series: SavedSeries;
  chapter: Chapter;
  chapters: ChapterRef[];
  versions: Version[];
  pages: PageImage[];
  prevId: string | null;
  nextId: string | null;
}) {
  const router = useRouter();
  const settings = useReaderSettings(series.id);
  const seriesPreset = useSeriesReaderPreset(series.id);
  const manga = series.type.toLowerCase() === "manga";
  const mode =
    settings.mode === "auto" ? (manga ? "single" : "scroll") : settings.mode;
  const direction =
    settings.direction === "auto"
      ? manga
        ? "rtl"
        : "ltr"
      : settings.direction;
  const [chrome, setChrome] = useState(true);
  const [sheet, setSheet] = useState<null | "chapters" | "settings">(null);
  const [current, setCurrent] = useState(0);
  const [resumeTo, setResumeTo] = useState<number | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const href = useCallback(
    (cid: string) => `/series/${series.id}/chapter/${cid}`,
    [series.id],
  );
  const nextChapter = chapters.find((c) => c.id === nextId);
  const total = pages.length;
  const groups = useMemo(() => {
    const result: number[][] = [];
    let i = 0;
    if (mode === "spread" && settings.spreadOffset && total) {
      result.push([0]);
      i = 1;
    }
    for (; i < total; i += mode === "spread" ? 2 : 1)
      result.push(mode === "spread" && i + 1 < total ? [i, i + 1] : [i]);
    return result;
  }, [mode, settings.spreadOffset, total]);
  const groupIndex = Math.max(
    0,
    groups.findIndex((g) => g.includes(current)),
  );
  const visiblePages = useMemo(
    () => groups[groupIndex] ?? [],
    [groups, groupIndex],
  );
  const progressStarted = useRef(false);
  const swipe = useRef({ x: 0, y: 0, skipClick: false });
  const goTo = useCallback(
    (index: number) => {
      progressStarted.current = true;
      const target = Math.max(0, Math.min(total - 1, index));
      if (mode === "scroll")
        pageRefs.current[target]?.scrollIntoView({ block: "start" });
      else {
        setCurrent(target);
        setChrome(true);
      }
    },
    [mode, total],
  );
  const turn = useCallback(
    (delta: number) => {
      const group = groups[groupIndex + delta];
      if (group) goTo(group[0]);
      else if (delta > 0 && nextId) router.push(href(nextId));
      else if (delta < 0 && prevId) router.push(href(prevId));
    },
    [groups, groupIndex, goTo, nextId, prevId, router, href],
  );
  const changeSettings = (patch: Partial<ReaderSettings>) =>
    seriesPreset
      ? saveSeriesReaderSettings(series.id, { ...settings, ...patch })
      : updateReaderSettings(patch);

  // History + resume prompt
  useEffect(() => {
    recordRead({
      ...series,
      chapterId: chapter.id,
      chapterNumber: chapter.number,
    });
    const saved = getSavedPage(chapter.id);
    if (!(saved > 0 && saved < total - 1)) return;
    const t = setTimeout(() => setResumeTo(saved), 500);
    return () => clearTimeout(t);
  }, [series, chapter.id, chapter.number, total]);

  // Chrome follows scroll direction; IntersectionObserver tracks pages without
  // measuring every image on every scroll frame.
  useEffect(() => {
    let lastY = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const nearEnd =
          y + window.innerHeight > document.documentElement.scrollHeight - 400;
        if (y < 80 || nearEnd) setChrome(true);
        else if (y > lastY + 8) setChrome(false);
        else if (y < lastY - 24) setChrome(true);
        lastY = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  useEffect(() => {
    if (mode !== "scroll") return;
    const active = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (entry.isIntersecting) active.add(index);
          else active.delete(index);
        }
        if (active.size) {
          const page = Math.max(...active);
          if (page > 0) progressStarted.current = true;
          setCurrent(page);
        }
      },
      { rootMargin: "-10% 0px -40% 0px", threshold: 0 },
    );
    pageRefs.current.slice(0, total).forEach((el, i) => {
      if (el) {
        el.dataset.pageIndex = String(i);
        observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, [mode, total, chapter.id]);
  const prefetched = useRef<string | null>(null);
  useEffect(() => {
    if (progressStarted.current)
      saveProgress(
        series.id,
        chapter.id,
        total ? (current + 1) / total : 0,
        current,
      );
    if (nextId && current >= total * 0.6 && prefetched.current !== nextId) {
      prefetched.current = nextId;
      router.prefetch(href(nextId));
    }
  }, [current, total, series.id, chapter.id, nextId, router, href]);
  useEffect(() => {
    if (mode === "scroll") return;
    const images = pages
      .slice(
        (visiblePages.at(-1) ?? current) + 1,
        (visiblePages.at(-1) ?? current) + 1 + settings.preload,
      )
      .map((page) => {
        const image = new Image();
        image.decoding = "async";
        image.src = page.src;
        return image;
      });
    return () => {
      images.forEach((image) => {
        image.src = "";
      });
    };
  }, [mode, current, pages, visiblePages, settings.preload]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheet(null);
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input,select,textarea,button,[contenteditable=true]")
      )
        return;
      if (sheet) return;
      if (mode !== "scroll" && !e.shiftKey) {
        if (
          [
            "ArrowLeft",
            "ArrowRight",
            "PageDown",
            "PageUp",
            " ",
            "Home",
            "End",
          ].includes(e.key)
        )
          e.preventDefault();
        if (e.key === "ArrowLeft") turn(direction === "rtl" ? 1 : -1);
        if (e.key === "ArrowRight") turn(direction === "rtl" ? -1 : 1);
        if (e.key === "PageDown" || e.key === " ") turn(1);
        if (e.key === "PageUp") turn(-1);
        if (e.key === "Home") goTo(0);
        if (e.key === "End") goTo(total - 1);
        return;
      }
      if (e.key === "ArrowLeft" && prevId) router.push(href(prevId));
      if (e.key === "ArrowRight" && nextId) router.push(href(nextId));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevId, nextId, router, href, sheet, mode, direction, turn, goTo, total]);

  const resume = () => {
    if (resumeTo == null) return;
    goTo(resumeTo);
    setResumeTo(null);
  };

  const progress = total ? (current + 1) / total : 0;

  return (
    <div
      data-reader
      data-reader-theme={settings.theme}
      data-reading-mode={mode}
      data-reading-direction={direction}
      className="min-h-screen"
      style={{
        background: {
          black: "#000",
          dim: "#181818",
          paper: "#f4f1e8",
          sepia: "#dbc7a4",
        }[settings.theme],
      }}
    >
      {/* Top bar */}
      <header
        className={`glass-bar fixed inset-x-0 top-0 z-50 pt-[var(--safe-top)] shadow-[inset_0_-0.5px_0_var(--color-hairline)] transition-transform duration-500 ease-[var(--ease-apple)] ${
          chrome ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-3 sm:px-5">
          <Link
            href={`/series/${series.id}`}
            aria-label="Back to series"
            className="grid size-9 shrink-0 place-items-center rounded-full text-label transition hover:bg-fill"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[13px] font-semibold">{series.title}</p>
            <p className="truncate text-[11px] text-secondary">
              {label(chapter)}
              {chapter.number && chapter.title ? ` · ${chapter.title}` : ""}
            </p>
          </div>
          <button
            aria-label="Reading settings"
            onClick={() => setSheet(sheet === "settings" ? null : "settings")}
            className="grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-label transition hover:bg-fill"
          >
            Aa
          </button>
        </div>
        <div className="h-[2px] bg-white/5">
          <div
            className="h-full bg-white/80 transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </header>

      {/* Pages */}
      {mode === "scroll" ? (
        <div
          onClick={() => {
            if (sheet) setSheet(null);
            else setChrome((c) => !c);
          }}
          className="mx-auto pt-14"
          style={{ maxWidth: settings.width ? `${settings.width}px` : "100%" }}
        >
          <div className="reader-copy px-5 pt-10 pb-8 text-center">
            <p className="text-[12px] font-semibold tracking-[0.12em] text-tertiary uppercase">
              {series.title}
            </p>
            <h1 className="display mt-2 text-[28px] font-bold">
              {label(chapter)}
            </h1>
            {chapter.number && chapter.title && (
              <p className="mt-1 text-[15px] text-secondary">{chapter.title}</p>
            )}
            <p className="mt-3 text-[12px] text-tertiary">
              {total} pages{chapter.group ? ` · ${chapter.group}` : ""}
            </p>
          </div>
          <div className={`flex flex-col ${settings.gap ? "gap-3" : ""}`}>
            {pages.map((p, i) => (
              <Page
                key={p.src}
                page={p}
                index={i}
                settings={settings}
                ref={(el) => {
                  pageRefs.current[i] = el;
                }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div
          className="mx-auto px-3 pt-20"
          style={{
            maxWidth: settings.width
              ? `${mode === "spread" ? Math.max(1040, settings.width) : settings.width}px`
              : "100%",
          }}
        >
          <h1 className="sr-only">{label(chapter)}</h1>
          <div className="reader-copy mb-3 flex items-center gap-3 text-xs">
            <span className="shrink-0">
              Page {visiblePages.map((i) => i + 1).join("–")} / {total}
            </span>
            <input
              type="range"
              min={1}
              max={Math.max(1, total)}
              value={current + 1}
              aria-label="Page position"
              onChange={(e) => goTo(Number(e.target.value) - 1)}
              className="w-full accent-[#a78bfa]"
            />
            <span className="shrink-0">{direction.toUpperCase()}</span>
          </div>
          <div
            className="flex min-h-[50svh] items-start justify-center"
            style={{ direction, touchAction: "pan-y pinch-zoom" }}
            onPointerDown={(e) => {
              swipe.current = { x: e.clientX, y: e.clientY, skipClick: false };
            }}
            onPointerUp={(e) => {
              const dx = e.clientX - swipe.current.x,
                dy = e.clientY - swipe.current.y;
              if (Math.abs(dx) > 50 && Math.abs(dy) < 60) {
                swipe.current.skipClick = true;
                turn((dx < 0 ? 1 : -1) * (direction === "rtl" ? -1 : 1));
              }
            }}
            onClick={(e) => {
              if (swipe.current.skipClick) {
                swipe.current.skipClick = false;
                return;
              }
              if (sheet) {
                setSheet(null);
                return;
              }
              const box = e.currentTarget.getBoundingClientRect();
              const x = (e.clientX - box.left) / box.width;
              if (settings.tapZones && (x < 0.28 || x > 0.72))
                turn((x > 0.72 ? 1 : -1) * (direction === "rtl" ? -1 : 1));
              else setChrome((c) => !c);
            }}
          >
            {visiblePages.map((i) => (
              <div key={pages[i].src} className="min-w-0 flex-1">
                <Page
                  page={pages[i]}
                  index={i}
                  settings={settings}
                  paged
                  ref={(el) => {
                    pageRefs.current[i] = el;
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* End of chapter */}
      {(mode === "scroll" || groupIndex === groups.length - 1) && (
        <div className="reader-copy mx-auto max-w-[720px] px-5 pt-16 pb-40">
          <p className="text-center text-[12px] font-semibold tracking-[0.12em] text-tertiary uppercase">
            End of {label(chapter)}
          </p>
          {nextChapter ? (
            <Link
              href={href(nextChapter.id)}
              className="group relative mt-6 block overflow-hidden rounded-[22px] ring-1 ring-white/10"
            >
              {series.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverSrc(series.cover, 640)}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 size-full scale-125 object-cover opacity-50 blur-3xl"
                />
              )}
              <div className="relative flex items-center gap-5 bg-black/30 p-5 sm:p-6">
                {series.cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverSrc(series.cover, 320)}
                    alt=""
                    className="aspect-[2/3] w-[72px] rounded-[10px] object-cover shadow-xl ring-1 ring-white/10"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-secondary">
                    Up Next
                  </p>
                  <p className="display mt-0.5 text-[22px] font-bold">
                    {label(nextChapter)}
                  </p>
                  {nextChapter.number && nextChapter.title && (
                    <p className="truncate text-[13px] text-secondary">
                      {nextChapter.title}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-black transition group-hover:bg-white/85">
                  Read
                </span>
              </div>
            </Link>
          ) : (
            <div className="mt-6 rounded-[22px] bg-card p-8 text-center ring-1 ring-white/[0.06]">
              <p className="display text-[20px] font-semibold">
                You&apos;re all caught up
              </p>
              <p className="mt-1 text-[14px] text-secondary">
                New chapters will appear here as soon as they&apos;re released.
              </p>
              <Link
                href={`/series/${series.id}`}
                className="mt-5 inline-block rounded-full bg-fill px-5 py-2.5 text-[14px] font-semibold transition hover:bg-fill-2"
              >
                Back to Series
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Bottom control pill */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 justify-center px-4 pb-[max(env(safe-area-inset-bottom),20px)] transition-all duration-500 ease-[var(--ease-apple)] ${
          chrome
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-24 opacity-0"
        }`}
      >
        {mode !== "scroll" && (
          <nav
            aria-label="Page navigation"
            className="glass flex items-center gap-3 rounded-full px-2 py-1 ring-1 ring-white/10"
          >
            <button
              aria-label="Previous page"
              onClick={() => turn(-1)}
              disabled={groupIndex === 0 && !prevId}
              className="rounded-full px-3 py-2 text-xs disabled:opacity-30"
            >
              Previous page
            </button>
            <span className="text-xs tabular-nums">
              {current + 1}/{total}
            </span>
            <button
              aria-label="Next page"
              onClick={() => turn(1)}
              disabled={groupIndex === groups.length - 1 && !nextId}
              className="rounded-full px-3 py-2 text-xs disabled:opacity-30"
            >
              Next page
            </button>
          </nav>
        )}
        <div className="glass flex items-center gap-1 rounded-full p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
          <PillLink
            href={prevId ? href(prevId) : null}
            label="Previous chapter"
          >
            <ChevronLeft className="size-5" />
          </PillLink>
          <button
            onClick={() => setSheet(sheet === "chapters" ? null : "chapters")}
            className="flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition hover:bg-fill"
          >
            <ListIcon className="size-4 text-secondary" />
            {label(chapter)}
            <span className="font-normal text-secondary tabular-nums">
              {current + 1}/{total}
            </span>
          </button>
          <PillLink href={nextId ? href(nextId) : null} label="Next chapter">
            <ChevronRight className="size-5" />
          </PillLink>
        </div>
      </div>

      {/* Resume toast */}
      {resumeTo != null && (
        <div className="sheet-in fixed inset-x-0 top-20 z-50 flex justify-center px-4">
          <div className="glass flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-5 text-[14px] shadow-2xl ring-1 ring-white/10">
            <span>Continue from page {resumeTo + 1}?</span>
            <button
              onClick={resume}
              className="rounded-full bg-white px-4 py-1.5 font-semibold text-black"
            >
              Resume
            </button>
            <button
              onClick={() => setResumeTo(null)}
              className="rounded-full px-3 py-1.5 text-secondary hover:text-label"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {sheet === "chapters" && (
        <ChapterSheet
          chapters={chapters}
          currentId={chapter.id}
          onPick={(id) => {
            setSheet(null);
            router.push(href(id));
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "settings" && (
        <SettingsSheet
          settings={settings}
          onChange={changeSettings}
          onSaveSeries={() => saveSeriesReaderSettings(series.id, settings)}
          onClearSeries={() => clearSeriesReaderSettings(series.id)}
          seriesPreset={seriesPreset}
          versions={versions}
          currentId={chapter.id}
          onPickVersion={(id) => router.push(href(id))}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

function PillLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const cls = "grid size-10 place-items-center rounded-full transition";
  if (!href)
    return (
      <span aria-label={label} className={`${cls} text-white/20`}>
        {children}
      </span>
    );
  return (
    <Link
      href={href}
      aria-label={label}
      className={`${cls} text-label hover:bg-fill`}
    >
      {children}
    </Link>
  );
}

// ---------- Page ----------

function Page({
  page,
  index,
  settings,
  paged = false,
  ref,
}: {
  page: PageImage;
  index: number;
  settings: ReaderSettings;
  paged?: boolean;
  ref: (el: HTMLDivElement | null) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(paged || index < settings.preload);
  const [loaded, setLoaded] = useState(false);
  const [natural, setNatural] = useState(0);
  const [naturalHeight, setNaturalHeight] = useState(0);
  const [hdFailed, setHdFailed] = useState(false);
  const [hdReady, setHdReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  // Start loading well before the page scrolls into view
  useEffect(() => {
    if (visible || !box.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: `${settings.preload * 1200}px 0px` },
    );
    io.observe(box.current);
    return () => io.disconnect();
  }, [visible, settings.preload]);

  // Upgrade to the sharpened HD render only when the original is smaller than the device pixels we're drawing
  const wantsHd = useMemo(() => {
    if (
      !settings.hd ||
      hdFailed ||
      !loaded ||
      !natural ||
      typeof window === "undefined"
    )
      return false;
    const cssWidth = Math.min(
      settings.width || window.innerWidth,
      window.innerWidth,
    );
    return natural < cssWidth * window.devicePixelRatio * 0.9;
  }, [settings.hd, settings.width, loaded, natural, hdFailed]);

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

  const src =
    wantsHd && hdReady
      ? page.hd
      : attempt
        ? retryUrl(page.src, attempt)
        : page.src;

  return (
    <div
      ref={(el) => {
        box.current = el;
        ref(el);
      }}
      className={`relative w-full ${loaded ? "" : "aspect-[2/3] bg-[#0b0b0c]"}`}
      style={
        paged
          ? undefined
          : {
              contentVisibility: "auto",
              aspectRatio:
                natural && naturalHeight
                  ? `${natural} / ${naturalHeight}`
                  : undefined,
            }
      }
    >
      {failed ? (
        <div className="absolute inset-0 grid place-items-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFailed(false);
              setAttempt((a) => a + 1);
            }}
            className="rounded-full bg-fill px-5 py-2.5 text-[14px] font-medium transition hover:bg-fill-2"
          >
            Couldn&apos;t load page {index + 1}. Tap to retry
          </button>
        </div>
      ) : (
        visible && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`Page ${index + 1}`}
            decoding="async"
            fetchPriority={index < 2 ? "high" : "auto"}
            draggable={false}
            ref={(el) => {
              // Pages rendered on the server may finish loading before hydration attaches onLoad
              if (el?.complete && el.naturalWidth) {
                const w = el.naturalWidth;
                setLoaded(true);
                setNatural((n) => n || w);
                setNaturalHeight((h) => h || el.naturalHeight);
              }
            }}
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth;
              setLoaded(true);
              setNatural((n) => n || w);
              const imageHeight = e.currentTarget.naturalHeight;
              setNaturalHeight((h) => h || imageHeight);
            }}
            onError={() => {
              if (hdReady) {
                setHdFailed(true);
                setHdReady(false);
              } else if (attempt < 2) setAttempt((a) => a + 1);
              else setFailed(true);
            }}
            style={{
              filter: `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`,
              ...(paged && settings.fit === "height"
                ? {
                    maxHeight: "calc(100svh - 190px)",
                    width: "auto",
                    maxWidth: "100%",
                    marginInline: "auto",
                    objectFit: "contain" as const,
                  }
                : {}),
            }}
            className={`page-img block w-full transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        )
      )}
      {!loaded && !failed && (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6 animate-spin text-white/40"
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

// ---------- Sheets ----------

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="sheet-in glass relative flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-[24px] shadow-2xl ring-1 ring-white/10 sm:max-w-[440px] sm:rounded-[24px]"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="display text-[17px] font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-[15px] font-semibold text-accent"
          >
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ChapterSheet({
  chapters,
  currentId,
  onPick,
  onClose,
}: {
  chapters: ChapterRef[];
  currentId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = q.trim()
    ? chapters.filter(
        (c) =>
          (c.number ?? "").includes(q.trim()) ||
          (c.title ?? "").toLowerCase().includes(q.toLowerCase()),
      )
    : chapters;
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => currentRef.current?.scrollIntoView({ block: "center" }), []);

  return (
    <Sheet title="Chapters" onClose={onClose}>
      <div className="px-5 pb-3">
        <label className="flex h-9 items-center gap-2 rounded-[10px] bg-fill px-3">
          <SearchIcon className="size-4 text-secondary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chapter number or title"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-secondary"
          />
        </label>
      </div>
      <div className="overflow-y-auto px-3 pb-4">
        {list.map((c) => {
          const active = c.id === currentId;
          return (
            <button
              key={c.id}
              ref={active ? currentRef : undefined}
              onClick={() => onPick(c.id)}
              className={`flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-left transition ${
                active ? "bg-white/[0.12]" : "hover:bg-fill"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-medium">
                  {label(c)}
                </span>
                {c.number && c.title && (
                  <span className="block truncate text-[12px] text-secondary">
                    {c.title}
                  </span>
                )}
              </span>
              {active && (
                <span className="text-[12px] font-semibold text-accent">
                  Reading
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function SettingsSheet({
  settings,
  versions,
  currentId,
  onPickVersion,
  onClose,
  onChange,
  onSaveSeries,
  onClearSeries,
  seriesPreset,
}: {
  settings: ReaderSettings;
  versions: Version[];
  currentId: string;
  onPickVersion: (id: string) => void;
  onClose: () => void;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onSaveSeries: () => void;
  onClearSeries: () => void;
  seriesPreset: boolean;
}) {
  return (
    <Sheet title="Reading settings" onClose={onClose}>
      <div className="space-y-6 overflow-y-auto px-5 pt-2 pb-6">
        <ReaderOptions settings={settings} onChange={onChange} />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onSaveSeries}
            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black"
          >
            {seriesPreset ? "Update series preset" : "Save for this series"}
          </button>
          {seriesPreset && (
            <button
              onClick={onClearSeries}
              className="rounded-full bg-fill px-4 py-2 text-xs"
            >
              Use global defaults
            </button>
          )}
        </div>
        {versions.length > 1 && (
          <div>
            <p className="mb-2 text-xs text-secondary">Translation</p>
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => v.id !== currentId && onPickVersion(v.id)}
                className="flex w-full justify-between rounded-lg bg-fill px-3 py-3 text-left text-sm"
              >
                <span>{v.group ?? "Unknown group"}</span>
                <span className="text-secondary">
                  {v.id === currentId ? "Selected" : "Choose"}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="text-xs leading-5 text-secondary">
          Paged mode: arrow keys turn pages; Shift + arrows switch chapters. Tap
          the center to hide controls. Pinch to zoom on touch screens.
        </p>
      </div>
    </Sheet>
  );
}
