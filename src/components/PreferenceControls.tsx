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
export function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-fill px-4 py-3 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-accent)]"
      />
    </label>
  );
}
export function Range({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs text-secondary">
      <span className="flex justify-between">
        {label}
        <span>{value}%</span>
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
export function ReaderOptions({
  settings: s,
  onChange,
}: {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
}) {
  const choice = <K extends keyof ReaderSettings>(
    key: K,
    label: string,
    choices: readonly (readonly [string | number, string])[],
  ) => (
    <Option
      key={key}
      label={label}
      value={s[key] as string | number}
      choices={choices}
      onChange={(value) =>
        onChange({ [key]: typeof s[key] === "number" ? Number(value) : value })
      }
    />
  );
  const check = (key: keyof ReaderSettings, label: string) => (
    <Check
      key={key}
      label={label}
      checked={Boolean(s[key])}
      onChange={(value) => onChange({ [key]: value })}
    />
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {choice("mode", "Reading mode", [
          ["auto", "Automatic"],
          ["webtoon", "Webtoon"],
          ["webtoon-gaps", "Webtoon with gaps"],
          ["ltr", "Left to right"],
          ["rtl", "Right to left"],
          ["vertical", "Vertical pages"],
        ])}
        {choice("scale", "Page scaling", [
          ["screen", "Fit screen"],
          ["width", "Fit width"],
          ["height", "Fit height"],
          ["original", "Original size"],
        ])}
        {choice("width", "Strip width", [
          [640, "Narrow"],
          [800, "Standard"],
          [1040, "Wide"],
          [0, "Fill screen"],
        ])}
        {choice("background", "Reader background", [
          ["black", "Black"],
          ["gray", "Gray"],
          ["white", "White"],
          ["sepia", "Sepia"],
        ])}
        {choice("tapLayout", "Tap layout", [
          ["l", "L-shaped"],
          ["sides", "Left and right"],
          ["kindle", "Kindle"],
          ["edge", "Both edges advance"],
          ["off", "Menu only"],
        ])}
        {choice("invertTap", "Invert tap zones", [
          ["none", "None"],
          ["horizontal", "Horizontal"],
          ["vertical", "Vertical"],
          ["both", "Both"],
        ])}
        {choice("tint", "Color filter", [
          ["none", "None"],
          ["warm", "Warm"],
          ["amber", "Amber"],
          ["night", "Night"],
        ])}
        {choice("preload", "Preload ahead", [
          [1, "1 page"],
          [3, "3 pages"],
          [5, "5 pages"],
        ])}
      </div>
      <Range
        label="Strip side padding"
        value={s.padding}
        min={0}
        max={25}
        onChange={(padding) => onChange({ padding })}
      />
      <Range
        label="Page brightness"
        value={s.brightness}
        min={20}
        max={120}
        onChange={(brightness) => onChange({ brightness })}
      />
      <Range
        label="Page contrast"
        value={s.contrast}
        min={75}
        max={150}
        onChange={(contrast) => onChange({ contrast })}
      />
      {check("spreads", "Double-page spreads")}
      {check("spreadOffset", "First page alone in spreads")}
      {check("animate", "Animate page turns")}
      {check("doubleTapZoom", "Double tap to zoom in paged modes")}
      {check("pageNumber", "Show page number")}
      {check("keepAwake", "Keep screen awake when supported")}
      {check("hd", "HD sharpening")}
      {check("grayscale", "Grayscale")}
      {check("invert", "Invert colors")}
      <p className="text-xs leading-5 text-secondary">
        Automatic uses right-to-left pages for manga and continuous scrolling
        for manhwa. Pinch to zoom, or double tap in paged modes. Tap the center
        to show controls.
      </p>
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
