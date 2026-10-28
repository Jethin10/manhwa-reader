"use client";
import { useState } from "react";
import {
  DEFAULT_READER,
  updateReaderSettings,
  useReaderSettings,
} from "@/lib/library";
import {
  DEFAULT_PREFERENCES,
  updatePreferences,
  usePreferences,
} from "@/lib/preferences";
import { exportBackup, importBackup } from "@/lib/backup";
import {
  Check,
  Option,
  PlaybackOptions,
  ReaderOptions,
} from "./PreferenceControls";
export function Settings() {
  const reader = useReaderSettings(),
    prefs = usePreferences();
  const [tab, setTab] = useState("reading"),
    [message, setMessage] = useState("");
  function download() {
    const url = URL.createObjectURL(
      new Blob([exportBackup()], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `manhwa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMessage(
      "Backup downloaded. It includes your library, progress, and preferences.",
    );
  }
  return (
    <div className="mx-auto max-w-[1050px] px-5 py-10 sm:px-8">
      <h1 className="display text-4xl font-bold">Make it yours</h1>
      <p className="mt-3 text-sm text-secondary">
        Reading, watching, and accessibility preferences stay on this device.
      </p>
      <nav
        aria-label="Preference sections"
        className="no-scrollbar mt-7 flex gap-2 overflow-auto"
      >
        {[
          ["reading", "Reading"],
          ["watching", "Watching"],
          ["appearance", "Appearance"],
          ["backup", "Backup & restore"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`shrink-0 rounded-full px-5 py-2.5 text-sm ${tab === id ? "bg-white text-black" : "bg-fill text-secondary"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <section className="mt-7 rounded-2xl bg-card p-5 ring-1 ring-white/[0.06] sm:p-8">
        {tab === "reading" && (
          <>
            <h2 className="mb-6 text-xl font-semibold">Reader defaults</h2>
            <ReaderOptions settings={reader} onChange={updateReaderSettings} />
            <button
              onClick={() => updateReaderSettings(DEFAULT_READER)}
              className="mt-6 rounded-full bg-fill px-5 py-2 text-sm"
            >
              Reset reader defaults
            </button>
            <p className="mt-3 text-xs text-secondary">
              Use Save for this series inside the reader for a title-specific
              preset.
            </p>
          </>
        )}
        {tab === "watching" && (
          <>
            <h2 className="mb-6 text-xl font-semibold">Playback preferences</h2>
            <PlaybackOptions settings={prefs} onChange={updatePreferences} />
            <div className="mt-6 rounded-xl bg-fill p-4 text-xs leading-6 text-secondary">
              <p>
                Shortcuts: Space/K play or pause; J/L or arrows seek; M mute; F
                fullscreen; P picture in picture; C captions.
              </p>
              <p className="mt-3">
                4K appears as 2160p only when a stream offers it. The checked
                Bleach, Attack on Titan, and TYBW streams currently top out at
                1080p. Increasing the display size does not add source detail.
              </p>
            </div>
            <button
              onClick={() =>
                updatePreferences({
                  ...DEFAULT_PREFERENCES,
                  accent: prefs.accent,
                  reduceMotion: prefs.reduceMotion,
                })
              }
              className="mt-6 rounded-full bg-fill px-5 py-2 text-sm"
            >
              Reset playback preferences
            </button>
          </>
        )}
        {tab === "appearance" && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">
              Appearance & accessibility
            </h2>
            <Option
              label="Accent color"
              value={prefs.accent}
              choices={[
                ["violet", "Violet"],
                ["blue", "Blue"],
                ["rose", "Rose"],
              ]}
              onChange={(accent) =>
                updatePreferences({ accent: accent as typeof prefs.accent })
              }
            />
            <Check
              label="Reduce interface motion"
              checked={prefs.reduceMotion}
              onChange={(reduceMotion) => updatePreferences({ reduceMotion })}
            />
            <p className="text-xs leading-6 text-secondary">
              Your operating system&apos;s reduced-motion setting is respected
              too. Reader backgrounds and image brightness are in Reading;
              subtitle size and contrast are in Watching.
            </p>
          </div>
        )}
        {tab === "backup" && (
          <div>
            <h2 className="text-xl font-semibold">Your library, your copy</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-secondary">
              Download a JSON backup of your reading lists, anime watchlist,
              reading and watching progress, and settings. Restore merges saved
              titles and progress into this device. Imported preferences replace
              the corresponding defaults.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={download}
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black"
              >
                Download backup
              </button>
              <label className="cursor-pointer rounded-full bg-fill px-6 py-3 text-sm">
                Restore backup
                <input
                  aria-label="Restore backup"
                  className="sr-only"
                  type="file"
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 2 * 1024 * 1024)
                        throw new Error("Choose a backup smaller than 2 MB.");
                      const count = importBackup(await file.text());
                      setMessage(
                        `Restored ${count} data groups. Existing saved titles were kept.`,
                      );
                    } catch (err) {
                      setMessage(
                        err instanceof Error
                          ? err.message
                          : "Could not restore this backup.",
                      );
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="mt-5 text-xs text-secondary">
              Keep backups private: they contain your title lists and activity.
              No account or source credentials are exported.
            </p>
          </div>
        )}
      </section>
      <p
        role="status"
        aria-live="polite"
        className="mt-4 text-sm text-secondary"
      >
        {message}
      </p>
    </div>
  );
}
