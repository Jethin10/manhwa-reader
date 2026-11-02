"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { Suggestion } from "@/app/api/suggest/route";
import { ChevronRight, SearchIcon } from "./Icons";
import { RetryImg } from "./RetryImg";

export type SearchSection = "manga" | "anime";

// Suggestions already fetched this session, so retyping or backspacing is instant.
const seen = new Map<string, Suggestion[]>();

export function SearchBox({
  large,
  autoFocus,
  section = "manga",
  mangaOnly = false,
}: {
  large?: boolean;
  autoFocus?: boolean;
  section?: SearchSection;
  mangaOnly?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{ key: string; items: Suggestion[] } | null>(null);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);
  const listId = useId();
  const target =
    section === "anime" ? "/anime" : mangaOnly ? "/manga" : "/series";
  const label = section === "anime" ? "Search anime" : "Search manga";
  const term = q.trim();
  const key = `${section}|${term.toLowerCase()}`;
  const fresh = found?.key === key ? found.items : (seen.get(key) ?? null);
  const loading = term.length >= 2 && !fresh;
  // While the next search runs, the last results stay up (dimmed) instead of blanking.
  const items = fresh ?? found?.items ?? null;
  const showList = open && term.length >= 2;

  useEffect(() => {
    if (term.length < 2 || seen.has(key)) return;
    const ctl = new AbortController();
    // Wait for a pause in typing so each keystroke doesn't start a search.
    const timer = setTimeout(() => {
      fetch(`/api/suggest?section=${section}&q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { items: [] }))
        .then(({ items }: { items: Suggestion[] }) => {
          seen.set(key, items);
          setFound({ key, items });
        })
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [key, term, section]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const searchAll = () => {
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (target === "/series") params.set("type", "all");
    setOpen(false);
    router.push(`${target}${params.size ? `?${params}` : ""}`);
  };

  return (
    <form
      ref={box}
      role="search"
      aria-label={label}
      action={target}
      onSubmit={(e) => {
        e.preventDefault();
        const pick = items?.[active];
        if (pick) {
          setOpen(false);
          router.push(pick.href);
        } else searchAll();
      }}
      className={`relative flex items-center gap-2 bg-fill transition-colors focus-within:bg-fill-2 ${
        large ? "h-11 rounded-[12px] px-3.5" : "h-9 rounded-[10px] px-3"
      }`}
    >
      {target === "/series" && <input type="hidden" name="type" value="all" />}
      <SearchIcon
        className={
          large ? "size-[18px] text-secondary" : "size-[15px] text-secondary"
        }
      />
      <input
        name="q"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          const n = items?.length ?? 0;
          if (e.key === "Escape") setOpen(false);
          else if (n && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i <= 0 ? n : i) - 1));
          }
        }}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        // Mobile keyboards show a "Search" key and don't autocorrect titles.
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={
          section === "anime" ? "Search anime..." : "Search manga..."
        }
        aria-label={label}
        className={`min-w-0 w-full bg-transparent outline-none placeholder:text-secondary [&::-webkit-search-cancel-button]:hidden ${
          large ? "t-body" : "t-footnote"
        }`}
      />
      <button
        type="submit"
        aria-label={label}
        className="grid size-8 shrink-0 place-items-center rounded-full text-secondary transition hover:bg-fill hover:text-label"
      >
        <ChevronRight className="size-4" />
      </button>

      {showList && (
        <div
          className={`absolute top-full z-50 mt-2 overflow-hidden rounded-[14px] bg-[#1c1c1e]/95 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] ring-[0.5px] ring-white/15 backdrop-blur-xl ${
            large ? "inset-x-0" : "right-0 w-[380px] max-w-[calc(100vw-2rem)]"
          }`}
        >
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            aria-busy={loading}
            className={`transition-opacity ${loading ? "opacity-50" : ""}`}
          >
            {items?.map((s, i) => (
              <li key={s.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <Link
                  href={s.href}
                  onClick={() => setOpen(false)}
                  onPointerEnter={() => setActive(i)}
                  className={`flex items-center gap-3 px-3 py-2 transition-colors ${i === active ? "bg-white/[0.08]" : ""}`}
                >
                  <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded-[6px] bg-card">
                    {s.cover && (
                      <RetryImg
                        src={s.cover}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 size-full object-cover"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-callout block truncate">{s.title}</span>
                    {s.meta && <span className="t-caption block truncate text-secondary">{s.meta}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {loading && (
            <p className="t-footnote flex items-center gap-2 px-3 py-3 text-secondary">
              <span className="size-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
              Searching…
            </p>
          )}
          {fresh && !fresh.length && (
            <p className="t-footnote px-3 py-3 text-secondary">No quick matches. Search every source below.</p>
          )}
          <button
            type="button"
            onClick={searchAll}
            className="t-footnote flex w-full items-center gap-2 border-t-[0.5px] border-white/10 px-3 py-3 text-left text-accent transition-colors hover:bg-white/[0.06]"
          >
            <SearchIcon className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">See all results for “{term}”</span>
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </form>
  );
}
