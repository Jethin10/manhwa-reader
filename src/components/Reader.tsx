"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Chapter, PageImage as Page } from "@/lib/catalog";
import {
  getSavedPage,
  recordRead,
  saveProgress,
  readKey,
  setChaptersRead,
  updateReaderSettings,
  useReaderSettings,
  saveSeriesReaderSettings,
  clearSeriesReaderSettings,
  useSeriesReaderPreset,
  useSeriesMode,
  setSeriesMode,
  type ReaderSettings,
  type ReadingMode,
  type SavedSeries,
} from "@/lib/library";
import { queueDownloads, useDownloads } from "@/lib/downloads";
import { tapAction, tapOverlay, type TapAction } from "@/lib/tap-zones";
import {
  ChevronLeft,
  ChevronRight,
  ExpandIcon,
  ListIcon,
  PagesIcon,
  PagesVerticalIcon,
  SearchIcon,
  SlidersIcon,
  StripIcon,
} from "./Icons";
import { ReaderOptions, type ReaderSection } from "./PreferenceControls";
import { PagedViewer, type PagerItem } from "./reader/PagedViewer";
import { PageImage, RELOAD_PAGE } from "./reader/PageImage";
import { isWide, pageSize, usePageSizes } from "./reader/page-sizes";

type ChapterRef = Pick<Chapter, "id" | "number" | "title">;
type Version = Pick<Chapter, "id" | "group" | "pages">;
/** Chapter navigation, which streams in after the pages (it merges every source). */
export type ChapterNav = {
  chapters: ChapterRef[];
  versions: Version[];
  prev: ChapterRef | null;
  next: ChapterRef | null;
};
const NO_NAV: ChapterNav = { chapters: [], versions: [], prev: null, next: null };

const label = (c: { number: string | null; title?: string | null }) =>
  c.number ? `Chapter ${c.number}` : (c.title ?? "Oneshot");
const MODE_NAMES: Record<Exclude<ReadingMode, "auto">, string> = {
  ltr: "Left to right",
  rtl: "Right to left",
  vertical: "Vertical",
  webtoon: "Long strip",
  "webtoon-gaps": "Long strip with gaps",
};
const isStrip = (m: string) => m === "webtoon" || m === "webtoon-gaps";

/** Native Android shell bridge (MainActivity): volume keys are only taken while asked. */
type NativeBridge = { setVolumeKeys?: (on: boolean) => void };
const native = () =>
  (globalThis as { ManhwaNative?: NativeBridge }).ManhwaNative;

