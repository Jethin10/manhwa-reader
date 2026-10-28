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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Option
          label="Reading mode"
          value={s.mode}
          choices={[
            ["auto", "Automatic"],
            ["scroll", "Continuous scroll"],
            ["single", "Single page"],
            ["spread", "Double-page spread"],
          ]}
          onChange={(mode) =>
            onChange({ mode: mode as ReaderSettings["mode"] })
          }
        />
        <Option
          label="Reading direction"
          value={s.direction}
          choices={[
            ["auto", "Automatic"],
            ["rtl", "Right to left"],
            ["ltr", "Left to right"],
          ]}
          onChange={(direction) =>
            onChange({ direction: direction as ReaderSettings["direction"] })
          }
        />
        <Option
          label="Page width"
          value={s.width}
          choices={[
            [640, "Narrow"],
            [800, "Standard"],
            [1040, "Wide"],
            [0, "Fill screen"],
          ]}
          onChange={(width) => onChange({ width: Number(width) })}
        />
        <Option
          label="Page scaling"
          value={s.fit}
          choices={[
            ["width", "Fit width"],
            ["height", "Fit height"],
          ]}
          onChange={(fit) => onChange({ fit: fit as ReaderSettings["fit"] })}
        />
        <Option
          label="Reader background"
          value={s.theme}
          choices={[
            ["black", "Black"],
            ["dim", "Dim gray"],
            ["paper", "Paper"],
            ["sepia", "Sepia"],
          ]}
          onChange={(theme) =>
            onChange({ theme: theme as ReaderSettings["theme"] })
          }
        />
        <Option
          label="Preload ahead"
          value={s.preload}
          choices={[
            [1, "1 page · save data"],
            [3, "3 pages · balanced"],
            [5, "5 pages · faster turns"],
          ]}
          onChange={(preload) => onChange({ preload: Number(preload) })}
        />
      </div>
      <Range
        label="Page brightness"
        value={s.brightness}
        min={50}
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
      <Check
        label="HD sharpening"
        checked={s.hd}
        onChange={(hd) => onChange({ hd })}
      />
      <Check
        label="Space between scroll pages"
        checked={s.gap}
        onChange={(gap) => onChange({ gap })}
      />
      <Check
        label="First page alone in spreads"
        checked={s.spreadOffset}
        onChange={(spreadOffset) => onChange({ spreadOffset })}
      />
      <Check
        label="Tap page edges to turn"
        checked={s.tapZones}
        onChange={(tapZones) => onChange({ tapZones })}
      />
      <p className="text-xs leading-5 text-secondary">
        Automatic uses single pages and right-to-left turns for manga, and
        continuous scrolling for manhwa. Background changes keep the original
        artwork intact.
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
