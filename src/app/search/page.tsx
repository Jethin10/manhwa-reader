import Link from "next/link";
import { Suspense } from "react";
import { SearchSections } from "@/components/SearchSections";
import { ChevronRight } from "@/components/Icons";
import { PROVIDERS } from "@/lib/sources";

export const metadata = { title: "Search" };

const CATEGORIES = [
  {
    label: "Manhwa",
    href: "/series?type=manhwa",
    tint: "from-[#0a84ff] to-[#0040a8]",
  },
  { label: "Manga", href: "/manga", tint: "from-[#ff375f] to-[#8f0f2c]" },
  {
    label: "Manhua",
    href: "/series?type=manhua",
    tint: "from-[#ff9f0a] to-[#9c4a00]",
  },
  { label: "Anime", href: "/anime", tint: "from-[#bf5af2] to-[#5b1b80]" },
  {
    label: "New Releases",
    href: "/series?order=latestUploadedChapter&type=all",
    tint: "from-[#30d158] to-[#0b6b2a]",
  },
  {
    label: "Top Rated",
    href: "/series?order=rating",
    tint: "from-[#64d2ff] to-[#0a5f80]",
  },
  {
    label: "Completed",
    href: "/series?status=completed&source=mangadex",
    tint: "from-[#5e5ce6] to-[#26246e]",
  },
  {
    label: "Recently Added",
    href: "/series?order=createdAt",
    tint: "from-[#ff6961] to-[#7a1d18]",
  },
];

export default function SearchPage() {
  return (
    <div className="gutter mx-auto max-w-[1100px] pt-6 lg:pt-12">
      <h1 className="t-large">Search</h1>
      <div className="mt-4">
        <Suspense fallback={<div className="skeleton h-32 rounded-xl" />}>
          <SearchSections />
        </Suspense>
      </div>

      <h2 className="t-title3 mt-10">Browse Categories</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {CATEGORIES.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`pressable relative flex aspect-[16/10] items-end overflow-hidden rounded-[14px] bg-gradient-to-br p-4 ${c.tint}`}
          >
            <span className="t-headline relative z-10 text-white">
              {c.label}
            </span>
            <span
              className="absolute -top-6 -right-6 size-24 rounded-full bg-white/10"
              aria-hidden
            />
          </Link>
        ))}
      </div>

      <h2 className="t-title3 mt-10">Sources</h2>
      <p className="t-footnote mt-1 text-secondary">
        Titles are matched across every source. Each chapter opens from the
        highest-quality copy available, and switches to another source if one is
        down.
      </p>
      <ul className="grouped mt-4">
        {PROVIDERS.map((p) => (
          <li key={p.id} className="row-divider">
            <Link
              href={`/series?source=${p.id}&type=all`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] active:bg-white/[0.08]"
            >
              <span className="grid size-8 place-items-center rounded-[8px] bg-fill text-[13px] font-semibold">
                {p.name[0]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-callout block">{p.name}</span>
                <span className="t-footnote block text-secondary">
                  {p.note}
                </span>
              </span>
              <QualityDots value={p.quality} />
              <ChevronRight className="size-4 text-tertiary" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QualityDots({ value }: { value: number }) {
  return (
    <span className="flex gap-[3px]" aria-label={`Image quality ${value} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`size-[5px] rounded-full ${i < value ? "bg-accent" : "bg-fill-2"}`}
        />
      ))}
    </span>
  );
}
