import Link from "next/link";
import { Suspense } from "react";
import { browseAnime } from "@/lib/anime";
import { AnimeCard, ContinueWatching } from "@/components/AnimeLibrary";
import { coverSrc } from "@/lib/images";

export const metadata = { title: "Anime" };
const categories = [
  ["popular", "Popular"],
  ["latest", "Recently updated"],
  ["airing", "Airing now"],
  ["dub", "English dub"],
];
export default function AnimePage({ searchParams }: PageProps<"/anime">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1400px] px-5 py-20">
          <div className="skeleton h-80 rounded-3xl" />
          <p className="mt-6 text-secondary">Loading anime...</p>
        </div>
      }
    >
      <AnimeContent searchParams={searchParams} />
    </Suspense>
  );
}
async function AnimeContent({
  searchParams,
}: {
  searchParams: PageProps<"/anime">["searchParams"];
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const category = categories.some(([id]) => id === sp.category)
    ? String(sp.category)
    : "popular";
  const page = Math.max(1, Number(sp.page) || 1);
  let result;
  try {
    result = await browseAnime(q, category, page);
  } catch (e) {
    return (
      <div className="mx-auto max-w-[1000px] px-5 py-20">
        <h1 className="t-large">Anime</h1>
        <p role="alert" className="mt-6 text-secondary">
          {e instanceof Error ? e.message : "Catalog unavailable."}
        </p>
        <Link
          href="/anime"
          className="mt-5 inline-block rounded-full bg-white px-6 py-3 text-black"
        >
          Try again
        </Link>
      </div>
    );
  }
  const featured = result.items[0];
  return (
    <div className="pb-16">
      {!q && page === 1 && featured && (
        <section className="relative isolate overflow-hidden border-b border-hairline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc(featured.cover, 1280)}
            alt=""
            className="absolute inset-0 -z-20 size-full object-cover object-top opacity-35 blur-2xl"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black via-black/75 to-black/20" />
          <div className="mx-auto flex max-w-[1400px] flex-col-reverse items-start gap-8 px-5 py-12 sm:flex-row sm:items-center sm:px-8 md:gap-16 md:py-20">
            <div className="max-w-2xl flex-1">
              <p className="text-sm font-medium text-accent">
                Your next obsession
              </p>
              <h1 className="display mt-4 text-balance text-4xl font-bold leading-[1.06] sm:text-6xl">
                {featured.title}
              </h1>
              <p className="mt-5 text-sm text-secondary">
                {featured.format}
                {featured.sub > 0 && ` · ${featured.sub} subtitled episodes`}
                {featured.dub > 0 && ` · ${featured.dub} dubbed episodes`}
              </p>
              <Link
                href={`/anime/${featured.id}`}
                className="mt-8 inline-flex items-center gap-3 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black transition hover:bg-white/85"
              >
                <span aria-hidden>▶</span> Start watching
              </Link>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverSrc(featured.cover, 640)}
              alt={featured.title}
              className="aspect-[2/3] w-[120px] rounded-2xl object-cover shadow-2xl ring-1 ring-white/10 sm:w-[230px] lg:w-[280px]"
            />
          </div>
        </section>
      )}
      <div className="gutter mx-auto max-w-[1440px]">
        <ContinueWatching />
        <div className="mt-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="t-title1">
              {q ? `Results for "${q}"` : "Find your anime"}
            </h2>
            <p className="mt-2 text-sm text-secondary">
              Choose an episode, then pick sub or dub and a playback server.
            </p>
          </div>
          <form action="/anime" className="flex w-full gap-2 sm:w-auto">
            <input type="hidden" name="category" value={category} />
            <input
              name="q"
              defaultValue={q}
              aria-label="Search anime"
              placeholder="Search anime..."
              className="h-11 min-w-0 flex-1 rounded-xl bg-fill px-4 text-sm outline-none focus:ring-2 focus:ring-accent sm:w-64"
            />
            <button className="rounded-full bg-white px-5 text-sm font-semibold text-black">
              Search
            </button>
          </form>
        </div>
        <nav
          aria-label="Anime categories"
          className="no-scrollbar mt-6 flex gap-2 overflow-auto pb-2"
        >
          {categories.map(([id, label]) => (
            <Link
              key={id}
              href={`/anime?category=${id}`}
              className={`shrink-0 rounded-full px-5 py-2 text-sm transition ${category === id && !q ? "bg-white text-black" : "bg-fill text-secondary hover:bg-fill-2"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {result.items.map((a) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
        {!result.items.length && (
          <p className="py-20 text-center text-secondary">
            No anime found. Try another title.
          </p>
        )}
        <div className="mt-12 flex justify-center gap-3">
          {page > 1 && (
            <Link
              href={`/anime?category=${category}&q=${encodeURIComponent(q)}&page=${page - 1}`}
              className="rounded-full bg-fill px-6 py-3 text-sm"
            >
              Previous
            </Link>
          )}
          {result.hasNext && (
            <Link
              href={`/anime?category=${category}&q=${encodeURIComponent(q)}&page=${page + 1}`}
              className="rounded-full bg-fill px-6 py-3 text-sm"
            >
              Next page
            </Link>
          )}
        </div>
        <p className="mt-12 text-xs text-tertiary">
          Episode and server availability comes from HiAnime.tr, an independent
          site using the HiAnime name.
        </p>
      </div>
    </div>
  );
}
