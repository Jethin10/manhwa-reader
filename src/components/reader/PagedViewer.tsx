"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { PageImage as Page } from "@/lib/catalog";
import type { ReaderSettings } from "@/lib/library";
import { tapAction, type TapAction } from "@/lib/tap-zones";
import { PageImage, Spinner } from "./PageImage";
import { pageRatio, pageSize, usePageSizes } from "./page-sizes";

export type PagerItem =
  | {
      kind: "pages";
      pages: number[];
      /** One half of a wide page split in two: 0 is read first. */
      half?: 0 | 1;
    }
  | { kind: "prev" }
  | { kind: "next" };

type View = { s: number; x: number; y: number };
const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 260;
const LONG_PRESS_MS = 500;

/**
 * A swipeable pager in the spirit of Mihon's: pages follow the finger and snap, pinch and
 * double-tap zoom, pan around zoomed or oversized pages, tap zones that pan through a page
 * before turning it, and long press for page actions. Gestures write transforms straight to
 * the DOM so dragging never waits on React.
 */
export function PagedViewer({
  pages,
  items,
  index,
  axis,
  rtl,
  settings,
  onTurn,
  onTap,
  onLongPress,
  renderTransition,
}: {
  pages: Page[];
  items: PagerItem[];
  index: number;
  axis: "x" | "y";
  rtl: boolean;
  settings: ReaderSettings;
  /** Called with +1 / -1 to move in reading order. */
  onTurn: (delta: number) => void;
  onTap: (action: TapAction) => void;
  /** Long press on a page, with that page's index. */
  onLongPress?: (page: number) => void;
  renderTransition: (kind: "prev" | "next") => React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizes = usePageSizes();
  const view = useRef<View>({ s: 1, x: 0, y: 0 });
  const flip = axis === "x" && rtl ? -1 : 1;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dim = useCallback(
    (p: number) => pageSize(pages[p]?.src ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sizes` is the store version
    [pages, sizes],
  );
  const ratioOf = useCallback(
    (p: number) => pageRatio(pages[p]?.src ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sizes` is the store version
    [pages, sizes],
  );

  // ----- layout -----
  const layout = useCallback(
    (item: PagerItem | undefined) => {
      const { w: vw, h: vh } = size;
      if (!item || item.kind !== "pages") return { cw: vw, ch: vh };
      const halves = item.half === undefined ? 1 : 2;
      const ratio = item.pages.reduce((a, p) => a + ratioOf(p), 0) / halves;
      let scale: string = item.pages.length > 1 ? "screen" : settings.scale;
      // Smart fit: a spread on a portrait screen fills the height and pans; the rest fit.
      if (scale === "smart") scale = ratio > 1 && vw < vh ? "height" : "screen";
      if (scale === "stretch") return { cw: vw, ch: vh };
      if (scale === "width") return { cw: vw, ch: vw / ratio };
      if (scale === "height") return { cw: vh * ratio, ch: vh };
      const d = item.pages.length === 1 ? dim(item.pages[0]) : undefined;
      if (scale === "original" && d)
        return {
          cw: d[0] / halves / devicePixelRatio,
          ch: d[1] / devicePixelRatio,
        };
      const cw = Math.min(vw, vh * ratio);
      return { cw, ch: cw / ratio };
    },
    [size, ratioOf, dim, settings.scale],
  );

  const clamp = useCallback(
    (v: View, cw: number, ch: number): View => {
      const { w: vw, h: vh } = size;
      const fit = (pos: number, content: number, port: number) =>
        content <= port
          ? (port - content) / 2
          : Math.min(0, Math.max(port - content, pos));
      return { s: v.s, x: fit(v.x, cw * v.s, vw), y: fit(v.y, ch * v.s, vh) };
    },
    [size],
  );

  const initial = useCallback(
    (item: PagerItem | undefined): View => {
      const { cw, ch } = layout(item);
      // Oversized pages start where reading starts: the top, and the right edge for RTL.
      const start =
        settings.zoomStart === "auto"
          ? rtl
            ? "right"
            : "left"
          : settings.zoomStart;
      const x =
        start === "right"
          ? size.w - cw
          : start === "center"
            ? (size.w - cw) / 2
            : 0;
      return clamp({ s: 1, x, y: 0 }, cw, ch);
    },
    [layout, clamp, rtl, size.w, settings.zoomStart],
  );

  // ----- DOM writes -----
  const content = () =>
    track.current?.querySelector<HTMLElement>(`[data-item="${index}"]`) ?? null;
  const paint = (v: View) => {
    view.current = v;
    const el = content();
    if (el)
      el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
  };
  const place = (drag: number, animate: boolean) => {
    const el = track.current;
    if (!el) return;
    const step = axis === "x" ? size.w : size.h;
    const pos = -index * step * flip + drag;
    el.style.transition =
      animate && settings.animate
        ? "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)"
        : "none";
    el.style.transform =
      axis === "x"
        ? `translate3d(${pos}px, 0, 0)`
        : `translate3d(0, ${pos}px, 0)`;
  };

  const activeLayout = layout(items[index]);
  const active = items[index];
  const activeKey =
    active?.kind === "pages"
      ? `${active.pages.join(",")}:${active.half ?? ""}`
      : active?.kind;
  // A neighboring preload must not reset the current page's zoom. The first placement
  // (opening a chapter, resuming, rotating) jumps; later page turns slide.
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (!size.w) return;
    place(0, placed.current);
    placed.current = true;
    paint(initial(items[index]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    index,
    size.w,
    size.h,
    activeLayout.cw,
    activeLayout.ch,
    activeKey,
    axis,
    rtl,
    settings.zoomStart,
  ]);

  // ----- gestures -----
  const g = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    startX: 0,
    startY: 0,
    startT: 0,
    start: { s: 1, x: 0, y: 0 } as View,
    mode: null as null | "page" | "pan" | "pinch",
    pinch: { d: 0, mx: 0, my: 0 },
    drag: 0,
    moved: false,
    lastTap: { t: 0, x: 0, y: 0 },
    tapTimer: 0 as number | ReturnType<typeof setTimeout>,
    pressTimer: 0 as number | ReturnType<typeof setTimeout>,
    pressed: false,
    lastWheel: 0,
  });

  const zoomAt = (s: number, px: number, py: number) => {
    const { cw, ch } = layout(items[index]);
    const v = view.current;
    const k = s / v.s;
    paint(clamp({ s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, cw, ch));
  };

  const animateView = (to: View) => {
    const el = content();
    if (el && settings.animate) {
      el.style.transition = "transform 240ms cubic-bezier(0.32, 0.72, 0, 1)";
      setTimeout(() => el && (el.style.transition = ""), 260);
    }
    paint(to);
  };

  /** Moves through a page bigger than the screen; false once its far edge is showing. */
  const pan = (dir: 1 | -1) => {
    const item = items[index];
    if (item?.kind !== "pages") return false;
    const { cw, ch } = layout(item);
    const v = view.current;
    if (ch * v.s > size.h + 1) {
      const to = clamp({ ...v, y: v.y - dir * size.h * 0.85 }, cw, ch);
      if (Math.abs(to.y - v.y) > 1) {
        animateView(to);
        return true;
      }
    }
    if (cw * v.s > size.w + 1) {
      const across = rtl ? -dir : dir;
      const to = clamp({ ...v, x: v.x - across * size.w * 0.85 }, cw, ch);
      if (Math.abs(to.x - v.x) > 1) {
        animateView(to);
        return true;
      }
    }
    return false;
  };

  const tap = (cx: number, cy: number) => {
    const r = box.current!.getBoundingClientRect();
    const px = cx - r.left;
    const py = cy - r.top;
    const act = () => {
      const action = tapAction(
        settings,
        px / r.width,
        py / r.height,
        axis === "x" && rtl,
      );
      if (
        action !== "menu" &&
        settings.navigateToPan &&
        pan(action === "next" ? 1 : -1)
      )
        return;
      onTap(action);
    };
    const st = g.current;
    if (!settings.doubleTapZoom || items[index]?.kind !== "pages") return act();
    const now = Date.now();
    if (
      now - st.lastTap.t < DOUBLE_TAP_MS &&
      Math.hypot(px - st.lastTap.x, py - st.lastTap.y) < 40
    ) {
      clearTimeout(st.tapTimer);
      st.lastTap.t = 0;
      const { cw, ch } = layout(items[index]);
      const v = view.current;
      if (v.s > 1.05) animateView(initial(items[index]));
      else {
        const s = 2.5;
        animateView(
          clamp({ s, x: px - (px - v.x) * s, y: py - (py - v.y) * s }, cw, ch),
        );
      }
      return;
    }
    st.lastTap = { t: now, x: px, y: py };
    st.tapTimer = setTimeout(act, DOUBLE_TAP_MS);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const st = g.current;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // The pointer already ended (fast taps on some devices).
    }
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    clearTimeout(st.pressTimer);
    st.pressed = false;
    if (st.pointers.size === 2) {
      const [a, b] = [...st.pointers.values()];
      const r = box.current!.getBoundingClientRect();
      st.mode = "pinch";
      st.moved = true;
      st.pinch = {
        d: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2 - r.left,
        my: (a.y + b.y) / 2 - r.top,
      };
      st.start = { ...view.current };
      if (st.drag) place(0, true);
      st.drag = 0;
      return;
    }
    if (st.pointers.size > 2) return;
    st.startX = e.clientX;
    st.startY = e.clientY;
    st.startT = Date.now();
    st.start = { ...view.current };
    st.mode = null;
    st.moved = false;
    st.drag = 0;
    const item = items[index];
    if (settings.longTap && onLongPress && item?.kind === "pages") {
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-page]");
      const page = el ? Number(el.dataset.page) : item.pages[0];
      st.pressTimer = setTimeout(() => {
        if (st.moved || st.pointers.size !== 1) return;
        st.pressed = true;
        clearTimeout(st.tapTimer);
        onLongPress(page);
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = g.current;
    if (!st.pointers.has(e.pointerId)) return;
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const item = items[index];
    const { cw, ch } = layout(item);

    if (st.mode === "pinch" && st.pointers.size >= 2) {
      const [a, b] = [...st.pointers.values()];
      const r = box.current!.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      const s = Math.min(MAX_ZOOM, Math.max(1, (st.start.s * d) / st.pinch.d));
      const k = s / st.start.s;
      paint(
        clamp(
          {
            s,
            x: mx - (st.pinch.mx - st.start.x) * k,
            y: my - (st.pinch.my - st.start.y) * k,
          },
          cw,
          ch,
        ),
      );
      return;
    }
    if (st.pointers.size !== 1) return;

    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.mode) {
      if (Math.hypot(dx, dy) < 8) return;
      st.moved = true;
      clearTimeout(st.pressTimer);
      const main = axis === "x" ? dx : dy;
      const cross = axis === "x" ? dy : dx;
      const v = view.current;
      const port = axis === "x" ? size.w : size.h;
      const extent = (axis === "x" ? cw : ch) * v.s;
      const pos = axis === "x" ? v.x : v.y;
      const overflow = extent > port + 1;
      // Dragging toward content that is still hidden pans; at the edge it turns the page.
      const atEdge = main < 0 ? pos <= port - extent + 1 : pos >= -1;
      st.mode =
        item?.kind === "pages" && overflow && !atEdge
          ? "pan"
          : Math.abs(main) > Math.abs(cross) || !overflow
            ? v.s > 1.05 && !atEdge
              ? "pan"
              : "page"
            : "pan";
      if (st.mode === "page" && v.s > 1.05 && Math.abs(cross) > Math.abs(main))
        st.mode = "pan";
    }
    if (st.mode === "pan") {
      paint(
        clamp(
          { s: st.start.s, x: st.start.x + dx, y: st.start.y + dy },
          cw,
          ch,
        ),
      );
      return;
    }
    if (st.mode === "page") {
      let drag = axis === "x" ? dx : dy;
      const forward = drag * -flip > 0;
      const atEnd = forward ? index >= items.length - 1 : index <= 0;
      if (atEnd) drag *= 0.3;
      st.drag = drag;
      place(drag, false);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const st = g.current;
    if (!st.pointers.has(e.pointerId)) return;
    clearTimeout(st.pressTimer);
    if (e.type === "pointercancel") {
      st.pointers.clear();
      st.mode = null;
      st.drag = 0;
      st.pressed = false;
      clearTimeout(st.tapTimer);
      place(0, true);
      return;
    }
    st.pointers.delete(e.pointerId);
    if (st.mode === "pinch") {
      if (st.pointers.size === 0) {
        st.mode = null;
        if (view.current.s < 1.05) animateView(initial(items[index]));
      }
      return;
    }
    if (st.pointers.size) return;
    if (st.pressed) {
      st.pressed = false;
      st.mode = null;
      return;
    }
    const dt = Math.max(1, Date.now() - st.startT);
    if (!st.moved && dt < 400 && e.type === "pointerup") {
      tap(e.clientX, e.clientY);
      return;
    }
    if (st.mode === "page") {
      const port = axis === "x" ? size.w : size.h;
      const velocity = st.drag / dt;
      if (
        Math.abs(st.drag) > port * 0.2 ||
        (Math.abs(velocity) > 0.45 && Math.abs(st.drag) > 24)
      )
        // Past either end, the reader moves to the neighboring chapter.
        onTurn(-Math.sign(st.drag) * flip);
      place(0, true);
    }
    st.mode = null;
    st.drag = 0;
  };

  const onWheel = (e: React.WheelEvent) => {
    const st = g.current;
    const item = items[index];
    if (e.ctrlKey && item?.kind === "pages") {
      // Trackpad pinch
      const r = box.current!.getBoundingClientRect();
      zoomAt(
        Math.min(
          MAX_ZOOM,
          Math.max(1, view.current.s * Math.exp(-e.deltaY / 200)),
        ),
        e.clientX - r.left,
        e.clientY - r.top,
      );
      return;
    }
    const { cw, ch } = layout(item);
    const v = view.current;
    if (
      item?.kind === "pages" &&
      (ch * v.s > size.h + 1 || cw * v.s > size.w + 1)
    ) {
      const next = clamp(
        { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY },
        cw,
        ch,
      );
      if (next.x !== v.x || next.y !== v.y) return paint(next);
    }
    if (
      Math.abs(e.deltaY) + Math.abs(e.deltaX) < 20 ||
      Date.now() - st.lastWheel < 350
    )
      return;
    st.lastWheel = Date.now();
    onTurn(
      Math.sign(
        Math.abs(e.deltaY) >= Math.abs(e.deltaX)
          ? e.deltaY
          : e.deltaX * (rtl ? -1 : 1),
      ),
    );
  };

  useEffect(() => {
    const st = g.current;
    return () => {
      clearTimeout(st.tapTimer);
      clearTimeout(st.pressTimer);
    };
  }, []);

  const lo = Math.max(0, index - 2);
  const hi = Math.min(items.length - 1, index + Math.max(2, settings.preload));
  const step = axis === "x" ? size.w : size.h;

  return (
    <div
      ref={box}
      className="fixed inset-0 overflow-hidden"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onContextMenu={(e) => settings.longTap && e.preventDefault()}
    >
      <div ref={track} className="absolute inset-0 will-change-transform">
        {size.w > 0 &&
          items.slice(lo, hi + 1).map((item, k) => {
            const i = lo + k;
            const offset = i * step * flip;
            const pos =
              axis === "x"
                ? { left: offset, top: 0 }
                : { left: 0, top: offset };
            const { cw, ch } = layout(item);
            const v = initial(item);
            return (
              <div
                key={
                  item.kind === "pages"
                    ? `p${item.pages[0]}${item.half === undefined ? "" : `-${item.half}`}`
                    : item.kind
                }
                inert={i !== index}
                aria-hidden={i !== index}
                className="absolute overflow-hidden"
                style={{ ...pos, width: size.w, height: size.h }}
              >
                {item.kind === "pages" ? (
                  <div
                    data-item={i}
                    className="absolute top-0 left-0 flex origin-top-left"
                    style={{
                      width: cw,
                      height: ch,
                      flexDirection: rtl ? "row-reverse" : "row",
                      transform: `translate3d(${v.x}px, ${v.y}px, 0) scale(1)`,
                    }}
                  >
                    {item.pages.map((p) => {
                      const total = item.pages.reduce(
                        (a, q) => a + ratioOf(q),
                        0,
                      );
                      // The half read first is the left one, or the right one in RTL.
                      const right =
                        item.half !== undefined && (item.half === 1) !== rtl;
                      return (
                        <div
                          key={p}
                          data-page={p}
                          className="relative h-full overflow-hidden"
                          style={{ width: `${(ratioOf(p) / total) * 100}%` }}
                        >
                          {!dim(p) && (
                            <div className="absolute inset-0 grid place-items-center">
                              <Spinner />
                            </div>
                          )}
                          <PageImage
                            page={pages[p]}
                            index={p}
                            settings={settings}
                            load={
                              i >= index - 1 && i <= index + settings.preload
                            }
                            className={
                              item.half === undefined
                                ? `relative block size-full ${settings.scale === "stretch" ? "object-fill" : "object-contain"}`
                                : "relative block h-full w-[200%] max-w-none"
                            }
                            style={right ? { marginLeft: "-100%" } : undefined}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div
                    data-item={i}
                    className="grid size-full place-items-center"
                  >
                    {renderTransition(item.kind)}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
