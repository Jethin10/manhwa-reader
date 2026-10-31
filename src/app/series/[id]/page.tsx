import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getChapters, getSeries, getStats, type Chapter } from "@/lib/catalog";
import { getMergedChapters } from "@/lib/unified";
import { providerOf, sourceOf } from "@/lib/sources";
import { coverSrc, coverSrcSet } from "@/lib/images";
import { cap, cleanDescription } from "@/lib/format";
import { SourceIssue } from "@/components/SourceIssue";
import { CollectionPicker } from "@/components/CollectionPicker";
import { BookmarkButton } from "@/components/BookmarkButton";
import { ChapterList } from "@/components/ChapterList";
import { ReadButton } from "@/components/ReadButton";
import { Synopsis } from "@/components/Synopsis";
import { CheckIcon, SparkleIcon, StarIcon } from "@/components/Icons";
import type { SavedSeries } from "@/lib/library";

export async function generateMetadata({ params }: PageProps<"/series/[id]">): Promise<Metadata> {
  const { id } = await params;
  const s = await getSeries(id).catch(() => null);
  if (!s) return { title: "Series unavailable" };
  return { title: s.title, description: cleanDescription(s.description).slice(0, 160) };
}

export default function SeriesPage({ params }: PageProps<"/series/[id]">) {
  return (
    <Suspense fallback={<SeriesSkeleton />}>
      <SeriesContent params={params} />
    </Suspense>
  );
}

async function SeriesContent({ params }: { params: PageProps<"/series/[id]">["params"] }) {
  try {
    return await LoadSeries({ params });
  } catch (e) {
    return <SourceIssue message={e instanceof Error ? e.message : "The source could not load this series."} />;
  }
}

async function LoadSeries({ params }: { params: PageProps<"/series/[id]">["params"] }) {
  const { id } = await params;
  const [s, primary, stats] = await Promise.all([
    getSeries(id),
    // Other sources can still supply chapters when this one is down.
    getChapters(id).catch(() => [] as Chapter[]),
    getStats([id]),
  ]);
  const st = stats[id];
  const genres = s.tags.filter((t) => t.group === "genre" || t.group === "theme");
  const saved = { id: s.id, title: s.title, cover: s.cover, type: s.type };
  const creators = [...new Set([...s.authors, ...s.artists])];

  return (
    <div className="relative isolate">
      {/* Ambient backdrop pulled from the artwork */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[560px] overflow-hidden sm:h-[640px]">
        {s.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverSrc(s.cover, 320)}
            alt=""
            aria-hidden
            className="size-full scale-150 object-cover opacity-60 blur-[90px] saturate-[1.8]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/60 to-black" />
      </div>

      <div className="gutter mx-auto max-w-[1120px] pt-6 lg:pt-14">
        <header className="animate-in flex flex-col items-center text-center md:flex-row md:items-end md:gap-10 md:text-left">
          <div className="w-[176px] shrink-0 sm:w-[220px] lg:w-[250px]">
            {s.cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverSrc(s.cover, 640)}
                srcSet={coverSrcSet(s.cover, [640, 960, 1280])}
                sizes="(min-width: 1024px) 250px, 220px"
                alt={s.title}
                fetchPriority="high"
                className="aspect-[2/3] w-full rounded-[14px] object-cover shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)] ring-[0.5px] ring-white/15"
              />
            )}
          </div>
          <div className="mt-6 w-full min-w-0 flex-1 md:mt-0 md:pb-1">
            <p className="t-eyebrow text-secondary">{s.type}</p>
            <h1 className="text-balance mt-1.5 font-[family-name:var(--font-display)] text-[28px] leading-[1.1] font-bold tracking-[-0.022em] sm:text-[40px] lg:text-[48px]">
              {s.title}
            </h1>
            {creators.length > 0 && <p className="t-callout mt-2 text-secondary">{creators.join(", ")}</p>}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center md:justify-start">
              <Suspense fallback={<PrimaryRead id={id} chapters={primary} />}>
                <MergedRead id={id} />
              </Suspense>
              <div className="flex items-center justify-center gap-3">
                <BookmarkButton series={saved} />
                <CollectionPicker item={{ ...saved, media: "series" }} />
              </div>
            </div>
          </div>
        </header>

        {/* Facts strip, App Store style: scrolls sideways on narrow screens */}
        <dl className="no-scrollbar -mx-5 mt-9 flex overflow-x-auto px-5 sm:mx-0 sm:px-0 md:mt-12">
          <Fact label="Rating">
            <span className="flex items-center justify-center gap-1">
              {st?.rating ? st.rating.toFixed(1) : "—"}
              {st?.rating ? <StarIcon className="size-3.5 text-warning" /> : null}
            </span>
          </Fact>
          <Fact label="Chapters">
            <Suspense fallback={primary.length || "—"}>
              <MergedCount id={id} />
            </Suspense>
          </Fact>
          <Fact label="Status">{cap(s.status)}</Fact>
          <Fact label="Released">{s.year ?? "—"}</Fact>
          <Fact label="Followers">{st?.follows ? compact(st.follows) : "—"}</Fact>
          <Fact label="Source">{sourceOf(id)}</Fact>
        </dl>

        <div className="mt-10 grid gap-10 lg:mt-12 lg:grid-cols-[1fr_340px] lg:gap-12">
          <div className="min-w-0 space-y-10">
            <section>
              <h2 className="t-title2 mb-3">About</h2>
              <Synopsis text={cleanDescription(s.description) || "No synopsis available."} />
              {genres.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {genres.map((g) => (
                    <Link
                      key={g.id}
                      href={`/series?type=all&source=${providerOf(s.id)}&q=${encodeURIComponent(g.name)}`}
                      className="t-footnote rounded-full bg-fill px-3.5 py-1.5 text-label/90 transition hover:bg-fill-2"
                    >
                      {g.name}
                    </Link>
                  ))}
                </div>
              )}
            </section>
            <Suspense fallback={<ChapterList series={saved} chapters={primary} pending />}>
              <MergedChapters series={saved} />
            </Suspense>
          </div>

          <aside className="h-fit space-y-6 lg:sticky lg:top-20">
            <Suspense fallback={<SourcesSkeleton />}>
              <Sources id={id} />
            </Suspense>
            <section>
              <h2 className="t-footnote mb-2 px-4 font-semibold tracking-[0.02em] text-secondary uppercase">Information</h2>
              <dl className="grouped">
                <Info label="Author" value={s.authors.join(", ")} />
                <Info label="Artist" value={s.artists.join(", ")} />
                <Info label="Type" value={s.type} />
                <Info label="Released" value={s.year ? String(s.year) : ""} />
                <Info label="Status" value={cap(s.status)} />
                {s.altTitles.length > 0 && <Info label="Also known as" value={s.altTitles.slice(0, 3).join("\n")} />}
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function PrimaryRead({ id, chapters }: { id: string; chapters: Chapter[] }) {
  const readable = chapters
    .filter((c) => !c.externalUrl)
    .map((c) => ({ id: c.id, number: c.number }));
  return readable.length ? <ReadButton seriesId={id} chapters={readable} /> : null;
}
async function MergedRead({ id }: { id: string }) {
  const { chapters } = await getMergedChapters(id).catch(() => ({ chapters: [] as Chapter[] }));
  return <PrimaryRead id={id} chapters={chapters} />;
}
async function MergedCount({ id }: { id: string }) {
  const { chapters } = await getMergedChapters(id).catch(() => ({ chapters: [] as Chapter[] }));
  return <>{chapters.length || "—"}</>;
}
async function MergedChapters({ series }: { series: SavedSeries }) {
  const merged = await getMergedChapters(series.id).catch(() => null);
  if (!merged) return <ChapterList series={series} chapters={[]} />;
  const multi = merged.sources.filter((s) => s.used > 0).length > 1;
  return <ChapterList series={series} chapters={merged.chapters} showSource={multi} />;
}

