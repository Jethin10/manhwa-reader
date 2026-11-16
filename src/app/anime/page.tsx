import Link from "next/link";
import { Fragment, Suspense } from "react";
import { connection } from "next/server";
import { browseAnime } from "@/lib/anime";
import { AnimeCard } from "@/components/AnimeLibrary";
import { Billboard } from "@/components/Billboard";
import { ContinueRow } from "@/components/ContinueRow";
import { Shelf, ShelfItem } from "@/components/Shelf";
import { SectionHeader } from "@/components/SectionHeader";
import { LandingSkeleton } from "@/components/Skeletons";
import { coverSrc } from "@/lib/images";
import { dayNumber, errorText } from "@/lib/format";

export const metadata = { title: "Anime" };
const categories = [
  ["popular", "Most Popular"],
  ["airing", "Airing Now"],
  ["latest", "New Episodes"],
  ["dub", "English Dub"],
];
export default function AnimePage({ searchParams }: PageProps<"/anime">) {
  return (
    <Suspense
      fallback={<LandingSkeleton />}
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
  if (!q && !sp.category && !sp.page) return <AnimeHome />;
  const category = categories.some(([id]) => id === sp.category)
    ? String(sp.category)
    : "popular";
  const page = Math.max(1, Number(sp.page) || 1);
  let result;
  try {
    result = await browseAnime(q, category, page);
  } catch (e) {
    return (
      <div className="gutter mx-auto max-w-3xl py-20">
        <h1 className="t-large">Anime</h1>
        <p role="alert" className="t-callout mt-3 text-secondary">
          {errorText(e, "The anime catalog isn't responding. Try again in a moment.")}
        </p>
        <Link href="/anime" className="btn btn-primary mt-6">
          Try again
        </Link>
      </div>
    );
  }
  const label = categories.find(([id]) => id === category)?.[1] ?? "Anime";
  return (
    <div className="pb-16">
      <div className="gutter mx-auto max-w-[2560px]">
        <SectionHeader
          title={q ? `Results for “${q}”` : label}
          back={{ href: "/anime", label: "Anime" }}
        />
        <nav
          aria-label="Anime categories"
          className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-auto px-5 pb-2 sm:mx-0 sm:px-0"
        >
          {categories.map(([id, name]) => (
            <Link
              key={id}
              href={`/anime?category=${id}`}
              aria-current={category === id && !q ? "page" : undefined}
              className="chip"
            >
              {name}
            </Link>
          ))}
        </nav>
        <div className="mt-6 grid grid-cols-3 gap-x-2.5 gap-y-6 sm:grid-cols-4 sm:gap-x-3.5 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 min-[1800px]:grid-cols-9">
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
              className="btn btn-gray"
            >
              Previous
            </Link>
          )}
          {result.hasNext && (
            <Link
              href={`/anime?category=${category}&q=${encodeURIComponent(q)}&page=${page + 1}`}
              className="btn btn-gray"
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

const ROWS = [
  ["popular", "Most Popular"],
  ["airing", "Airing Now"],
  ["latest", "New Episodes"],
  ["dub", "English Dub"],
] as const;

/** The Anime tab: a feature and rows to browse, like Home and Movies. */
async function AnimeHome() {
  await connection();
  const rows = await Promise.all(
    ROWS.map(([id, title]) =>
      browseAnime("", id, 1)
        .then((r) => ({ id, title, items: r.items }))
        .catch(() => ({ id, title, items: [] as Awaited<ReturnType<typeof browseAnime>>["items"] })),
    ),
  );
  const pool = rows[1].items.length ? rows[1].items : rows[0].items;
  const featured = pool.length
    ? pool[dayNumber() % Math.min(8, pool.length)]
    : null;
  if (!rows.some((r) => r.items.length))
    return (
      <div className="gutter mx-auto max-w-3xl py-20">
        <h1 className="t-large">Anime</h1>
        <p role="alert" className="t-callout mt-3 text-secondary">
          The anime catalog isn&apos;t responding. Try again in a moment.
        </p>
        <Link href="/anime" className="btn btn-primary mt-6">
          Try again
        </Link>
      </div>
    );
  return (
    <div className="pb-12">
      {featured && (
        <Billboard
          item={{
            title: featured.title,
            image: coverSrc(featured.cover, 960),
            portrait: true,
            mosaic: [
              ...new Map(
                rows.flatMap((r) => r.items).map((a) => [a.id, a] as const),
              ).values(),
            ]
              .filter((a) => a.id !== featured.id && a.cover)
              .slice(0, 28)
              .map((a) => coverSrc(a.cover, 320)),
            kicker: rows[1].items.length ? "Airing now" : "Popular anime",
            facts: [
              featured.format,
              featured.sub > 0 && `${featured.sub} episodes`,
              featured.dub > 0 && "English dub",
            ],
            description: "",
            play: `/anime/${featured.id}`,
            save: {
              id: featured.id,
              media: "anime",
              title: featured.title,
              cover: featured.cover,
              type: "Anime",
            },
          }}
        />
      )}
      <div className="after-billboard mt-8 space-y-8 lg:space-y-10">
        {rows
          .filter((r) => r.items.length)
          .map((row, i) => (
            <Fragment key={row.id}>
              <Shelf title={row.title} href={`/anime?category=${row.id}`}>
                {row.items.slice(0, 20).map((a) => (
                  <ShelfItem key={a.id}>
                    <AnimeCard anime={a} />
                  </ShelfItem>
                ))}
              </Shelf>
              {i === 0 && <ContinueRow media={["anime"]} />}
            </Fragment>
          ))}
      </div>
    </div>
  );
}
