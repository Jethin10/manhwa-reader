import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  browseSeries,
  getLatestUpdates,
  getStats,
  type LatestEntry,
  type SeriesType,
} from "@/lib/catalog";
import { ContinueReading } from "@/components/ContinueReading";
import { AnimeCard, ContinueWatching } from "@/components/AnimeLibrary";
import { ContinueMovies, MovieCard } from "@/components/MovieLibrary";
import { Billboard, type BillboardItem } from "@/components/Billboard";
import { browseAnime } from "@/lib/anime";
import { browseMovies } from "@/lib/movies";
import type { MovieCategory } from "@/lib/movie-types";
import { coverSrc } from "@/lib/images";
import { Cover, SeriesCard } from "@/components/SeriesCard";
import { Shelf, ShelfItem } from "@/components/Shelf";
import { TimeAgo } from "@/components/TimeAgo";

type BrowseOpts = Parameters<typeof browseSeries>[0];

/**
 * A source being down hides its shelf instead of failing the whole home page. Shelves render
 * per request (cached for minutes), so builds never depend on a source being reachable.
 */
async function browseOrEmpty(opts: BrowseOpts) {
  await connection();
  return browseSeries(opts).catch(() => ({ series: [] as Awaited<ReturnType<typeof browseSeries>>["series"] }));
}

export default function Home() {
  return (
    <div className="space-y-10 pb-8 lg:space-y-12">
      <Suspense fallback={<HeroSkeleton />}>
        <Feature />
      </Suspense>
      <ContinueReading />
      <ContinueWatching />
      <div className="gutter mx-auto max-w-[1440px] empty:hidden">
        <ContinueMovies />
      </div>
      <Suspense fallback={<ShelfSkeleton />}>
        <MovieShelf title="Popular Movies" category="popular" />
      </Suspense>
      <Suspense fallback={<ShelfSkeleton />}>
        <AnimeShelf title="Trending Anime" category="popular" />
      </Suspense>
      <Suspense fallback={<ShelfSkeleton />}>
        <TopCharts />
      </Suspense>
      <Suspense fallback={<ShelfSkeleton />}>
        <AnimeShelf title="Airing Now" category="airing" />
      </Suspense>
      <Suspense fallback={<ShelfSkeleton />}>
        <MovieShelf title="New Releases" category="new" />
      </Suspense>
      <Suspense fallback={<ShelfSkeleton />}>
        <SeriesShelf
          title="Highest Rated Manhwa"
          order="rating"
          href="/series?order=rating"
        />
      </Suspense>
      <Suspense fallback={<ShelfSkeleton />}>
        <MovieShelf title="Telugu Picks" category="telugu" />
      </Suspense>
      <Suspense fallback={<ShelfSkeleton />}>
        <SeriesShelf
          title="Explore Manga"
          order="followedCount"
          type="manga"
          href="/manga"
        />
      </Suspense>
      <Suspense fallback={<LatestSkeleton />}>
        <Latest />
      </Suspense>
    </div>
  );
}

const dayNumber = () => Math.floor(Date.now() / 86_400_000);

/** One feature a day, from movies or, if they're unavailable, anime. */
async function Feature() {
  await connection();
  const [movies, anime] = await Promise.all([
    browseMovies("popular", 1).catch(() => ({ items: [] })),
    browseAnime("", "popular", 1).catch(() => ({ items: [] })),
  ]);
  const day = dayNumber();
  const films = movies.items
    .filter((m) => m.background && m.description)
    .slice(0, 10);
  const shows = anime.items.filter((a) => a.cover).slice(0, 10);
  let item: BillboardItem | null = null;
  if (films.length) {
    const m = films[day % films.length];
    item = {
      title: m.title,
      image: m.background,
      kicker: "Movie of the day",
      facts: [m.year, m.rating && `IMDb ${m.rating}`, m.runtime].filter(Boolean),
      description: m.description,
      play: `/movies/${m.id}?watch=1`,
      info: `/movies/${m.id}`,
    };
  } else if (shows.length) {
    const a = shows[day % shows.length];
    item = {
      title: a.title,
      image: coverSrc(a.banner ?? a.cover, 1280),
      kicker: "Anime of the day",
      facts: [`${a.sub} episodes`],
      description: "",
      play: `/anime/${a.id}`,
      info: `/anime/${a.id}`,
    };
  }
  return item ? <Billboard item={item} /> : null;
}

async function MovieShelf({
  title,
  category,
}: {
  title: string;
  category: MovieCategory;
}) {
  await connection();
  const items = await browseMovies(category, 1)
    .then((r) => r.items)
    .catch(() => []);
  if (!items.length) return null;
  return (
    <Shelf title={title} href={`/movies?category=${category}`}>
      {items.slice(0, 16).map((movie) => (
        <ShelfItem key={movie.id}>
          <MovieCard movie={movie} />
        </ShelfItem>
      ))}
    </Shelf>
  );
}

