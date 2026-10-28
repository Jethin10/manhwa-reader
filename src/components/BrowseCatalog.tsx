import Link from "next/link";
import { Suspense } from "react";
import {
  browseSeries,
  getStats,
  getTags,
  type BrowseOptions,
  type SeriesType,
} from "@/lib/catalog";
import { SOURCES, sourceId } from "@/lib/sources";
import { SeriesCard } from "@/components/SeriesCard";

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
    <div className="gutter mx-auto max-w-[1440px] pt-4 lg:pt-12">
      <Suspense fallback={<GridSkeleton />}>
        <Browse searchParams={searchParams} initialType={initialType} />
      </Suspense>
    </div>
  );
}

async function Browse({
  searchParams,
  initialType,
}: {
  searchParams: Promise<SP>;
  initialType: SeriesType;
}) {
  const sp = await searchParams;
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
  const stats = await getStats(result.series.map((s) => s.id));
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

  return (
    <>
      <h1 className="t-large">{heading}</h1>
      <p className="t-sub mt-1 text-secondary">
        {result.total.toLocaleString("en-US")} series
        {source === "all" ? " across all sources" : ` on ${SOURCES.find((x) => x.id === source)?.name}`}
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <nav
          className="grid w-full grid-cols-4 rounded-[9px] bg-fill p-[2px] sm:w-[420px]"
          aria-label="Type"
        >
          {TYPES.map((t) => (
            <Link
              key={t.value}
              href={typeHref(t.value)}
              aria-current={t.value === type ? "page" : undefined}
              className={`t-footnote rounded-[7px] py-1.5 text-center font-semibold transition ${
                t.value === type
                  ? "bg-[#636366] text-white shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)]"
                  : "text-label/80 hover:text-label"
              }`}
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
            disabled={source === "comix" || source === "all"}
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
          <button className="t-footnote h-9 shrink-0 rounded-full bg-accent px-5 font-semibold text-white transition hover:opacity-90">
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
          No matches. Try a different title or filter.
        </p>
      ) : (
        <div className="mt-7 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-5 sm:gap-y-8 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-7">
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

function GridSkeleton() {
  return (
    <>
      <div className="skeleton h-10 w-48 rounded-lg" />
      <div className="skeleton mt-5 h-8 w-full rounded-[9px] sm:w-[420px]" />
      <div className="mt-7 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-5 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-7">
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} className="skeleton aspect-[2/3] rounded-[12px]" />
        ))}
      </div>
    </>
  );
}
