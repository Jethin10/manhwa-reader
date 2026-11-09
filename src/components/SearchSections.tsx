"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SearchBox, type SearchSection } from "./SearchBox";

export function SearchSections() {
  const params = useSearchParams();
  const section: SearchSection =
    params.get("section") === "movies" ? "movies" : params.get("section") === "anime" ? "anime" : "manga";
  return (
    <div className="space-y-4">
      <nav
        aria-label="Search section"
        className="grid grid-cols-3 rounded-full bg-fill p-1 sm:inline-grid"
      >
        {(["manga", "anime", "movies"] as const).map((value) => (
          <Link
            key={value}
            href={`/search?section=${value}`}
            aria-current={section === value ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-full px-3 text-sm font-medium transition-colors sm:px-7 ${section === value ? "bg-white text-black shadow-sm" : "text-secondary hover:text-label"}`}
          >
            {value === "movies" ? "Movies" : value === "anime" ? "Anime" : "Manga"}
          </Link>
        ))}
      </nav>
      <SearchBox key={section} large section={section} />
      <p className="t-footnote text-secondary">
        {section === "movies" ? "Find movies, including Indian and Telugu titles." : section === "anime"
          ? "Find anime series and movies to watch."
          : "Find manga, manhwa, and manhua to read."}
      </p>
    </div>
  );
}
