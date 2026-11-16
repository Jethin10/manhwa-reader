import Link from "next/link";
import { Fragment, Suspense } from "react";
import { connection } from "next/server";
import {
  browseSeries,
  getStats,
  getTags,
  type BrowseOptions,
  type SeriesType,
} from "@/lib/catalog";
import { SOURCES, sourceId } from "@/lib/sources";
import { SeriesCard } from "@/components/SeriesCard";
import { Billboard } from "@/components/Billboard";
import { ContinueRow } from "@/components/ContinueRow";
import { SectionHeader } from "@/components/SectionHeader";
import {
  GridSkeleton,
  HeroSkeleton,
  LandingSkeleton,
  RowSkeleton,
} from "@/components/Skeletons";
import { Shelf, ShelfItem } from "@/components/Shelf";
import { cleanDescription, dayNumber } from "@/lib/format";
import { coverSrc } from "@/lib/images";

type SP = Record<string, string | string[] | undefined>;

const TYPES: { value: SeriesType; label: string }[] = [
  { value: "manhwa", label: "Manhwa" },
  { value: "manga", label: "Manga" },
  { value: "manhua", label: "Manhua" },
  { value: "all", label: "All" },
];
const STATUSES = [
  { value: "", label: "All" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "hiatus", label: "Hiatus" },
  { value: "cancelled", label: "Dropped" },
];
const ORDERS: { value: NonNullable<BrowseOptions["order"]>; label: string }[] =
  [
    { value: "followedCount", label: "Popular" },
    { value: "latestUploadedChapter", label: "Latest Update" },
    { value: "rating", label: "Rating" },
    { value: "createdAt", label: "Newly Added" },
    { value: "title", label: "A-Z" },
  ];

const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? "";

export function BrowseCatalog({
  searchParams,
  initialType = "manhwa",
}: {
  searchParams: Promise<SP>;
  initialType?: SeriesType;
}) {
  return (
    <Suspense fallback={<LandingSkeleton />}>
      <Section searchParams={searchParams} initialType={initialType} />
    </Suspense>
  );
}

/** No filters: the section's landing (feature + rows). Any filter or search: the grid. */
async function Section({
  searchParams,
  initialType,
}: {
  searchParams: Promise<SP>;
  initialType: SeriesType;
}) {
  const sp = await searchParams;
  if (!Object.values(sp).some(Boolean))
    return <ComicsHome type={initialType === "manga" ? "manga" : "manhwa"} />;
  return (
    <div className="gutter mx-auto max-w-[2560px]">
      <Suspense fallback={<GridSkeleton />}>
        <Browse sp={sp} initialType={initialType} />
      </Suspense>
    </div>
  );
}

