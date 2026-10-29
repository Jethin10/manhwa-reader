"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, SearchIcon } from "./Icons";

export type SearchSection = "manga" | "anime";

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
  const target =
    section === "anime" ? "/anime" : mangaOnly ? "/manga" : "/series";
  const label = section === "anime" ? "Search anime" : "Search manga";
  return (
    <form
      role="search"
      aria-label={label}
      action={target}
      onSubmit={(e) => {
        e.preventDefault();
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (target === "/series") params.set("type", "all");
        router.push(`${target}${params.size ? `?${params}` : ""}`);
      }}
      className={`flex items-center gap-2 bg-fill transition-colors focus-within:bg-fill-2 ${
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
        onChange={(e) => setQ(e.target.value)}
        // Mobile keyboards show a "Search" key and don't autocorrect titles.
        type="search"
        enterKeyHint="search"
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
    </form>
  );
}
