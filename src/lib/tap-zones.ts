import type { ReaderSettings, TapLayout } from "./library";

export type TapAction = "prev" | "next" | "menu";

/**
 * Tap regions on a 3x3 grid, matching Mihon's navigation layouts. x and y are 0..1 within
 * the reader. "prev"/"next" are in reading order; right-to-left reading mirrors them.
 */
function zone(layout: TapLayout, x: number, y: number): TapAction {
  const col = x < 1 / 3 ? 0 : x < 2 / 3 ? 1 : 2;
  const row = y < 1 / 3 ? 0 : y < 2 / 3 ? 1 : 2;
  switch (layout) {
    case "l":
      // Top band and middle-left go back; bottom band and middle-right go forward.
      if (row === 1 && col === 1) return "menu";
      if (row === 0 || (row === 1 && col === 0)) return "prev";
      return "next";
    case "kindle":
      // Top third opens the menu; left third back, the rest forward.
      if (row === 0) return "menu";
      return col === 0 ? "prev" : "next";
    case "edge":
      // Either side goes forward (one-handed); bottom-middle goes back.
      if (col !== 1) return "next";
      return row === 2 ? "prev" : "menu";
    case "sides":
      return col === 0 ? "prev" : col === 2 ? "next" : "menu";
    case "off":
      return "menu";
  }
}

export function tapAction(
  settings: Pick<ReaderSettings, "tapLayout" | "invertTap">,
  x: number,
  y: number,
  rtl: boolean,
): TapAction {
  const flipX =
    (settings.invertTap === "horizontal" || settings.invertTap === "both") !==
    rtl;
  const flipY =
    settings.invertTap === "vertical" || settings.invertTap === "both";
  return zone(settings.tapLayout, flipX ? 1 - x : x, flipY ? 1 - y : y);
}

/** Cells for the on-screen overlay that explains the current layout. */
export function tapOverlay(
  settings: Pick<ReaderSettings, "tapLayout" | "invertTap">,
  rtl: boolean,
): TapAction[] {
  const cells: TapAction[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++)
      cells.push(tapAction(settings, (col + 0.5) / 3, (row + 0.5) / 3, rtl));
  return cells;
}
