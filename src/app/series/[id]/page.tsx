import { sourceOf } from "@/lib/sources";
import { SourceIssue } from "@/components/SourceIssue";
import { CollectionPicker } from "@/components/CollectionPicker";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { getChapters, getSeries, getStats } from "@/lib/catalog";
import { coverSrc, coverSrcSet } from "@/lib/images";
import { cap, cleanDescription } from "@/lib/format";
import { BookmarkButton } from "@/components/BookmarkButton";
import { ChapterList } from "@/components/ChapterList";
import { ReadButton } from "@/components/ReadButton";
import { Synopsis } from "@/components/Synopsis";
import { StarIcon } from "@/components/Icons";

export async function generateMetadata({
  params,
}: PageProps<"/series/[id]">): Promise<Metadata> {
  const { id } = await params;
  const s = await getSeries(id).catch(() => null);
  if (!s) return { title: "Series unavailable" };
  return {
    title: s.title,
    description: cleanDescription(s.description).slice(0, 160),
  };
}

export default function SeriesPage({ params }: PageProps<"/series/[id]">) {
  return (
    <Suspense fallback={<SeriesSkeleton />}>
      <SeriesContent params={params} />
    </Suspense>
  );
}

async function SeriesContent({
  params,
}: {
  params: PageProps<"/series/[id]">["params"];
}) {
  try {
    return await LoadSeries({ params });
  } catch (e) {
    return (
      <SourceIssue
        message={
          e instanceof Error
            ? e.message
            : "The source could not load this series."
        }
      />
    );
  }
}