export function Reader({
  series,
  chapter,
  pages: sourcePages,
  nav: navPromise,
  links,
}: {
  series: SavedSeries;
  chapter: Chapter;
  pages: Page[];
  nav: Promise<ChapterNav>;
  /** Where chapter links and Back go; the offline reader keeps them inside Downloads. */
  links?: { chapter: (id: string) => string; back: string };
}) {
  const router = useRouter();
  // A downloaded chapter reads from the device, even when online.
  const downloads = useDownloads();
  const offlineCopy = downloads.saved[chapter.id];
  const downloadJob = downloads.jobs.find((j) => j.id === chapter.id);
  const pages = useMemo(
    () =>
      offlineCopy
        ? offlineCopy.pages.map((u) => ({ src: u, hd: u }))
        : sourcePages,
    [offlineCopy, sourcePages],
  );
  const globalSettings = useReaderSettings(series.id);
  const seriesMode = useSeriesMode(series.id);
  const settings = useMemo(
    () => ({ ...globalSettings, mode: seriesMode ?? globalSettings.mode }),
    [globalSettings, seriesMode],
  );
  const seriesPreset = useSeriesReaderPreset(series.id);
  const mode: Exclude<ReadingMode, "auto"> =
    settings.mode === "auto"
      ? series.type.toLowerCase() === "manga"
        ? "rtl"
        : "webtoon"
      : settings.mode;
  const strip = isStrip(mode);
  const rtl = mode === "rtl";
  const total = pages.length;

  const [nav, setNav] = useState<ChapterNav | null>(null);
  const [chrome, setChrome] = useState(true);
  const [sheet, setSheet] = useState<null | "chapters" | "settings">(null);
  const [tab, setTab] = useState<ReaderSection>("mode");
  const [current, setCurrent] = useState(0);
  // Which half of a split wide page is showing.
  const [sub, setSub] = useState<0 | 1>(0);
  const [transition, setTransition] = useState<null | "prev" | "next">(null);
  const [resumed, setResumed] = useState<number | null>(null);
  const [modeToast, setModeToast] = useState<string | null>(null);
  const [menuPage, setMenuPage] = useState<number | null>(null);
  const [showZones, setShowZones] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const progressStarted = useRef(false);
  const column = useRef<HTMLDivElement>(null);
  const anchor = useRef({ index: 0, offset: 0 });
  const scrollToPage = useCallback((page: number) => {
    const el = pageRefs.current[page];
    if (!el) return;
    anchor.current = { index: page, offset: 0 };
    window.scrollBy(0, el.getBoundingClientRect().top);
  }, []);
  const prevId = nav?.prev?.id ?? null;
  const nextId = nav?.next?.id ?? null;
  const href = useCallback(
    (id: string) => links?.chapter(id) ?? `/series/${series.id}/chapter/${id}`,
    [series.id, links],
  );
  const openChapter = useCallback(
    (id: string | null) => id && router.push(href(id)),
    [router, href],
  );

  useEffect(() => {
    let live = true;
    navPromise.then(
      (n) => live && setNav(n),
      () => live && setNav(NO_NAV),
    );
    return () => {
      live = false;
    };
  }, [navPromise]);

  // ----- paged layout -----
  // Spreads and splitting depend on page shapes, which arrive as pages load.
  const layoutBySize =
    !strip && (settings.spreads || settings.splitWide);
  const sizesVersion = usePageSizes(layoutBySize);
  const items = useMemo(() => {
    void sizesVersion;
    const list: PagerItem[] = [{ kind: "prev" }];
    for (let i = 0; i < total; ) {
      const wide = layoutBySize && isWide(pages[i].src);
      if (wide && settings.splitWide && !settings.spreads) {
        list.push(
          { kind: "pages", pages: [i], half: 0 },
          { kind: "pages", pages: [i], half: 1 },
        );
        i++;
        continue;
      }
      // A page that is already a spread stays alone.
      const pair =
        settings.spreads &&
        !(i === 0 && settings.spreadOffset) &&
        i + 1 < total &&
        !wide &&
        !isWide(pages[i + 1].src);
      list.push({ kind: "pages", pages: pair ? [i, i + 1] : [i] });
      i += pair ? 2 : 1;
    }
    list.push({ kind: "next" });
    return list;
  }, [
    total,
    pages,
    layoutBySize,
    sizesVersion,
    settings.spreads,
    settings.spreadOffset,
    settings.splitWide,
  ]);
  const itemIndex = transition
    ? transition === "prev"
      ? 0
      : items.length - 1
    : Math.max(
        1,
        items.findIndex(
          (x) =>
            x.kind === "pages" &&
            x.pages.includes(current) &&
            (x.half === undefined || x.half === sub),
        ),
      );

  const goTo = useCallback(
    (page: number) => {
      const target = Math.max(0, Math.min(total - 1, page));
      progressStarted.current = true;
      setTransition(null);
      setSub(0);
      setCurrent(target);
      if (strip) scrollToPage(target);
    },
    [strip, total, scrollToPage],
  );
  const turn = useCallback(
    (delta: number) => {
      if (strip) {
        window.scrollBy({
          top: delta * window.innerHeight * 0.85,
          behavior: settings.animate ? "smooth" : "instant",
        });
        return;
      }
      const target = items[itemIndex + delta];
      if (target?.kind === "pages") {
        progressStarted.current = true;
        setTransition(null);
        setCurrent(target.pages[0]);
        setSub(target.half ?? 0);
      } else if (target) setTransition(target.kind);
      else openChapter(delta > 0 ? nextId : prevId);
    },
    [strip, settings.animate, items, itemIndex, nextId, prevId, openChapter],
  );
  const onTap = useCallback(
    (action: TapAction) => {
      if (action === "menu") setChrome((c) => !c);
      else turn(action === "next" ? 1 : -1);
    },
    [turn],
  );
  const changeSettings = (patch: Partial<ReaderSettings>) => {
    if (patch.mode !== undefined) setSeriesMode(series.id, patch.mode);
    const rest = { ...patch };
    delete rest.mode;
    if (Object.keys(rest).length) {
      if (seriesPreset)
        saveSeriesReaderSettings(series.id, { ...globalSettings, ...rest });
      else updateReaderSettings(rest);
    }
  };

  // ----- open: history, resume, reading mode -----
  useEffect(() => {
    recordRead({
      ...series,
      chapterId: chapter.id,
      chapterNumber: chapter.number,
    });
  }, [series, chapter.id, chapter.number]);

  // Like Mihon, reopen a chapter where you left it. A finished chapter starts over.
  const resumeDone = useRef(false);
  useLayoutEffect(() => {
    if (resumeDone.current) return;
    resumeDone.current = true;
    const saved = getSavedPage(chapter.id);
    if (saved <= 0 || saved >= total - 1) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage once on mount
    setCurrent(saved);
    setResumed(saved);
    if (strip) scrollToPage(saved);
  }, [chapter.id, total, strip, scrollToPage]);
  useEffect(() => {
    if (resumed === null) return;
    const t = setTimeout(() => setResumed(null), 4000);
    return () => clearTimeout(t);
  }, [resumed]);

  // Name the reading mode on open and whenever it changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a timed toast
    setModeToast(MODE_NAMES[mode]);
    const t = setTimeout(() => setModeToast(null), 1400);
    return () => clearTimeout(t);
  }, [mode]);

  // ----- long strip -----
  useEffect(() => {
    if (!strip) return;
    // Entries only report pages whose visibility changed, so keep the whole set: the
    // current page is the first one in the top third of the screen.
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const page = Number((e.target as HTMLElement).dataset.pageIndex);
          // A page whose edge merely touches the area doesn't count.
          if (e.isIntersecting && e.intersectionRect.height > 1) visible.add(page);
          else visible.delete(page);
        }
        if (!visible.size) return;
        const page = Math.min(...visible);
        if (page > 0) progressStarted.current = true;
        setCurrent(page);
      },
      { rootMargin: "0px 0px -65% 0px", threshold: 0 },
    );
    pageRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [strip, total]);

  useEffect(() => {
    if (!strip) return;
    let last = window.scrollY;
    const scroll = () => {
      const y = window.scrollY;
      if (y - last > 8) {
        setChrome(false);
        setResumed(null);
      }
      last = y;
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, [strip]);

  const register = useCallback((i: number, el: HTMLDivElement | null) => {
    pageRefs.current[i] = el;
  }, []);

  // Scroll anchoring for the strip. Pages above the screen change height as they load
  // (and Safari has no native anchoring), so remember which page is at the top of the
  // screen and where; whenever the strip resizes, put that page back before it paints.
  useEffect(() => {
    const strip = column.current;
    if (!strip) return;
    let frame = 0;
    // Height the observer last settled. A different height means a page grew and the
    // observer hasn't put the anchor back yet, so reading positions now would record
    // the jump as if the reader had scrolled.
    let settled = strip.offsetHeight;
    const measure = () => {
      frame = 0;
      if (strip.offsetHeight !== settled) return;
      const refs = pageRefs.current;
      for (let i = 0; i < total; i++) {
        const top = refs[i]?.getBoundingClientRect();
        if (top && top.bottom > 0) {
          anchor.current = { index: i, offset: top.top };
          return;
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(() => {
      settled = strip.offsetHeight;
      const el = pageRefs.current[anchor.current.index];
      if (!el) return;
      const delta = el.getBoundingClientRect().top - anchor.current.offset;
      if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
    });
    ro.observe(strip);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [strip, total]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    if (!strip || sheet) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [strip, sheet]);

  // ----- progress and next-chapter preloading -----
  const preloaded = useRef<string | null>(null);
  useEffect(() => {
    if (progressStarted.current)
      saveProgress(
        series.id,
        chapter.id,
        total ? (current + 1) / total : 0,
        current,
      );
  }, [current, total, series.id, chapter.id]);
  // Reaching the last page (or the end-of-chapter card) marks the chapter read.
  useEffect(() => {
    if (
      total &&
      (transition === "next" ||
        (progressStarted.current && current >= total - 1))
    )
      setChaptersRead(series.id, [readKey(chapter)], true);
  }, [current, total, transition, series.id, chapter]);
  useEffect(() => {
    // Halfway through, fetch the next chapter so it opens instantly, as Mihon does.
    if (
      links ||
      !nextId ||
      preloaded.current === nextId ||
      current + 1 < total * 0.5
    )
      return;
    preloaded.current = nextId;
    router.prefetch(href(nextId));
    const count = Math.min(3, settings.preload);
    fetch(`/api/chapter/pages?id=${encodeURIComponent(nextId)}`)
      .then((r) => r.json() as Promise<{ pages: Page[] }>)
      .then(({ pages: next }) =>
        next.slice(0, count).forEach((p) => {
          const im = new Image();
          im.decoding = "async";
          im.src = p.src;
        }),
      )
      .catch(() => {});
  }, [current, total, nextId, router, href, settings.preload, links]);

  // ----- device integration -----
  useEffect(() => {
    if (!settings.keepAwake || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let disposed = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await navigator.wakeLock.request("screen");
        if (disposed) await result.release();
        else lock = result;
      } catch {
        /* Unsupported devices and low battery can deny the request. */
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      disposed = true;
      void lock?.release();
      document.removeEventListener("visibilitychange", acquire);
    };
  }, [settings.keepAwake]);

  // Volume keys come from the Android shell as "mr:volume" events (+1 is volume down).
  useEffect(() => {
    const bridge = native();
    bridge?.setVolumeKeys?.(settings.volumeKeys);
    if (!settings.volumeKeys) return;
    const onVolume = (e: Event) =>
      turn((e as CustomEvent<number>).detail * (settings.volumeInvert ? -1 : 1));
    window.addEventListener("mr:volume", onVolume);
    return () => {
      window.removeEventListener("mr:volume", onVolume);
      bridge?.setVolumeKeys?.(false);
    };
  }, [settings.volumeKeys, settings.volumeInvert, turn]);

  const [canFullscreen, setCanFullscreen] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability check
    setCanFullscreen(!!document.fullscreenEnabled);
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheet(null);
        setMenuPage(null);
        setShowZones(false);
        setChrome(true);
        return;
      }
      if (
        sheet ||
        menuPage !== null ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input,select,textarea,[contenteditable=true]"))
      )
        return;
      if (
        e.key === " " &&
        e.target instanceof HTMLElement &&
        e.target.closest("button,a")
      )
        return;
      let delta = 0;
      if (e.key === "ArrowRight") delta = rtl ? -1 : 1;
      if (e.key === "ArrowLeft") delta = rtl ? 1 : -1;
      if (["PageDown", " ", "ArrowDown"].includes(e.key)) delta = 1;
      if (["PageUp", "ArrowUp"].includes(e.key)) delta = -1;
      if (delta) {
        // Arrow keys scroll a long strip natively; only take over the page keys.
        if (strip && (e.key === "ArrowDown" || e.key === "ArrowUp")) return;
        e.preventDefault();
        if (e.shiftKey) openChapter(delta > 0 ? nextId : prevId);
        else turn(delta);
      }
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        goTo(e.key === "Home" ? 0 : total - 1);
      }
      if (e.key === "m" || e.key === "M") setChrome((c) => !c);
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [sheet, menuPage, rtl, strip, turn, goTo, total, nextId, prevId, openChapter]);

  // ----- strip gestures: tap zones and long press -----
  const press = useRef({
    x: 0,
    y: 0,
    timer: 0 as number | ReturnType<typeof setTimeout>,
    fired: false,
  });
  useEffect(() => {
    const p = press.current;
    return () => clearTimeout(p.timer);
  }, []);

  const renderTransition = (kind: "prev" | "next") => (
    <ChapterTransition
      kind={kind}
      chapter={chapter}
      target={nav ? (kind === "next" ? nav.next : nav.prev) : undefined}
      href={href}
      onReturn={() => goTo(kind === "next" ? total - 1 : 0)}
    />
  );
  const background = {
    black: "#000",
    gray: "#202020",
    white: "#fff",
    sepia: "#dbc7a4",
  }[settings.background];
  const bar =
    "fixed inset-x-0 z-50 transition-[transform,opacity] duration-300 ease-[var(--ease-apple)]";
  const round =
    "glass-bar grid size-12 shrink-0 place-items-center rounded-full text-white ring-1 ring-white/10 transition active:scale-95 disabled:opacity-30";
  const tool =
    "grid size-12 place-items-center rounded-full text-white/90 transition hover:bg-white/10 active:scale-95";
  // In RTL the slider runs right to left, so the chapter buttons swap sides too.
  const leftChapter = rtl ? nextId : prevId;
  const rightChapter = rtl ? prevId : nextId;

  return (
    <div
      data-reader
      data-reading-mode={mode}
      className="min-h-dvh select-none"
      style={{ background }}
    >
      <h1 className="sr-only">
        {series.title}, {label(chapter)}
      </h1>
      {strip ? (
        <div
          style={{ overflowAnchor: "none" }}
          onPointerDown={(e) => {
            const p = press.current;
            p.x = e.clientX;
            p.y = e.clientY;
            p.fired = false;
            clearTimeout(p.timer);
            if (!settings.longTap || e.pointerType === "mouse") return;
            p.timer = setTimeout(() => {
              const el = document
                .elementFromPoint(p.x, p.y)
                ?.closest<HTMLElement>("[data-page-index]");
              if (!el || el.dataset.end) return;
              p.fired = true;
              setMenuPage(Number(el.dataset.pageIndex));
            }, 500);
          }}
          onPointerMove={(e) => {
            const p = press.current;
            if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10)
              clearTimeout(p.timer);
          }}
          onPointerUp={() => clearTimeout(press.current.timer)}
          onPointerCancel={() => clearTimeout(press.current.timer)}
          onContextMenu={(e) => {
            if (!settings.longTap) return;
            e.preventDefault();
            // Mouse right-click opens the page menu too.
            const el = (e.target as HTMLElement).closest<HTMLElement>(
              "[data-page-index]",
            );
            if (el && !el.dataset.end && !press.current.fired)
              setMenuPage(Number(el.dataset.pageIndex));
          }}
          onClick={(e) => {
            const p = press.current;
            if (p.fired) {
              p.fired = false;
              return;
            }
            if (
              (e.target as HTMLElement).closest("button,a") ||
              Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12
            )
              return;
            onTap(
              tapAction(
                settings,
                e.clientX / window.innerWidth,
                e.clientY / window.innerHeight,
                false,
              ),
            );
          }}
        >
          <div
            className="mx-auto"
            style={{
              maxWidth: settings.width || undefined,
              paddingInline: `${settings.padding}%`,
            }}
          >
            <div
              ref={column}
              className="flex flex-col"
              style={{ gap: mode === "webtoon-gaps" ? 16 : 0 }}
            >
              {pages.map((page, i) => (
                <StripPage
                  key={page.src}
                  page={page}
                  index={i}
                  settings={settings}
                  register={register}
                />
              ))}
            </div>
          </div>
          <div
            ref={(el) => register(total, el)}
            data-page-index={Math.max(0, total - 1)}
            data-end="1"
            className="bg-[#111] pb-24"
          >
            {renderTransition("next")}
          </div>
        </div>
      ) : (
        <PagedViewer
          key={`${chapter.id}:${mode}`}
          pages={pages}
          items={items}
          index={itemIndex}
          axis={mode === "vertical" ? "y" : "x"}
          rtl={rtl}
          settings={settings}
          onTurn={turn}
          onTap={onTap}
          onLongPress={setMenuPage}
          renderTransition={renderTransition}
        />
      )}
      {settings.brightness < 100 && (
        <div
          className="pointer-events-none fixed inset-0 z-20 bg-black"
          style={{ opacity: 1 - settings.brightness / 100 }}
        />
      )}
      {settings.tint !== "none" && (
        <div
          className="pointer-events-none fixed inset-0 z-20"
          style={{
            background: { warm: "#ffb450", amber: "#ff7800", night: "#9b2525" }[
              settings.tint
            ],
            opacity: settings.tint === "night" ? 0.3 : 0.15,
            mixBlendMode: "multiply",
          }}
        />
      )}

      {/* Top bar */}
      <header
        inert={!chrome || !!sheet}
        className={`${bar} glass-bar top-0 pt-[var(--safe-top)] text-white ${chrome ? "translate-y-0" : "-translate-y-full"}`}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-2">
          <Link
            href={links?.back ?? `/series/${series.id}`}
            aria-label="Back to series"
            className={tool}
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{series.title}</p>
            <p className="truncate text-xs text-white/60">
              {label(chapter)}
              {chapter.title && chapter.number ? ` · ${chapter.title}` : ""}
            </p>
          </div>
          {!links && (
            <button
              aria-label={
                offlineCopy
                  ? "Downloaded"
                  : downloadJob
                    ? "Downloading"
                    : "Download chapter"
              }
              disabled={!!offlineCopy || !!downloadJob}
              onClick={() =>
                queueDownloads(series, [
                  { id: chapter.id, number: chapter.number, title: chapter.title },
                ])
              }
              className={`${tool} disabled:opacity-100`}
            >
              {offlineCopy ? (
                <svg viewBox="0 0 24 24" className="size-[22px] text-success" fill="currentColor">
                  <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.7 7.7-5.5 5.5a1 1 0 0 1-1.4 0l-2.5-2.5a1 1 0 1 1 1.4-1.4l1.8 1.8 4.8-4.8a1 1 0 1 1 1.4 1.4Z" />
                </svg>
              ) : downloadJob ? (
                <span className="size-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )}
        </div>
      </header>

      {!chrome && settings.pageNumber && total > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[max(var(--safe-bottom),10px)] text-center">
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium tabular-nums text-white">
            {current + 1} / {total}
          </span>
        </div>
      )}

      {/* Bottom bar, laid out like Mihon's: chapter buttons around the page slider, tools below */}
      <div
        inert={!chrome || !!sheet}
        className={`${bar} bottom-0 px-3 pb-[max(var(--safe-bottom),10px)] text-white ${chrome ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"}`}
      >
        <div className="mx-auto max-w-xl">
          <div className="flex items-center gap-2">
            <button
              aria-label={rtl ? "Next chapter" : "Previous chapter"}
              disabled={!leftChapter}
              onClick={() => openChapter(leftChapter)}
              className={round}
            >
              <ChevronLeft className="size-5" />
            </button>
            <div className="glass-bar flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full px-4 text-xs font-medium tabular-nums ring-1 ring-white/10">
              <span className="w-6 text-center">{rtl ? total : current + 1}</span>
              <input
                aria-label="Page"
                type="range"
                min={1}
                max={Math.max(1, total)}
                value={current + 1}
                dir={rtl ? "rtl" : "ltr"}
                onChange={(e) => goTo(Number(e.target.value) - 1)}
                className="h-7 w-full min-w-0 accent-white"
              />
              <span className="w-6 text-center">{rtl ? current + 1 : total}</span>
            </div>
            <button
              aria-label={rtl ? "Previous chapter" : "Next chapter"}
              disabled={!rightChapter}
              onClick={() => openChapter(rightChapter)}
              className={round}
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
          <nav
            aria-label="Reader tools"
            className="glass-bar mt-2 flex items-center justify-around rounded-full px-2 ring-1 ring-white/10"
          >
            <button
              aria-label="Chapters"
              onClick={() => setSheet("chapters")}
              className={tool}
            >
              <ListIcon className="size-5" />
            </button>
            <button
              aria-label={`Reading mode: ${MODE_NAMES[mode]}`}
              onClick={() => {
                setTab("mode");
                setSheet("settings");
              }}
              className={tool}
            >
              {strip ? (
                <StripIcon className="size-5" />
              ) : mode === "vertical" ? (
                <PagesVerticalIcon className="size-5" />
              ) : (
                <PagesIcon className="size-5" flip={rtl} />
              )}
            </button>
            {canFullscreen && (
              <button
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                aria-pressed={fullscreen}
                onClick={toggleFullscreen}
                className={tool}
              >
                <ExpandIcon className="size-5" />
              </button>
            )}
            <button
              aria-label="Reader settings"
              onClick={() => {
                setTab("general");
                setSheet("settings");
              }}
              className={tool}
            >
              <SlidersIcon className="size-5" />
            </button>
          </nav>
        </div>
      </div>

      {modeToast && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-1/2 z-40 -translate-y-1/2 text-center"
        >
          <span className="sheet-in inline-block rounded-full bg-black/75 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/10">
            {modeToast}
          </span>
        </div>
      )}
      {resumed !== null && (
        <div
          role="status"
          className={`fixed inset-x-0 z-50 flex justify-center px-4 transition-[bottom] duration-300 ${chrome ? "bottom-[calc(max(var(--safe-bottom),10px)+128px)]" : "bottom-[calc(max(var(--safe-bottom),10px)+40px)]"}`}
        >
          <div className="sheet-in flex items-center gap-3 rounded-full bg-[#2c2c2e] py-1.5 pr-1.5 pl-4 text-sm text-white shadow-xl ring-1 ring-white/10">
            <span>Resumed on page {resumed + 1}</span>
            <button
              onClick={() => {
                setResumed(null);
                goTo(0);
              }}
              className="rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-semibold"
            >
              Start over
            </button>
          </div>
        </div>
      )}
      {showZones && (
        <div
          className="fixed inset-0 z-[55] grid grid-cols-3 grid-rows-3"
          onClick={() => setShowZones(false)}
        >
          {tapOverlay(settings, rtl).map((action, i) => (
            <div
              key={i}
              className={`grid place-items-center border border-white/20 text-sm font-semibold text-white ${action === "menu" ? "bg-black/70" : action === "next" ? "bg-blue-900/70" : "bg-purple-900/70"}`}
            >
              {action === "menu"
                ? "Menu"
                : action === "next"
                  ? "Next"
                  : "Previous"}
            </div>
          ))}
        </div>
      )}
      {sheet === "chapters" && (
        <ChapterSheet
          chapters={nav?.chapters ?? null}
          currentId={chapter.id}
          onPick={(id) => {
            setSheet(null);
            if (id !== chapter.id) router.push(href(id));
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "settings" && (
        <Sheet title="Reader settings" onClose={() => setSheet(null)} light>
          <div
            role="tablist"
            className="mx-5 mb-3 grid grid-cols-3 rounded-[10px] bg-fill p-0.5 text-[13px] font-semibold"
          >
            {(
              [
                ["mode", "Reading mode"],
                ["general", "General"],
                ["filter", "Filter"],
              ] as const
            ).map(([id, name]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`h-8 rounded-[8px] transition ${tab === id ? "bg-white/20 text-white shadow" : "text-white/60"}`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="space-y-6 overflow-y-auto overscroll-contain px-5 pt-2 pb-6">
            <ReaderOptions
              settings={settings}
              onChange={changeSettings}
              section={tab}
              mode={mode}
            />
            {tab === "mode" && (
              <button
                onClick={() => {
                  setSheet(null);
                  setShowZones(true);
                }}
                className="w-full rounded-xl bg-fill px-4 py-3 text-sm"
              >
                Show tap zones
              </button>
            )}
            {tab === "general" && (
              <>
                {(nav?.versions.length ?? 0) > 1 && (
                  <div>
                    <p className="mb-2 text-xs text-secondary">
                      Copy of this chapter
                    </p>
                    <div className="grouped">
                      {nav!.versions.map((v) => (
                        <button
                          key={v.id}
                          onClick={() =>
                            v.id !== chapter.id && router.push(href(v.id))
                          }
                          className="row-divider flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm"
                        >
                          <span className="min-w-0 truncate">
                            {v.group ?? "Unknown group"}
                          </span>
                          <span
                            className={
                              v.id === chapter.id
                                ? "text-accent"
                                : "text-secondary"
                            }
                          >
                            {v.id === chapter.id ? "Reading" : "Open"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-xl bg-fill p-4">
                  <p className="text-sm">
                    {seriesPreset
                      ? "This series has its own settings."
                      : "Settings apply to every series."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => saveSeriesReaderSettings(series.id, settings)}
                      className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black"
                    >
                      {seriesPreset ? "Update for this series" : "Keep for this series"}
                    </button>
                    {(seriesPreset || seriesMode !== null) && (
                      <button
                        onClick={() => {
                          clearSeriesReaderSettings(series.id);
                          setSeriesMode(series.id, null);
                        }}
                        className="rounded-full bg-white/15 px-4 py-2 text-xs font-semibold"
                      >
                        Use defaults
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </Sheet>
      )}
      {menuPage !== null && pages[menuPage] && (
        <PageMenu
          page={pages[menuPage]}
          index={menuPage}
          name={`${series.title} - ${label(chapter)} - ${menuPage + 1}`}
          onClose={() => setMenuPage(null)}
        />
      )}
    </div>
  );
}

/** Mihon's chapter transition: what you finished, what comes next, and any gap between. */
function ChapterTransition({
  kind,
  chapter,
  target,
  href,
  onReturn,
}: {
  kind: "prev" | "next";
  chapter: Chapter;
  /** undefined while the chapter list is still loading. */
  target: ChapterRef | null | undefined;
  href: (id: string) => string;
  onReturn: () => void;
}) {
  const a = parseFloat(chapter.number ?? "");
  const b = parseFloat(target?.number ?? "");
  const gap =
    Number.isFinite(a) && Number.isFinite(b)
      ? Math.ceil(Math.abs(b - a)) - 1
      : 0;
  return (
    <div
      className="mx-auto max-w-sm px-8 py-20 text-center text-white"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold tracking-widest text-white/50 uppercase">
        {kind === "next" ? "Finished" : "Current"}
      </p>
      <p className="mt-1 text-[15px] text-white/80">{label(chapter)}</p>
      <p className="mt-6 text-xs font-semibold tracking-widest text-white/50 uppercase">
        {kind === "next" ? "Next" : "Previous"}
      </p>
      <h2 className="mt-1 text-2xl font-semibold">
        {target === undefined ? (
          <span className="inline-block size-5 animate-spin rounded-full border-2 border-white/20 border-t-white/80 align-middle" />
        ) : target ? (
          label(target)
        ) : kind === "next" ? (
          "You're all caught up"
        ) : (
          "This is the first chapter"
        )}
      </h2>
      {gap > 0 && (
        <p className="mt-3 rounded-xl bg-warning/15 px-3 py-2 text-[13px] text-warning">
          {gap === 1 ? "1 chapter is" : `${gap} chapters are`} missing on every
          source.
        </p>
      )}
      {target && (
        <Link
          href={href(target.id)}
          className="mt-6 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition active:scale-95"
        >
          {kind === "next" ? "Next chapter" : "Previous chapter"}
        </Link>
      )}
      <button
        className="mt-4 block w-full py-3 text-sm text-white/60"
        onClick={onReturn}
      >
        Back to this chapter
      </button>
    </div>
  );
}

/** One page of the long strip. It keeps its known shape while loading. */
const StripPage = memo(function StripPage({
  page,
  index,
  settings,
  register,
}: {
  page: Page;
  index: number;
  settings: ReaderSettings;
  register: (i: number, el: HTMLDivElement | null) => void;
}) {
  const [ratio, setRatio] = useState(() => {
    const s = pageSize(page.src);
    return s ? s[0] / s[1] : null;
  });
  const onSize = useCallback(
    (_: number, w: number, h: number) => setRatio(w / h),
    [],
  );
  return (
    <div
      ref={(node) => register(index, node)}
      data-page-index={index}
      className="relative w-full"
      style={{ aspectRatio: ratio ?? 2 / 3 }}
    >
      <PageImage
        page={page}
        index={index}
        settings={settings}
        load={index < settings.preload}
        lazyMargin={Math.max(1600, settings.preload * 1200)}
        onSize={onSize}
        className="block w-full"
      />
    </div>
  );
});

function Sheet({
  title,
  onClose,
  light,
  children,
}: {
  title: string;
  onClose: () => void;
  /** A light backdrop, so settings changes show on the page behind. */
  light?: boolean;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = dialog.current;
    // Focus the sheet itself: focusing a text field would pop up the phone's keyboard.
    el?.focus({ preventScroll: true });
    const controls = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          'button,input,select,a[href],[tabindex="0"]',
        ) ?? [],
      ).filter((node) => !node.hasAttribute("disabled"));
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = controls();
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    el?.addEventListener("keydown", trap);
    return () => {
      el?.removeEventListener("keydown", trap);
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      onClick={onClose}
    >
      <div className={`absolute inset-0 ${light ? "bg-black/25" : "bg-black/60"}`} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`sheet-in glass relative flex w-full flex-col overflow-hidden rounded-t-[24px] pb-[var(--safe-bottom)] text-white shadow-2xl ring-1 ring-white/10 outline-none sm:max-w-[480px] sm:rounded-[24px] ${light ? "max-h-[62dvh]" : "max-h-[85dvh]"}`}
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-white/25 sm:hidden" />
        <div className="flex items-center justify-between px-5 pt-3 pb-3">
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
  chapters: ChapterRef[] | null;
  currentId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = !chapters
    ? []
    : term
      ? chapters.filter(
          (c) =>
            (c.number ?? "") === term ||
            (c.number ?? "").startsWith(term) ||
            (c.title ?? "").toLowerCase().includes(term),
        )
      : chapters;
  const currentRef = useRef<HTMLButtonElement>(null);
  const loaded = !!chapters;
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, [loaded]);

  return (
    <Sheet title="Chapters" onClose={onClose}>
      <div className="px-5 pb-3">
        <label className="flex h-9 items-center gap-2 rounded-[10px] bg-fill px-3">
          <SearchIcon className="size-4 text-secondary" />
          <input
            aria-label="Find chapter"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            inputMode="decimal"
            enterKeyHint="search"
            placeholder="Chapter number or title"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-secondary"
          />
        </label>
      </div>
      <div className="overflow-y-auto overscroll-contain px-3 pb-4">
        {!chapters && (
          <p className="flex items-center gap-2 p-4 text-sm text-secondary">
            <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            Loading chapters from every source…
          </p>
        )}
        {chapters && !list.length && (
          <p className="p-4 text-sm text-secondary">No chapters found.</p>
        )}
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

/** Same-origin copy of a page, so it can be saved or shared from any source. */
function proxied(src: string, download?: string) {
  const base = src.startsWith("/api/img")
    ? src
    : `/api/img?u=${encodeURIComponent(src)}`;
  return download ? `${base}&dl=${encodeURIComponent(download)}` : base;
}

/** Mihon's long-press page actions. */
function PageMenu({
  page,
  index,
  name,
  onClose,
}: {
  page: Page;
  index: number;
  name: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState("");
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const file = name.replace(/[^\w .-]+/g, "").slice(0, 120);
  const share = async () => {
    setStatus("Preparing…");
    try {
      const blob = await (await fetch(proxied(page.src))).blob();
      const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const f = new File([blob], `${file}.${ext}`, { type: blob.type });
      if (navigator.canShare?.({ files: [f] }))
        await navigator.share({ files: [f], title: name });
      else await navigator.share({ title: name, url: location.href });
      onClose();
    } catch (e) {
      setStatus(
        e instanceof DOMException && e.name === "AbortError"
          ? ""
          : "Couldn't share this page.",
      );
    }
  };
  const row =
    "row-divider flex w-full items-center px-4 py-3.5 text-left text-[15px] transition hover:bg-white/[0.05] active:bg-white/[0.1]";
  return (
    <Sheet title={`Page ${index + 1}`} onClose={onClose}>
      <div className="px-4 pb-5">
        <div className="grouped">
          <a href={proxied(page.src, file)} download={file} onClick={onClose} className={row}>
            Save page
          </a>
          {canShare && (
            <button onClick={share} className={row}>
              Share page
            </button>
          )}
          <button
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent(RELOAD_PAGE, { detail: page.src }),
              );
              onClose();
            }}
            className={row}
          >
            Reload page
          </button>
        </div>
        {status && (
          <p className="mt-3 px-1 text-[13px] text-secondary" role="status">
            {status}
          </p>
        )}
      </div>
    </Sheet>
  );
}
