import Link from "next/link";
import { Suspense } from "react";
import {
  browseSeries,
  getLatestUpdates,
  getStats,
  type LatestEntry,
  type SeriesType,
} from "@/lib/catalog";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
import { ContinueReading } from "@/components/ContinueReading";
import { Cover, SeriesCard } from "@/components/SeriesCard";
import { Shelf, ShelfItem } from "@/components/Shelf";
import { TimeAgo } from "@/components/TimeAgo";

export default function Home() {
  return (
    <div className="space-y-14 pb-8">
      <Suspense fallback={<div className="skeleton h-[600px]" />}>
        <Featured />
      </Suspense>
      <ContinueReading />
      <Suspense fallback={<ShelfSkeleton />}>
        <TopCharts />
      </Suspense>
      <Suspense fallback={<ShelfSkeleton />}>
        <SeriesShelf
          title="Highest Rated"
          order="rating"
          href="/series?order=rating"
        />
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
      <Suspense fallback={<ShelfSkeleton />}>
        <SeriesShelf
          title="New Arrivals"
          order="createdAt"
          href="/series?order=createdAt"
        />
      </Suspense>
    </div>
  );
}

async function Featured() {
  let { series } = await browseSeries({
    source: "asura",
    order: "followedCount",
    limit: 8,
  });
  if (!series.length)
    ({ series } = await browseSeries({
      source: "mangadex",
      order: "followedCount",
      limit: 8,
    }));
  if (!series.length)
    return (
      <div className="px-8 py-20 text-secondary">
        The catalog is unavailable. Try Browse or Anime.
      </div>
    );
  const stats = await getStats(series.map((s) => s.id));
  return <FeaturedCarousel items={series} stats={stats} />;
}

async function TopCharts() {
  const { series } = await browseSeries({
    source: "asura",
    order: "followedCount",
    limit: 10,
    page: 2,
  });
  return (
    <Shelf title="Top 10 Trending" href="/series">
      {series.map((s, idx) => (
        <ShelfItem key={s.id} className="w-[226px] sm:w-[240px]">
          <Link href={`/series/${s.id}`} className="group flex items-end">
            <span
              aria-hidden
              className="display relative z-10 -mr-4 w-[84px] shrink-0 text-right text-[112px] leading-[0.78] font-bold text-black [-webkit-text-stroke:2px_rgba(255,255,255,0.45)]"
            >
              {idx + 1}
            </span>
            <Cover
              cover={s.cover}
              alt={s.title}
              sizes="160px"
              className="aspect-[2/3] w-[140px] shrink-0 sm:w-[156px]"
            />
          </Link>
          <Link
            href={`/series/${s.id}`}
            className="mt-2.5 ml-[68px] line-clamp-1 block text-[13px] font-medium"
          >
            {s.title}
          </Link>
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
  const { series } = await browseSeries({
    source: "mangadex",
    type,
    order,
    limit: 16,
  });
  const stats = await getStats(series.map((s) => s.id));
  return (
    <Shelf title={title} href={href}>
      {series.map((s) => (
        <ShelfItem key={s.id}>
          <SeriesCard series={s} stats={stats[s.id]} sizes="170px" />
        </ShelfItem>
      ))}
    </Shelf>
  );
}

async function Latest() {
  const entries = await getLatestUpdates("manhwa");
  return (
    <section className="mx-auto max-w-[1400px] px-5 sm:px-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="display text-[22px] font-semibold">Latest Updates</h2>
        <Link
          href="/series?order=latestUploadedChapter"
          className="text-[13px] text-accent hover:underline"
        >
          See All
        </Link>
      </div>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((e) => (
          <LatestRow key={e.series.id} entry={e} />
        ))}
      </div>
    </section>
  );
}

function LatestRow({ entry: { series, chapters } }: { entry: LatestEntry }) {
  return (
    <article className="group/row flex gap-4 border-b border-hairline py-4">
      <Link href={`/series/${series.id}`} className="group shrink-0">
        <Cover
          cover={series.cover}
          alt={series.title}
          sizes="90px"
          className="aspect-[2/3] w-[78px]"
        />
      </Link>
      <div className="min-w-0 flex-1 py-0.5">
        <Link
          href={`/series/${series.id}`}
          className="line-clamp-1 text-[15px] font-semibold hover:text-accent"
        >
          {series.title}
        </Link>
        <ul className="mt-2 space-y-0.5">
          {chapters.map((c, i) => (
            <li key={c.id}>
              <Link
                href={`/series/${series.id}/chapter/${c.id}`}
                className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-fill"
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
                  className="shrink-0 text-[12px] text-tertiary"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function ShelfSkeleton() {
  return (
    <div className="space-y-3 px-5 sm:px-8">
      <div className="skeleton h-7 w-48 rounded-md" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="skeleton aspect-[2/3] w-[170px] shrink-0 rounded-[10px]"
          />
        ))}
      </div>
    </div>
  );
}

function LatestSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 px-5 sm:grid-cols-2 sm:px-8 xl:grid-cols-3">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="skeleton h-[140px] rounded-xl" />
      ))}
    </div>
  );
}
