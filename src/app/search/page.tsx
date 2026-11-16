import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { browseAnime } from "@/lib/anime";
import { browseSeries, getStats } from "@/lib/catalog";
import { searchMovies } from "@/lib/movies";
import { PROVIDERS } from "@/lib/sources";
import { AnimeCard } from "@/components/AnimeLibrary";
import { MovieCard } from "@/components/MovieLibrary";
import { SearchBox } from "@/components/SearchBox";
import { SeriesCard } from "@/components/SeriesCard";
import { Shelf, ShelfItem } from "@/components/Shelf";
import { RowSkeleton } from "@/components/Skeletons";

export const metadata = { title: "Search" };

const EXPLORE = [
  { label: "Trending anime", href: "/anime?category=popular" },
  { label: "Airing now", href: "/anime?category=airing" },
  { label: "English dub", href: "/anime?category=dub" },
  { label: "Popular movies", href: "/movies?category=popular" },
  { label: "New movies", href: "/movies?category=new" },
  { label: "Telugu picks", href: "/movies?category=telugu" },
  { label: "Indian picks", href: "/movies?category=indian" },
  { label: "Popular manhwa", href: "/series?type=manhwa&order=followedCount" },
  { label: "Top rated manhwa", href: "/series?order=rating" },
  { label: "Latest chapters", href: "/series?order=latestUploadedChapter&type=all" },
  { label: "Manga", href: "/manga" },
  { label: "Manhua", href: "/series?type=manhua" },
  { label: "Completed series", href: "/series?status=completed&source=mangadex" },
  { label: "Recently added", href: "/series?order=createdAt" },
];

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="pt-3 pb-8 lg:pt-8">
      <Suspense fallback={<SearchHead q="" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function SearchHead({ q }: { q: string }) {
  return (
    <div className="gutter mx-auto max-w-[2560px]">
      <h1 className="t-title1 sm:t-large">Search</h1>
      <div className="mt-4 max-w-2xl">
        <SearchBox key={q} large autoFocus={!q} initial={q} />
      </div>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  return (
    <>
      <SearchHead q={q} />
      {q ? (
        <div className="mt-8 space-y-8 lg:space-y-10">
          <Suspense fallback={<RowSkeleton title="Anime" />}>
            <AnimeResults q={q} />
          </Suspense>
          <Suspense fallback={<RowSkeleton title="Movies" />}>
            <MovieResults q={q} />
          </Suspense>
          <Suspense fallback={<RowSkeleton title="Manhwa & Manga" />}>
            <ComicResults q={q} />
          </Suspense>
          <p className="gutter t-footnote mx-auto max-w-[2560px] text-secondary">
            Not finding it? Try the original or English title, or an IMDb ID
            such as tt0111161 for movies.
          </p>
        </div>
      ) : (
        <Explore />
      )}
    </>
  );
}

async function AnimeResults({ q }: { q: string }) {
  await connection();
  const items = await browseAnime(q, "popular", 1)
    .then((r) => r.items)
    .catch(() => []);
  return (
    <ResultRow title="Anime" href={`/anime?q=${encodeURIComponent(q)}`} empty={!items.length}>
      {items.slice(0, 20).map((a) => (
        <ShelfItem key={a.id}>
          <AnimeCard anime={a} />
        </ShelfItem>
      ))}
    </ResultRow>
  );
}

async function MovieResults({ q }: { q: string }) {
  await connection();
  const items = await searchMovies(q)
    .then((r) => r.items)
    .catch(() => []);
  return (
    <ResultRow title="Movies" href={`/movies?q=${encodeURIComponent(q)}`} empty={!items.length}>
      {items.slice(0, 20).map((m) => (
        <ShelfItem key={m.id}>
          <MovieCard movie={m} />
        </ShelfItem>
      ))}
    </ResultRow>
  );
}

async function ComicResults({ q }: { q: string }) {
  await connection();
  const series = await browseSeries({ q, type: "all", order: "relevance", limit: 20 })
    .then((r) => r.series)
    .catch(() => []);
  const stats: Awaited<ReturnType<typeof getStats>> = series.length
    ? await getStats(series).catch(() => ({}))
    : {};
  return (
    <ResultRow
      title="Manhwa & Manga"
      href={`/series?type=all&q=${encodeURIComponent(q)}`}
      empty={!series.length}
    >
      {series.slice(0, 20).map((s) => (
        <ShelfItem key={s.id}>
          <SeriesCard series={s} stats={stats[s.id]} />
        </ShelfItem>
      ))}
    </ResultRow>
  );
}

function ResultRow({
  title,
  href,
  empty,
  children,
}: {
  title: string;
  href: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (empty)
    return (
      <section className="gutter mx-auto max-w-[2560px]">
        <h2 className="t-title3 sm:t-title2">{title}</h2>
        <p className="t-footnote mt-1 text-secondary">No matches.</p>
      </section>
    );
  return (
    <Shelf title={title} href={href}>
      {children}
    </Shelf>
  );
}

function Explore() {
  return (
    <div className="gutter mx-auto mt-10 max-w-[2560px]">
      <h2 className="t-title3 sm:t-title2">Explore</h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {EXPLORE.map((c) => (
          <li key={c.label}>
            <Link href={c.href} prefetch={false} className="chip">
              {c.label}
            </Link>
          </li>
        ))}
      </ul>

      <details className="disclosure mt-12 max-w-2xl border-t border-hairline pt-2">
        <summary className="t-footnote text-secondary">
          Where comics come from
        </summary>
        <p className="t-footnote pb-3 text-secondary">
          Titles are matched across every source. Each chapter opens from the
          highest-quality copy available, and switches to another source if one
          is down.
        </p>
        <ul className="grouped mb-4">
          {PROVIDERS.map((p) => (
            <li key={p.id} className="row-divider">
              <Link
                href={`/series?source=${p.id}&type=all`}
                prefetch={false}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]"
              >
                <span className="min-w-0 flex-1">
                  <span className="t-callout block">{p.name}</span>
                  <span className="t-footnote block text-secondary">{p.note}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
