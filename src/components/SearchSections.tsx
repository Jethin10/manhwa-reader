"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SearchBox, type SearchSection } from "./SearchBox";

export function SearchSections() {
  const params = useSearchParams();
  const section: SearchSection =
    params.get("section") === "anime" ? "anime" : "manga";
  return (
    <div className="space-y-4">
      <nav
        aria-label="Search section"
        className="inline-flex rounded-full bg-fill p-1"
      >
        {(["manga", "anime"] as const).map((value) => (
          <Link
            key={value}
            href={`/search?section=${value}`}
            aria-current={section === value ? "page" : undefined}
            className={`rounded-full px-7 py-2 text-sm font-medium transition-colors ${section === value ? "bg-white text-black shadow-sm" : "text-secondary hover:text-label"}`}
          >
            {value === "anime" ? "Anime" : "Manga"}
          </Link>
        ))}
      </nav>
      <SearchBox large section={section} />
      <p className="t-footnote text-secondary">
        {section === "anime"
          ? "Find anime series and movies to watch."
          : "Find manga, manhwa, and manhua to read."}
      </p>
    </div>
  );
}