async function AnimeShelf({
  title,
  category,
}: {
  title: string;
  category: string;
}) {
  await connection();
  const items = await browseAnime("", category, 1)
    .then((r) => r.items)
    .catch(() => []);
  if (!items.length) return null;
  return (
    <Shelf title={title} href={`/anime?category=${category}`}>
      {items.slice(0, 16).map((anime) => (
        <ShelfItem key={anime.id}>
          <AnimeCard anime={anime} />
        </ShelfItem>
      ))}
    </Shelf>
  );
}

async function TopCharts() {
  const { series } = await browseOrEmpty({
    source: "asura",
    order: "followedCount",
    limit: 12,
    page: 2,
  });
  if (!series.length) return null;
  const columns: (typeof series)[] = [];
  for (let i = 0; i < series.length; i += 3) columns.push(series.slice(i, i + 3));
  return (
    <Shelf title="Top Manhwa" href="/series">
      {columns.map((col, c) => (
        <ShelfItem key={c} className="w-[calc(100vw-56px)] max-w-[380px] sm:w-[360px]">
          <ol>
            {col.map((s, r) => (
              <li key={s.id} className="row-divider">
                <Link href={`/series/${s.id}`} className="group pressable flex items-center gap-3.5 py-2.5">
                  <Cover cover={s.cover} alt={s.title} sizes="64px" className="aspect-[2/3] w-[56px] shrink-0 rounded-[8px]" />
                  <span className="t-headline w-5 shrink-0 text-center tabular-nums">{c * 3 + r + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="t-sub line-clamp-1 font-medium">{s.title}</span>
                    <span className="t-footnote line-clamp-1 text-secondary">
                      {[s.type, s.tags.find((t) => t.group === "genre")?.name].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </ShelfItem>
      ))}
    </Shelf>
  );
}

async function SeriesShelf({
  title,
  order,
  href,
  type = "manhwa",
}: {
  title: string;
  type?: SeriesType;
  order: "rating" | "createdAt" | "followedCount";
  href: string;
}) {
  const { series } = await browseOrEmpty({
    source: "mangadex",
    type,
    order,
    limit: 16,
  });
  if (!series.length) return null;
  const stats = await getStats(series);
  return (
    <Shelf title={title} href={href}>
      {series.map((s) => (
        <ShelfItem key={s.id}>
          <SeriesCard series={s} stats={stats[s.id]} sizes="(min-width: 640px) 164px, 132px" />
        </ShelfItem>
      ))}
    </Shelf>
  );
}

async function Latest() {
  await connection();
  const entries = await getLatestUpdates("manhwa").catch(() => []);
  if (!entries.length) return null;
  return (
    <section className="gutter mx-auto max-w-[1440px]">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="t-title2">Latest Updates</h2>
        <Link href="/series?order=latestUploadedChapter" className="t-callout text-accent">
          See All
        </Link>
      </div>
      <div className="grid gap-x-10 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((e) => (
          <LatestRow key={e.series.id} entry={e} />
        ))}
      </div>
    </section>
  );
}

function LatestRow({ entry: { series, chapters } }: { entry: LatestEntry }) {
  return (
    <article className="group/row flex gap-4 py-3.5 shadow-[inset_0_-0.5px_0_var(--color-hairline)]">
      <Link href={`/series/${series.id}`} className="group shrink-0">
        <Cover
          cover={series.cover}
          alt={series.title}
          sizes="90px"
          className="aspect-[2/3] w-[72px] rounded-[10px]"
        />
      </Link>
      <div className="min-w-0 flex-1 py-0.5">
        <Link
          href={`/series/${series.id}`}
          className="t-sub line-clamp-1 font-semibold"
        >
          {series.title}
        </Link>
        <ul className="mt-1.5">
          {chapters.map((c, i) => (
            <li key={c.id}>
              <Link
                href={`/series/${series.id}/chapter/${c.id}`}
                className="t-footnote -mx-2 flex min-h-8 items-center justify-between gap-2 rounded-[8px] px-2 py-1 transition-colors hover:bg-fill active:bg-fill-2"
              >
                <span className="flex items-center gap-2 truncate">
                  {i === 0 && (
                    <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                  )}
                  <span className={i === 0 ? "font-medium" : "text-secondary"}>
                    {c.number ? `Chapter ${c.number}` : (c.title ?? "Oneshot")}
                  </span>
                </span>
                <TimeAgo
                  iso={c.readableAt}
                  className="t-caption shrink-0 text-tertiary"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function HeroSkeleton() {
  return (
    <div className="gutter mx-auto max-w-[1440px] pt-3 lg:pt-6">
      <div className="skeleton h-[min(118vw,520px)] rounded-[22px] md:h-[440px] lg:h-[480px]" />
    </div>
  );
}

function ShelfSkeleton() {
  return (
    <div className="gutter mx-auto max-w-[1440px] space-y-3">
      <div className="skeleton h-7 w-48 rounded-md" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="skeleton aspect-[2/3] w-[132px] shrink-0 rounded-[12px] sm:w-[164px]"
          />
        ))}
      </div>
    </div>
  );
}

function LatestSkeleton() {
  return (
    <div className="gutter mx-auto grid max-w-[1440px] gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="skeleton h-[140px] rounded-xl" />
      ))}
    </div>
  );
}
