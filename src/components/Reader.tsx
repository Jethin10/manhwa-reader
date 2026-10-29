"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chapter, PageImage as Page } from "@/lib/catalog";
import {
  getSavedPage,
  recordRead,
  saveProgress,
  updateReaderSettings,
  useReaderSettings,
  saveSeriesReaderSettings,
  clearSeriesReaderSettings,
  useSeriesReaderPreset,
  useSeriesMode,
  setSeriesMode,
  type ReaderSettings,
  type SavedSeries,
} from "@/lib/library";
import { tapAction, tapOverlay, type TapAction } from "@/lib/tap-zones";
import {
  ChevronLeft,
  ChevronRight,
  ListIcon,
  SearchIcon,
  SlidersIcon,
} from "./Icons";
import { ReaderOptions } from "./PreferenceControls";
import { PagedViewer, type PagerItem } from "./reader/PagedViewer";
import { PageImage } from "./reader/PageImage";

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
  pages: Page[];
  prevId: string | null;
  nextId: string | null;
}) {
  const router = useRouter();
  const globalSettings = useReaderSettings(series.id);
  const seriesMode = useSeriesMode(series.id);
  const settings = useMemo(
    () => ({ ...globalSettings, mode: seriesMode ?? globalSettings.mode }),
    [globalSettings, seriesMode],
  );
  const seriesPreset = useSeriesReaderPreset(series.id);
  const mode =
    settings.mode === "auto"
      ? series.type.toLowerCase() === "manga"
        ? "rtl"
        : "webtoon"
      : settings.mode;
  const strip = mode === "webtoon" || mode === "webtoon-gaps";
  const rtl = mode === "rtl";
  const [chrome, setChrome] = useState(true);
  const [sheet, setSheet] = useState<null | "chapters" | "settings">(null);
  const [current, setCurrent] = useState(0);
  const [transition, setTransition] = useState<null | "prev" | "next">(null);
  const [resumeTo, setResumeTo] = useState<number | null>(null);
  const [showZones, setShowZones] = useState(false);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const progressStarted = useRef(false);
  const total = pages.length;
  const href = useCallback(
    (id: string) => `/series/${series.id}/chapter/${id}`,
    [series.id],
  );
  const items = useMemo(() => {
    const list: PagerItem[] = [{ kind: "prev" }];
    for (let i = 0; i < total;) {
      const count =
        settings.spreads && !(i === 0 && settings.spreadOffset) && i + 1 < total
          ? 2
          : 1;
      list.push({
        kind: "pages",
        pages: Array.from({ length: count }, (_, k) => i + k),
      });
      i += count;
    }
    list.push({ kind: "next" });
    return list;
  }, [total, settings.spreads, settings.spreadOffset]);
  const itemIndex = transition
    ? transition === "prev"
      ? 0
      : items.length - 1
    : Math.max(
        1,
        items.findIndex((x) => x.kind === "pages" && x.pages.includes(current)),
      );
  const goTo = useCallback(
    (page: number) => {
      const target = Math.max(0, Math.min(total - 1, page));
      progressStarted.current = true;
      setTransition(null);
      setCurrent(target);
      if (strip) pageRefs.current[target]?.scrollIntoView({ block: "start" });
    },
    [strip, total],
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
      if (target?.kind === "pages") goTo(target.pages[0]);
      else if (target) setTransition(target.kind);
      else {
        const id = delta > 0 ? nextId : prevId;
        if (id) router.push(href(id));
      }
    },
    [
      strip,
      settings.animate,
      items,
      itemIndex,
      goTo,
      nextId,
      prevId,
      router,
      href,
    ],
  );
  const onTap = (action: TapAction) => {
    if (showZones) {
      setShowZones(false);
      return;
    }
    if (action === "menu") setChrome((c) => !c);
    else turn(action === "next" ? 1 : -1);
  };
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

  useEffect(() => {
    recordRead({
      ...series,
      chapterId: chapter.id,
      chapterNumber: chapter.number,
    });
    const saved = getSavedPage(chapter.id);
    if (saved > 0 && saved < total - 1) {
      const timer = setTimeout(() => setResumeTo(saved), 300);
      return () => clearTimeout(timer);
    }
  }, [series, chapter.id, chapter.number, total]);

  useEffect(() => {
    if (!strip) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) {
          const page = Number(
            (visible[0].target as HTMLElement).dataset.pageIndex,
          );
          if (page > 0) progressStarted.current = true;
          setCurrent(page);
        }
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
      if (y - last > 8) setChrome(false);
      last = y;
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, [strip]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    if (!strip || sheet) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [strip, sheet]);

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

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheet(null);
        setShowZones(false);
        setChrome(true);
        return;
      }
      if (
        sheet ||
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
        e.preventDefault();
        if (e.shiftKey) {
          const id = delta > 0 ? nextId : prevId;
          if (id) router.push(href(id));
        } else turn(delta);
      }
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        goTo(e.key === "Home" ? 0 : total - 1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [sheet, rtl, turn, goTo, total, nextId, prevId, router, href]);

  const renderTransition = (kind: "prev" | "next") => {
    const id = kind === "next" ? nextId : prevId;
    const target = chapters.find((c) => c.id === id);
    return (
      <div
        className="mx-auto max-w-sm px-8 py-24 text-center text-white"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium uppercase tracking-widest text-white/50">
          {kind === "next" ? `End of ${label(chapter)}` : "Previous chapter"}
        </p>
        <h2 className="mt-3 text-2xl font-semibold">
          {target
            ? label(target)
            : kind === "next"
              ? "You're all caught up"
              : "Start of this series"}
        </h2>
        {id && (
          <Link
            href={href(id)}
            className="mt-6 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-black"
          >
            {kind === "next" ? "Next chapter" : "Previous chapter"}
          </Link>
        )}
        <button
          className="mt-4 block w-full py-3 text-sm text-white/60"
          onClick={() => goTo(kind === "next" ? total - 1 : 0)}
        >
          Return to chapter
        </button>
      </div>
    );
  };
  const touch = useRef({ x: 0, y: 0 });
  const background = {
    black: "#000",
    gray: "#181818",
    white: "#fff",
    sepia: "#dbc7a4",
  }[settings.background];
  const bar =
    "glass-bar fixed inset-x-0 z-50 transition-transform duration-300";
  const button =
    "grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/10 disabled:opacity-25";

  return (
    <div
      data-reader
      data-reading-mode={mode}
      className="min-h-dvh"
      style={{ background }}
    >
      <h1 className="sr-only">
        {series.title}, {label(chapter)}
      </h1>
      {strip ? (
        <div
          onPointerDown={(e) => {
            touch.current = { x: e.clientX, y: e.clientY };
          }}
          onClick={(e) => {
            if (
              (e.target as HTMLElement).closest("button,a") ||
              Math.hypot(
                e.clientX - touch.current.x,
                e.clientY - touch.current.y,
              ) > 12
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
              className="flex flex-col"
              style={{ gap: mode === "webtoon-gaps" ? 16 : 0 }}
            >
              {pages.map((page, i) => (
                <StripPage
                  key={page.src}
                  page={page}
                  index={i}
                  settings={settings}
                  ref={(el) => {
                    pageRefs.current[i] = el;
                  }}
                />
              ))}
            </div>
          </div>
          <div className="bg-[#111] pb-20">{renderTransition("next")}</div>
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
      <header
        inert={!chrome || !!sheet}
        className={`${bar} top-0 pt-[var(--safe-top)] ${chrome ? "translate-y-0" : "-translate-y-full"}`}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-3">
          <Link
            href={`/series/${series.id}`}
            aria-label="Back to series"
            className={button}
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{series.title}</p>
            <p className="truncate text-xs text-secondary">
              {label(chapter)}
              {chapter.title && chapter.number ? ` · ${chapter.title}` : ""}
            </p>
          </div>
          <button
            aria-label="Reading settings"
            className={button}
            onClick={() => setSheet("settings")}
          >
            <SlidersIcon className="size-5" />
          </button>
        </div>
      </header>
      {!chrome && settings.pageNumber && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[max(var(--safe-bottom),12px)] text-center">
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs tabular-nums text-white">
            {current + 1} / {total}
          </span>
        </div>
      )}
      <div
        inert={!chrome || !!sheet}
        className={`${bar} bottom-0 px-4 pb-[max(var(--safe-bottom),12px)] ${chrome ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto max-w-xl pt-4">
          <div className="flex items-center gap-4 text-xs tabular-nums">
            <span>{current + 1}</span>
            <input
              aria-label="Page position"
              type="range"
              min={1}
              max={Math.max(1, total)}
              value={current + 1}
              dir={rtl ? "rtl" : "ltr"}
              onChange={(e) => goTo(Number(e.target.value) - 1)}
              className="h-7 w-full accent-white"
            />
            <span>{total}</span>
          </div>
          <nav
            aria-label="Reader controls"
            className="flex items-center justify-between"
          >
            <button
              aria-label="Previous chapter"
              disabled={!prevId}
              onClick={() => prevId && router.push(href(prevId))}
              className={button}
            >
              <ChevronLeft />
            </button>
            <button
              aria-label="Previous page"
              disabled={!current && !transition}
              onClick={() => (strip ? goTo(current - 1) : turn(-1))}
              className={button}
            >
              <ChevronLeft />
            </button>
            <button
              onClick={() => setSheet("chapters")}
              className="flex h-11 items-center gap-2 rounded-full px-3 text-xs font-medium"
            >
              <ListIcon />
              Chapters
            </button>
            <button
              aria-label="Next page"
              onClick={() => (strip ? goTo(current + 1) : turn(1))}
              className={button}
            >
              <ChevronRight />
            </button>
            <button
              aria-label="Next chapter"
              disabled={!nextId}
              onClick={() => nextId && router.push(href(nextId))}
              className={button}
            >
              <ChevronRight />
            </button>
          </nav>
        </div>
      </div>
      {resumeTo !== null && (
        <div className="fixed inset-x-4 top-[calc(var(--safe-top)+72px)] z-50 mx-auto flex max-w-sm items-center justify-between rounded-2xl bg-[#29292e] p-4 text-sm text-white shadow-xl">
          <button
            onClick={() => {
              goTo(resumeTo);
              setResumeTo(null);
            }}
          >
            Resume at page {resumeTo + 1}
          </button>
          <button
            aria-label="Dismiss resume"
            onClick={() => setResumeTo(null)}
            className="px-3 py-2"
          >
            <span aria-hidden>×</span>
          </button>
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
                ? "Controls"
                : action === "next"
                  ? "Next"
                  : "Previous"}
            </div>
          ))}
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
          onClearSeries={() => {
            clearSeriesReaderSettings(series.id);
            setSeriesMode(series.id, null);
          }}
          seriesPreset={seriesPreset || seriesMode !== null}
          versions={versions}
          currentId={chapter.id}
          onPickVersion={(id) => router.push(href(id))}
          onClose={() => setSheet(null)}
          onShowZones={() => {
            setSheet(null);
            setShowZones(true);
          }}
        />
      )}
    </div>
  );
}

function StripPage({
  page,
  index,
  settings,
  ref,
}: {
  page: Page;
  index: number;
  settings: ReaderSettings;
  ref: (el: HTMLDivElement | null) => void;
}) {
  const [ratio, setRatio] = useState<number | null>(null);
  return (
    <div
      ref={ref}
      data-page-index={index}
      className="relative w-full"
      style={{ aspectRatio: ratio ?? 2 / 3 }}
    >
      <PageImage
        page={page}
        index={index}
        settings={settings}
        load={index < settings.preload}
        lazyMargin={settings.preload * 1200}
        onSize={(_, w, h) => setRatio(w / h)}
        className="block w-full"
      />
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = dialog.current;
    const controls = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          'button,input,select,a[href],[tabindex="0"]',
        ) ?? [],
      ).filter((node) => !node.hasAttribute("disabled"));
    controls()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = controls();
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
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
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="sheet-in glass relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-[24px] pb-[var(--safe-bottom)] shadow-2xl ring-1 ring-white/10 sm:max-w-[480px] sm:rounded-[24px]"
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
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <Sheet title="Chapters" onClose={onClose}>
      <div className="px-5 pb-3">
        <label className="flex h-9 items-center gap-2 rounded-[10px] bg-fill px-3">
          <SearchIcon className="size-4 text-secondary" />
          <input
            aria-label="Find chapter"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chapter number or title"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-secondary"
          />
        </label>
      </div>
      <div className="overflow-y-auto px-3 pb-4">
        {!list.length && (
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
  onShowZones,
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
  onShowZones: () => void;
}) {
  return (
    <Sheet title="Reading settings" onClose={onClose}>
      <div className="space-y-6 overflow-y-auto px-5 pt-2 pb-6">
        <ReaderOptions settings={settings} onChange={onChange} />
        <button
          onClick={onShowZones}
          className="w-full rounded-xl bg-fill px-4 py-3 text-sm"
        >
          Show tap zones
        </button>
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
