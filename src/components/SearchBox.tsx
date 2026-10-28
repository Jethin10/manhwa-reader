"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "./Icons";

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const anime = window.location.pathname.startsWith("/anime");
        router.push(
          window.location.pathname.startsWith("/manga")
            ? `/manga?q=${encodeURIComponent(q.trim())}`
            : anime
              ? `/anime?q=${encodeURIComponent(q.trim())}`
              : q.trim()
                ? `/series?q=${encodeURIComponent(q.trim())}&type=all`
                : "/series",
        );
      }}
      className="flex h-8 items-center gap-2 rounded-[9px] bg-fill px-2.5 transition-colors focus-within:bg-fill-2"
    >
      <SearchIcon className="size-[15px] text-secondary" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        aria-label="Search titles"
        className="w-full bg-transparent text-[13px] outline-none placeholder:text-secondary"
      />
    </form>
  );
}