async function Browse({
  sp,
  initialType,
}: {
  sp: SP;
  initialType: SeriesType;
}) {
  const q = one(sp.q).trim();
  const source = sourceId(
    one(sp.source) || (initialType === "manga" ? "mangadex" : "all"),
  );
  const type = (
    TYPES.some((t) => t.value === one(sp.type)) ? one(sp.type) : initialType
  ) as SeriesType;
  const genre = one(sp.genre);
  const status = one(sp.status);
  const orderRaw = one(sp.order);
  const order = ORDERS.some((o) => o.value === orderRaw)
    ? (orderRaw as BrowseOptions["order"])
    : q
      ? "relevance"
      : "followedCount";
  const page = Math.max(1, parseInt(one(sp.page)) || 1);

  const [tags, result] = await Promise.all([
    source === "mangadex" ? getTags() : Promise.resolve([]),
    browseSeries({
      source,
      q,
      type,
      tags: genre ? [genre] : [],
      status,
      order,
      page,
    }),
  ]);
  const stats = await getStats(result.series);
  const genres = tags.filter((t) => t.group === "genre" || t.group === "theme");

  const pageHref = (p: number) => {
    const u = new URLSearchParams({ source });
    if (q) u.set("q", q);
    if (type !== "manhwa") u.set("type", type);
    if (genre) u.set("genre", genre);
    if (status) u.set("status", status);
    if (orderRaw) u.set("order", orderRaw);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return `${type === "manga" ? "/manga" : "/series"}${s ? `?${s}` : ""}`;
  };

  const select =
    "t-footnote h-9 shrink-0 cursor-pointer appearance-none rounded-full bg-fill px-4 font-medium text-label outline-none transition hover:bg-fill-2 focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-40";
  const typeHref = (t: SeriesType) => {
    const u = new URLSearchParams({ source });
    if (q) u.set("q", q);
    if (t !== "manhwa") u.set("type", t);
    if (genre) u.set("genre", genre);
    if (status) u.set("status", status);
    if (orderRaw) u.set("order", orderRaw);
    const s = u.toString();
    return `${t === "manga" ? "/manga" : "/series"}${s ? `?${s}` : ""}`;
  };
  const heading = q
    ? `Results for “${q}”`
    : ORDERS.find((o) => o.value === orderRaw)?.label === "Latest Update"
      ? "New Releases"
      : type === "manga"
        ? "Manga"
        : "Manhwa & comics";

  const home = type === "manga" ? "/manga" : "/series";
  return (
    <>
      <SectionHeader
        title={heading}
        back={{ href: home, label: type === "manga" ? "Manga" : "Manhwa" }}
        subtitle={
          <>
            {result.total.toLocaleString("en-US")} series
            {source === "all"
              ? " across all sources"
              : ` on ${SOURCES.find((x) => x.id === source)?.name}`}
          </>
        }
      />

      <div className="mt-4 flex flex-col gap-3">
        <nav
          className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0"
          aria-label="Type"
        >
          {TYPES.map((t) => (
            <Link
              key={t.value}
              href={typeHref(t.value)}
              aria-current={t.value === type ? "page" : undefined}
              className="chip"
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form
          action={type === "manga" ? "/manga" : "/series"}
          className="no-scrollbar -mx-5 flex items-center gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          <input type="hidden" name="type" value={type} />
          <select
            name="source"
            defaultValue={source}
            className={select}
            aria-label="Source"
          >
            {SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            name="q"
            defaultValue={q}
            placeholder="Title"
            type="search"
            enterKeyHint="search"
            className={`${select} w-44 cursor-text placeholder:text-secondary sm:w-56`}
          />
          <select
            disabled={source !== "mangadex"}
            name="genre"
            defaultValue={genre}
            className={select}
            aria-label="Genre"
          >
            <option value="">All Genres</option>
            {genres.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            disabled={source === "mangakatana" || source === "all"}
            name="status"
            defaultValue={status}
            className={select}
            aria-label="Status"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.value ? s.label : "Any Status"}
              </option>
            ))}
          </select>
          <select
            name="order"
            defaultValue={orderRaw}
            className={select}
            aria-label="Sort"
          >
            <option value="">{q ? "Best Match" : "Popular"}</option>
            {ORDERS.filter((o) => q || o.value !== "followedCount").map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button className="t-footnote h-9 shrink-0 rounded-full bg-label px-5 font-semibold text-black transition hover:opacity-90">
            Apply
          </button>
        </form>
      </div>

      {result.warnings.map((w) => (
        <p
          key={w}
          role="status"
          className="t-footnote mt-4 rounded-[12px] bg-warning/10 px-4 py-3 text-warning/90"
        >
          {w}
        </p>
      ))}
      {result.series.length === 0 ? (
        <p className="grouped t-callout mt-10 p-14 text-center text-secondary">
          {source === "mangapill" && !q
            ? "MangaPill only lists titles you search for. Type a title above."
            : result.warnings.length
              ? "Nothing loaded from this source right now. Try All sources."
              : "No matches. Try a different title or filter."}
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-x-2.5 gap-y-6 sm:grid-cols-4 sm:gap-x-3.5 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 min-[1800px]:grid-cols-9">
          {result.series.map((s) => (
            <SeriesCard
              key={s.id}
              series={s}
              stats={stats[s.id]}
              sizes="(min-width: 1024px) 200px, (min-width: 640px) 25vw, 33vw"
            />
          ))}
        </div>
      )}

      {result.pages > 1 && (
        <nav className="mt-14 flex items-center justify-center gap-1.5">
          {page > 1 && <PageLink href={pageHref(page - 1)}>Previous</PageLink>}
          {pageWindow(page, result.pages).map((p, i) =>
            p === null ? (
              <span key={`gap${i}`} className="px-1 text-tertiary">
                …
              </span>
            ) : (
              <PageLink key={p} href={pageHref(p)} active={p === page}>
                {p}
              </PageLink>
            ),
          )}
          {page < result.pages && (
            <PageLink href={pageHref(page + 1)}>Next</PageLink>
          )}
        </nav>
      )}
    </>
  );
}

function pageWindow(cur: number, total: number): (number | null)[] {
  const set = new Set(
    [1, total, cur - 1, cur, cur + 1].filter((p) => p >= 1 && p <= total),
  );
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

function PageLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`t-footnote grid h-9 min-w-9 place-items-center rounded-full px-3.5 font-medium tabular-nums transition ${
        active ? "bg-white text-black" : "bg-fill text-label/90 hover:bg-fill-2"
      }`}
    >
      {children}
    </Link>
  );
}

