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
    <div className="mx-auto max-w-[1400px] px-5 pt-10 sm:px-8">
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
    "h-9 rounded-[10px] bg-fill px-3 text-[13px] text-label outline-none transition hover:bg-fill-2 focus:ring-2 focus:ring-accent/60";
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
      <h1 className="display text-[34px] font-bold">{heading}</h1>
      <p className="mt-1 text-[15px] text-secondary">
        {result.total.toLocaleString("en-US")} series
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <nav
          className="flex w-fit gap-1 rounded-[10px] bg-fill p-1"
          aria-label="Type"
        >
          {TYPES.map((t) => (
            <Link
              key={t.value}
              href={typeHref(t.value)}
              className={`rounded-[8px] px-4 py-1.5 text-[13px] font-medium transition ${
                t.value === type
                  ? "bg-[#636366] text-white shadow"
                  : "text-secondary hover:text-label"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <form
          action={type === "manga" ? "/manga" : "/series"}
          className="flex flex-wrap items-center gap-2"
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
            className={`${select} w-full sm:w-56`}
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
          <button className="h-9 rounded-full bg-white px-5 text-[13px] font-semibold text-black transition hover:bg-white/85">
            Apply
          </button>
        </form>
      </div>

      {result.warnings.map((w) => (
        <p
          key={w}
          role="status"
          className="mt-4 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-200"
        >
          {w}
        </p>
      ))}
      {result.series.length === 0 ? (
        <p className="mt-10 rounded-[18px] bg-card/60 p-14 text-center text-[15px] text-secondary">
          No matches. Try a different title or filter.
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {result.series.map((s) => (
            <SeriesCard
              key={s.id}
              series={s}
              stats={stats[s.id]}
              sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 45vw"
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
      className={`grid h-9 min-w-9 place-items-center rounded-full px-3.5 text-[13px] font-medium tabular-nums transition ${
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
      <div className="skeleton mt-6 h-9 w-80 rounded-[10px]" />
      <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} className="skeleton aspect-[2/3] rounded-[10px]" />
        ))}
      </div>
    </>
  );
}
