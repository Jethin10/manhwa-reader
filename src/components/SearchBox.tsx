"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "./Icons";

export function SearchBox({ large, autoFocus }: { large?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const term = encodeURIComponent(q.trim());
        const path = window.location.pathname;
        router.push(
          path.startsWith("/manga")
            ? `/manga?q=${term}`
            : path.startsWith("/anime")
              ? `/anime?q=${term}`
              : term
                ? `/series?q=${term}&type=all`
                : "/series",
        );
      }}
      className={`flex items-center gap-2 bg-fill transition-colors focus-within:bg-fill-2 ${
        large ? "h-11 rounded-[12px] px-3.5" : "h-9 rounded-[10px] px-3"
      }`}
    >
      <SearchIcon className={large ? "size-[18px] text-secondary" : "size-[15px] text-secondary"} />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        // Mobile keyboards show a "Search" key and don't autocorrect titles.
        type="search"
        enterKeyHint="search"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={large ? "Titles, authors, genres" : "Search"}
        aria-label="Search titles"
        className={`w-full bg-transparent outline-none placeholder:text-secondary [&::-webkit-search-cancel-button]:hidden ${
          large ? "t-body" : "t-footnote"
        }`}
      />
    </form>
  );
}
