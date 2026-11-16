/**
 * Loading states shaped like the pages they stand in for, so content settles into place instead
 * of jumping. Every block shares one light sweep (see `.skeleton` in globals.css).
 */

const POSTER =
  "w-[30vw] max-w-[148px] sm:w-[164px] sm:max-w-none xl:w-[176px] 2xl:w-[196px] min-[1800px]:w-[216px]";

/** The feature at the top of a section: art area with the title block and buttons. */
export function HeroSkeleton() {
  return (
    <div
      aria-hidden
      className="billboard relative flex min-h-[min(78svh,680px)] items-end bg-gradient-to-b from-card/60 to-bg sm:min-h-[min(80svh,780px)]"
    >
      <div className="gutter mx-auto w-full max-w-[2560px] pt-32 pb-6 lg:pb-32">
        <div className="skeleton h-3.5 w-28 rounded-[4px]" />
        <div className="skeleton mt-3 h-12 w-[min(78%,420px)] rounded-[6px] sm:h-16" />
        <div className="skeleton mt-4 h-3.5 w-48 rounded-[4px]" />
        <div className="skeleton mt-3 hidden h-3.5 w-[min(90%,480px)] rounded-[4px] sm:block" />
        <div className="mt-7 flex gap-2.5">
          <div className="skeleton h-11 w-28 rounded-[8px]" />
          <div className="skeleton h-11 w-28 rounded-[8px]" />
        </div>
      </div>
    </div>
  );
}

/** One row: a title and a run of posters. */
export function RowSkeleton({ title }: { title?: string }) {
  return (
    <section aria-hidden className="space-y-2.5">
      <div className="gutter mx-auto flex min-h-11 max-w-[2560px] items-center">
        {title ? (
          <h2 className="t-title3 text-tertiary sm:t-title2">{title}</h2>
        ) : (
          <div className="skeleton h-5 w-44 rounded-[4px]" />
        )}
      </div>
      <div className="gutter mx-auto flex max-w-[2560px] gap-2.5 overflow-hidden sm:gap-3.5 2xl:gap-4">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={`shrink-0 ${POSTER}`}>
            <div className="skeleton aspect-[2/3] rounded-[6px]" />
            <div className="skeleton mt-2.5 h-3 w-4/5 rounded-[3px]" />
            <div className="skeleton mt-1.5 h-2.5 w-1/2 rounded-[3px]" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** A section landing (Home, Anime, Movies, Manhwa, Manga) while it loads. */
export function LandingSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="pb-12">
      <HeroSkeleton />
      <div className="after-billboard mt-8 space-y-8 lg:space-y-10">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    </div>
  );
}

/** A list page (See all, filters, results) while it loads. */
export function GridSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="pt-3 lg:pt-8">
      <div className="skeleton h-3.5 w-20 rounded-[4px]" />
      <div className="skeleton mt-4 h-9 w-56 rounded-[6px]" />
      <div className="mt-5 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-10 w-24 rounded-[8px]" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-3 gap-x-2.5 gap-y-6 sm:grid-cols-4 sm:gap-x-3.5 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 min-[1800px]:grid-cols-9">
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[2/3] rounded-[6px]" />
            <div className="skeleton mt-2.5 h-3 w-4/5 rounded-[3px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