async function Sources({ id }: { id: string }) {
  const merged = await getMergedChapters(id).catch(() => null);
  if (!merged) return null;
  return (
    <section>
      <h2 className="t-footnote mb-2 flex items-center gap-1.5 px-4 font-semibold tracking-[0.02em] text-secondary uppercase">
        <SparkleIcon className="size-3.5 text-accent" />
        Sources
      </h2>
      <ul className="grouped">
        {merged.sources.map((s) => (
          <li key={s.id} className="row-divider">
            <Link
              href={`/series/${s.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] active:bg-white/[0.08]"
            >
              <span className="min-w-0 flex-1">
                <span className="t-callout flex items-center gap-1.5">
                  {s.name}
                  {s.primary && <span className="t-caption rounded-full bg-fill px-1.5 text-secondary">This page</span>}
                </span>
                <span className="t-footnote block text-secondary">
                  {s.error
                    ? "Unavailable right now"
                    : `${s.chapters} ${s.chapters === 1 ? "chapter" : "chapters"}${s.latest ? ` · latest ${s.latest}` : ""}`}
                </span>
              </span>
              {s.used > 0 && (
                <span className="t-caption flex items-center gap-1 text-success">
                  <CheckIcon className="size-3" />
                  {s.used} used
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      <p className="t-caption mt-2 px-4 text-tertiary">
        Each chapter opens from the sharpest available copy. If a source fails, reading continues from the next one.
      </p>
    </section>
  );
}

function compact(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[104px] flex-1 px-3 text-center shadow-[inset_-0.5px_0_0_var(--color-hairline)] last:shadow-none">
      <dt className="t-caption font-medium tracking-[0.04em] text-tertiary uppercase">{label}</dt>
      <dd className="mt-1 truncate font-[family-name:var(--font-display)] text-[19px] font-semibold text-label/90 tabular-nums">
        {children}
      </dd>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="row-divider t-sub flex justify-between gap-6 px-4 py-3">
      <dt className="shrink-0 text-secondary">{label}</dt>
      <dd className="text-right whitespace-pre-line">{value}</dd>
    </div>
  );
}

function SourcesSkeleton() {
  return (
    <div>
      <div className="skeleton mb-2 ml-4 h-4 w-20 rounded" />
      <div className="skeleton h-[132px] rounded-[14px]" />
      <p className="t-caption mt-2 px-4 text-tertiary">Checking other sources for this title…</p>
    </div>
  );
}

function SeriesSkeleton() {
  return (
    <div className="gutter mx-auto max-w-[1120px] pt-6 lg:pt-14">
      <div className="flex flex-col items-center gap-6 md:flex-row md:items-end md:gap-10">
        <div className="skeleton aspect-[2/3] w-[176px] rounded-[14px] sm:w-[220px] lg:w-[250px]" />
        <div className="flex w-full flex-1 flex-col items-center space-y-3 md:items-start">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-10 w-2/3 rounded-lg" />
          <div className="skeleton h-11 w-48 rounded-full" />
        </div>
      </div>
      <div className="skeleton mt-12 h-14 rounded-[14px]" />
    </div>
  );
}