type Row = {
  title: string;
  href: string;
  opts: Parameters<typeof browseSeries>[0];
};
type Found = Awaited<ReturnType<typeof browseSeries>>["series"];

function rowsFor(type: "manhwa" | "manga"): Row[] {
  const base = type === "manga" ? "/manga" : "/series";
  const t = type === "manga" ? "&type=manga" : "";
  const label = type === "manga" ? "Manga" : "Manhwa";
  const popular = type === "manga" ? "mangadex" : "all";
  return [
    {
      title: `Popular ${label}`,
      href: `${base}?source=${popular}${t}`,
      opts: { source: popular, type, order: "followedCount" },
    },
    {
      title: "Latest Chapters",
      href: `${base}?order=latestUploadedChapter&source=mangadex${t}`,
      opts: { source: "mangadex", type, order: "latestUploadedChapter" },
    },
    {
      title: "Top Rated",
      href: `${base}?order=rating&source=mangadex${t}`,
      opts: { source: "mangadex", type, order: "rating" },
    },
    {
      title: "Newly Added",
      href: `${base}?order=createdAt&source=mangadex${t}`,
      opts: { source: "mangadex", type, order: "createdAt" },
    },
    {
      title: "Completed Series",
      href: `${base}?status=completed&source=mangadex${t}`,
      opts: { source: "mangadex", type, status: "completed", order: "followedCount" },
    },
  ];
}

const browseOrEmpty = (opts: Row["opts"]) =>
  browseSeries({ ...opts, limit: 20 })
    .then((r) => r.series)
    .catch(() => [] as Found);

/** The Manhwa and Manga tabs: a feature, what you're reading, and rows to browse. */
function ComicsHome({ type }: { type: "manhwa" | "manga" }) {
  const rows = rowsFor(type);
  const base = type === "manga" ? "/manga" : "/series";
  return (
    <div className="pb-12">
      <Suspense fallback={<HeroSkeleton />}>
        <ComicsFeature type={type} row={rows[0]} />
      </Suspense>
      <div className="after-billboard mt-8 space-y-8 lg:space-y-10">
        {rows.map((row, i) => (
          <Fragment key={row.title}>
            <Suspense fallback={<RowSkeleton title={row.title} />}>
              <ComicsRow row={row} />
            </Suspense>
            {i === 0 && <ContinueRow title="Continue Reading" media={["series"]} />}
          </Fragment>
        ))}
        <div className="gutter mx-auto max-w-[2560px]">
          <Link
            href={`${base}?source=all${type === "manga" ? "&type=manga" : ""}`}
            className="btn btn-gray"
          >
            Browse all with filters
          </Link>
        </div>
      </div>
    </div>
  );
}

async function ComicsFeature({
  type,
  row,
}: {
  type: "manhwa" | "manga";
  row: Row;
}) {
  // Rendered per request: the feature rotates daily (and sources must not be hit at build).
  await connection();
  const all = (await browseOrEmpty(row.opts)).filter((s) => s.cover);
  const pool = all.slice(0, 8);
  if (!pool.length) return null;
  const s = pool[dayNumber() % pool.length];
  const genre = s.tags.find((t) => t.group === "genre")?.name;
  return (
    <Billboard
      item={{
        title: s.title,
        image: coverSrc(s.cover, 960),
        portrait: true,
        mosaic: all.filter((x) => x.id !== s.id).map((x) => coverSrc(x.cover, 320)),
        kicker: `Most followed ${type}`,
        facts: [
          s.type && s.type.charAt(0).toUpperCase() + s.type.slice(1),
          genre,
          s.lastChapter && `${s.lastChapter} chapters`,
        ],
        description: cleanDescription(s.description ?? ""),
        play: `/series/${s.id}/start`,
        playLabel: "Read",
        info: `/series/${s.id}`,
        save: {
          id: s.id,
          media: "series",
          title: s.title,
          cover: s.cover,
          type: s.type,
        },
      }}
    />
  );
}

async function ComicsRow({ row }: { row: Row }) {
  await connection();
  const series = await browseOrEmpty(row.opts);
  if (!series.length) return null;
  const stats = await getStats(series).catch(
    () => ({}) as Awaited<ReturnType<typeof getStats>>,
  );
  return (
    <Shelf title={row.title} href={row.href}>
      {series.map((s) => (
        <ShelfItem key={s.id}>
          <SeriesCard series={s} stats={stats[s.id]} />
        </ShelfItem>
      ))}
    </Shelf>
  );
}

