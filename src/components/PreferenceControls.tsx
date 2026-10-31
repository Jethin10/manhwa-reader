"use client";
import type { ReaderSettings } from "@/lib/library";
import type { Preferences } from "@/lib/preferences";
const control =
  "mt-1.5 w-full rounded-lg bg-fill px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent";
export function Option({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string | number;
  choices: readonly (readonly [string | number, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs text-secondary">
      {label}
      <select
        aria-label={label}
        className={control}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {choices.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
/** A single choice shown as tappable chips, as in Mihon's reader sheet. */
export function Chips({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string | number;
  choices: readonly (readonly [string | number, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-2 text-xs text-secondary">{label}</p>
      <div className="flex flex-wrap gap-2">
        {choices.map(([v, text]) => {
          const on = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(String(v))}
              className={`h-9 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                on
                  ? "bg-accent text-white"
                  : "bg-fill text-label/85 hover:bg-fill-2"
              }`}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-fill px-4 py-3 text-sm">
      <span className="min-w-0">
        {label}
        {hint && (
          <span className="mt-0.5 block text-xs text-secondary">{hint}</span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-[26px] w-[44px] shrink-0 rounded-full bg-white/20 transition-colors peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-[2px] after:left-[2px] after:size-[22px] after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-[18px]"
      />
    </label>
  );
}
export function Range({
  label,
  value,
  min,
  max,
  unit = "%",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs text-secondary">
      <span className="flex justify-between">
        {label}
        <span className="tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}

export type ReaderSection = "mode" | "general" | "filter";
const isStrip = (mode: string) => mode === "webtoon" || mode === "webtoon-gaps";

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h3 className="text-[11px] font-semibold tracking-[0.06em] text-tertiary uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Reader settings grouped like Mihon's reader sheet: reading mode, general, and filters.
 * `section` shows one tab (inside the reader); without it every section shows (Settings).
 * `mode` is the mode in effect, so only the paged or the long-strip options appear.
 */
export function ReaderOptions({
  settings: s,
  onChange,
  section,
  mode,
}: {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  section?: ReaderSection;
  mode?: string;
}) {
  const choice = <K extends keyof ReaderSettings>(
    key: K,
    label: string,
    choices: readonly (readonly [string | number, string])[],
  ) => (
    <Chips
      key={key}
      label={label}
      value={s[key] as string | number}
      choices={choices}
      onChange={(value) =>
        onChange({ [key]: typeof s[key] === "number" ? Number(value) : value })
      }
    />
  );
  const check = (key: keyof ReaderSettings, label: string, hint?: string) => (
    <Check
      key={key}
      label={label}
      hint={hint}
      checked={Boolean(s[key])}
      onChange={(value) => onChange({ [key]: value })}
    />
  );
  const all = !section;
  const showPaged = all || !mode || !isStrip(mode);
  const showStrip = all || !mode || isStrip(mode);

  return (
    <div className="space-y-7">
      {(all || section === "mode") && (
        <>
          <Group title="Reading mode">
            {choice("mode", "Mode", [
              ["auto", "Default"],
              ["ltr", "Left to right"],
              ["rtl", "Right to left"],
              ["vertical", "Vertical"],
              ["webtoon", "Long strip"],
              ["webtoon-gaps", "Long strip with gaps"],
            ])}
            <p className="text-xs leading-5 text-secondary">
              Default reads manga right to left and manhwa and manhua as a long
              strip. A mode picked in the reader sticks to that series.
            </p>
          </Group>
          {showPaged && (
            <Group title="Paged">
              {choice("scale", "Scale type", [
                ["screen", "Fit screen"],
                ["stretch", "Stretch"],
                ["width", "Fit width"],
                ["height", "Fit height"],
                ["original", "Original size"],
                ["smart", "Smart fit"],
              ])}
              {choice("zoomStart", "Zoom start position", [
                ["auto", "Automatic"],
                ["left", "Left"],
                ["right", "Right"],
                ["center", "Center"],
              ])}
              {check(
                "spreads",
                "Double-page spreads",
                "Two pages side by side. Wide pages stay alone.",
              )}
              {s.spreads &&
                check("spreadOffset", "Show the first page alone")}
              {check(
                "splitWide",
                "Split wide pages",
                "Shows a double-page image as two pages.",
              )}
              {check(
                "navigateToPan",
                "Tap to pan large pages",
                "Taps move through a zoomed or oversized page before turning it.",
              )}
              {check("animate", "Animate page transitions")}
              {check("doubleTapZoom", "Double tap to zoom")}
            </Group>
          )}
          {showStrip && (
            <Group title="Long strip">
              {choice("width", "Strip width on large screens", [
                [640, "Narrow"],
                [800, "Standard"],
                [1040, "Wide"],
                [0, "Full"],
              ])}
              <Range
                label="Side padding"
                value={s.padding}
                min={0}
                max={25}
                onChange={(padding) => onChange({ padding })}
              />
            </Group>
          )}
          <Group title="Navigation">
            {choice("tapLayout", "Tap zones", [
              ["l", "L-shaped"],
              ["kindle", "Kindle-ish"],
              ["edge", "Edge"],
              ["sides", "Right and left"],
              ["off", "Disabled"],
            ])}
            {choice("invertTap", "Invert tap zones", [
              ["none", "None"],
              ["horizontal", "Horizontal"],
              ["vertical", "Vertical"],
              ["both", "Both"],
            ])}
          </Group>
        </>
      )}
      {(all || section === "general") && (
        <Group title="General">
          {choice("background", "Background color", [
            ["black", "Black"],
            ["gray", "Gray"],
            ["white", "White"],
            ["sepia", "Sepia"],
          ])}
          {choice("preload", "Preload ahead", [
            [1, "1 page"],
            [3, "3 pages"],
            [5, "5 pages"],
          ])}
          {check("pageNumber", "Show page number")}
          {check("keepAwake", "Keep screen on")}
          {check(
            "longTap",
            "Long tap for page actions",
            "Save, share or reload a page.",
          )}
          {check(
            "volumeKeys",
            "Volume keys turn pages",
            "In the Android app. Volume down goes forward.",
          )}
          {s.volumeKeys && check("volumeInvert", "Invert volume keys")}
          {check(
            "hd",
            "HD sharpening",
            "Loads a sharpened copy when a page has fewer pixels than your screen.",
          )}
        </Group>
      )}
      {(all || section === "filter") && (
        <Group title="Filter">
          <Range
            label="Brightness"
            value={s.brightness}
            min={20}
            max={120}
            onChange={(brightness) => onChange({ brightness })}
          />
          <Range
            label="Contrast"
            value={s.contrast}
            min={75}
            max={150}
            onChange={(contrast) => onChange({ contrast })}
          />
          {choice("tint", "Color filter", [
            ["none", "Off"],
            ["warm", "Warm"],
            ["amber", "Amber"],
            ["night", "Night"],
          ])}
          {check("grayscale", "Grayscale")}
          {check("invert", "Inverted")}
        </Group>
      )}
    </div>
  );
}
export function PlaybackOptions({
  settings: s,
  onChange,
}: {
  settings: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Option
          label="Playback speed"
          value={s.speed}
          choices={[
            [0.5, "0.5×"],
            [0.75, "0.75×"],
            [1, "1×"],
            [1.25, "1.25×"],
            [1.5, "1.5×"],
            [1.75, "1.75×"],
            [2, "2×"],
          ]}
          onChange={(speed) => onChange({ speed: Number(speed) })}
        />
        <Option
          label="Seek step"
          value={s.seekSeconds}
          choices={[
            [5, "5 seconds"],
            [10, "10 seconds"],
            [30, "30 seconds"],
          ]}
          onChange={(seekSeconds) =>
            onChange({ seekSeconds: Number(seekSeconds) })
          }
        />
        <Option
          label="Preferred audio"
          value={s.audio}
          choices={[
            ["sub", "Subtitled"],
            ["dub", "English dub"],
          ]}
          onChange={(audio) =>
            onChange({ audio: audio as Preferences["audio"] })
          }
        />
        <Option
          label="Picture fit"
          value={s.fit}
          choices={[
            ["contain", "Fit · keep full picture"],
            ["cover", "Fill · crop edges"],
          ]}
          onChange={(fit) => onChange({ fit: fit as Preferences["fit"] })}
        />
        <Option
          label="Subtitle size"
          value={s.subtitleSize}
          choices={[
            [16, "Small · 16px"],
            [20, "Medium · 20px"],
            [24, "Standard · 24px"],
            [28, "Large · 28px"],
            [32, "Extra large · 32px"],
            [40, "Maximum · 40px"],
          ]}
          onChange={(subtitleSize) =>
            onChange({ subtitleSize: Number(subtitleSize) })
          }
        />
        <Option
          label="Subtitle color"
          value={s.subtitleColor}
          choices={[
            ["white", "White"],
            ["yellow", "Yellow"],
          ]}
          onChange={(subtitleColor) =>
            onChange({
              subtitleColor: subtitleColor as Preferences["subtitleColor"],
            })
          }
        />
        <Option
          label="Buffer ahead"
          value={s.buffer}
          choices={[
            ["balanced", "Balanced · ~60 seconds"],
            ["generous", "Generous · ~90 seconds"],
          ]}
          onChange={(buffer) =>
            onChange({ buffer: buffer as Preferences["buffer"] })
          }
        />
      </div>
      <Check
        label="Subtitle background"
        checked={s.subtitleBackground}
        onChange={(subtitleBackground) => onChange({ subtitleBackground })}
      />
      <Check
        label="Auto-play next episode"
        checked={s.autoNext}
        onChange={(autoNext) => onChange({ autoNext })}
      />
      <Check
        label="Auto-skip timestamped intros"
        checked={s.autoSkipIntro}
        onChange={(autoSkipIntro) => onChange({ autoSkipIntro })}
      />
      <Check
        label="Pause when the tab is hidden"
        checked={s.pauseWhenHidden}
        onChange={(pauseWhenHidden) => onChange({ pauseWhenHidden })}
      />
      <p className="text-xs leading-5 text-secondary">
        Intro skipping appears only when the source supplies valid timestamps.
        Subtitle styling applies to selectable text tracks, not text burned into
        the picture.
      </p>
    </div>
  );
}
