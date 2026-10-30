"use client";

import Link from "next/link";
import { dismiss, useToasts } from "@/lib/toast";

/** Renders toasts above the tab bar (or at the top while reading, clear of the reader's bar). */
export function Toaster() {
  const toasts = useToasts();
  return (
    <div
      aria-live="polite"
      className="toaster pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`sheet-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl py-2.5 pr-2 pl-4 text-[14px] font-medium text-white shadow-2xl ring-1 ring-white/10 ${
            t.tone === "error" ? "bg-[#3a1d1d]" : "bg-[#2c2c2e]"
          }`}
        >
          <span className="min-w-0 py-1">{t.text}</span>
          {t.action?.href ? (
            <Link
              href={t.action.href}
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-xl bg-white/12 px-3 py-1.5 text-[13px] font-semibold text-accent"
            >
              {t.action.label}
            </Link>
          ) : t.action ? (
            <button
              onClick={() => {
                t.action!.run?.();
                dismiss(t.id);
              }}
              className="shrink-0 rounded-xl bg-white/12 px-3 py-1.5 text-[13px] font-semibold text-accent"
            >
              {t.action.label}
            </button>
          ) : (
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="grid size-8 shrink-0 place-items-center rounded-full text-white/50"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