async function LoadSeries({
  params,
}: {
  params: PageProps<"/series/[id]">["params"];
}) {
  const { id } = await params;
  const [s, chapters, stats] = await Promise.all([
    getSeries(id),
    getChapters(id),
    getStats([id]),
  ]);
  const st = stats[id];
  const readable = chapters.filter((c) => !c.externalUrl);
  const first = readable.at(-1);
  const genres = s.tags.filter(
    (t) => t.group === "genre" || t.group === "theme",
  );
  const saved = { id: s.id, title: s.title, cover: s.cover, type: s.type };

  return (
    <div className="relative isolate">
      {/* Ambient backdrop */}
      <div className="absolute inset-x-0 top-0 -z-10 h-[620px] overflow-hidden">
        {s.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverSrc(s.cover, 640)}
            alt=""
            aria-hidden
            className="size-full scale-125 object-cover opacity-50 blur-[80px] saturate-150"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/70 to-black" />
      </div>

      <div className="mx-auto max-w-[1100px] px-5 pt-10 sm:px-8 sm:pt-16">
        <div className="animate-in flex flex-col items-center gap-8 text-center md:flex-row md:items-end md:text-left">
          <div className="w-[220px] shrink-0 sm:w-[260px]">
            {s.cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverSrc(s.cover, 960)}
                srcSet={coverSrcSet(s.cover, [640, 960, 1280])}
                sizes="260px"
                alt={s.title}
                className="aspect-[2/3] w-full rounded-[14px] object-cover shadow-[0_30px_60px_-15px_rgba(0,0,0,0.9)] ring-1 ring-white/10"
              />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-[12px] font-semibold tracking-[0.12em] text-accent uppercase">
              {s.type} · {sourceOf(s.id)}
            </p>
            <h1 className="display text-balance mt-2 text-[34px] leading-[1.08] font-bold sm:text-[48px]">
              {s.title}
            </h1>
            {(s.authors.length > 0 || s.artists.length > 0) && (
              <p className="mt-2 text-[17px] text-secondary">
                {[...new Set([...s.authors, ...s.artists])].join(", ")}
              </p>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              {first && (
                <ReadButton
                  seriesId={id}
                  firstId={first.id}
                  firstNumber={first.number}
                />
              )}
              <BookmarkButton series={saved} />
              <CollectionPicker item={{ ...saved, media: "series" }} />
            </div>
          </div>
        </div>

        {/* Stat strip, App Store style */}
        <dl className="mt-12 grid grid-cols-2 divide-hairline rounded-[18px] bg-card/60 py-4 ring-1 ring-white/[0.06] sm:grid-cols-4 sm:divide-x">
          <Stat label="Rating">
            <span className="flex items-center justify-center gap-1">
              {st?.rating ? st.rating.toFixed(1) : "—"}
              <StarIcon className="size-4 text-[#ffd60a]" />
            </span>
          </Stat>
          <Stat label="Followers">
            {st?.follows ? compact(st.follows) : "—"}
          </Stat>
          <Stat label="Chapters">{chapters.length || "—"}</Stat>
          <Stat label="Status">{cap(s.status)}</Stat>
        </dl>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-12">
            <section>
              <h2 className="display mb-3 text-[22px] font-semibold">About</h2>
              <Synopsis
                text={
                  cleanDescription(s.description) || "No synopsis available."
                }
              />
              <div className="mt-5 flex flex-wrap gap-2">
                {genres.map((g) => (
                  <Link
                    key={g.id}
                    href={`/series?type=all&source=${s.id.startsWith("asura~") ? "asura" : s.id.startsWith("comix~") ? "comix" : "mangadex"}&q=${encodeURIComponent(g.name)}`}
                    className="rounded-full bg-fill px-3.5 py-1.5 text-[13px] text-label/90 transition hover:bg-fill-2"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </section>
            <ChapterList seriesId={id} chapters={chapters} />
          </div>

          <aside className="h-fit space-y-0 overflow-hidden rounded-[18px] bg-card/60 ring-1 ring-white/[0.06] lg:sticky lg:top-20">
            <h2 className="px-5 pt-4 pb-2 text-[13px] font-semibold text-secondary">
              Information
            </h2>
            <Info label="Author" value={s.authors.join(", ")} />
            <Info label="Artist" value={s.artists.join(", ")} />
            <Info label="Type" value={s.type} />
            <Info label="Released" value={s.year ? String(s.year) : ""} />
            <Info label="Status" value={cap(s.status)} />
            <div className="border-t border-hairline px-5 py-4">
              <h3 className="text-xs text-secondary">
                Find this title on another source
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["asura", "Asura Scans"],
                  ["comix", "Comix"],
                  ["mangadex", "MangaDex"],
                ]
                  .filter(([, name]) => name !== sourceOf(id))
                  .map(([source, name]) => (
                    <Link
                      key={source}
                      href={`/series?source=${source}&type=all&q=${encodeURIComponent(s.title)}`}
                      className="rounded-full bg-fill px-3 py-2 text-xs hover:bg-fill-2"
                    >
                      {name}
                    </Link>
                  ))}
              </div>
            </div>
            {s.altTitles.length > 0 && (
              <Info
                label="Also known as"
                value={s.altTitles.slice(0, 3).join("\n")}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function compact(n: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-2 text-center">
      <dt className="text-[11px] font-semibold tracking-[0.06em] text-tertiary uppercase">
        {label}
      </dt>
      <dd className="display mt-1 text-[20px] font-semibold text-label/90">
        {children}
      </dd>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="mx-5 flex justify-between gap-6 border-t border-hairline py-3 text-[14px] first-of-type:border-0">
      <span className="shrink-0 text-secondary">{label}</span>
      <span className="text-right whitespace-pre-line">{value}</span>
    </div>
  );
}

function SeriesSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] px-5 pt-16 sm:px-8">
      <div className="flex flex-col items-center gap-8 md:flex-row md:items-end">
        <div className="skeleton aspect-[2/3] w-[260px] rounded-[14px]" />
        <div className="w-full flex-1 space-y-3">
          <div className="skeleton h-4 w-20 rounded" />
          <div className="skeleton h-12 w-2/3 rounded-lg" />
          <div className="skeleton h-11 w-48 rounded-full" />
        </div>
      </div>
      <div className="skeleton mt-12 h-24 rounded-[18px]" />
    </div>
  );
}
