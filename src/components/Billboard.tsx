/* eslint-disable @next/next/no-img-element -- Artwork comes from fixed catalog hosts. */
import Link from "next/link";
import type { CollectionItem } from "@/lib/collection";
import { InfoIcon, PlayIcon } from "./Icons";
import { MyListButton } from "./MyListButton";

export type BillboardItem = {
  title: string;
  image: string;
  facts: (string | undefined | null | false)[];
  description: string;
  play: string;
  /** Label for the main button: "Play", "Read", … */
  playLabel?: string;
  info?: string;
  kicker: string;
  /** The image is portrait key art (anime, comics): full-bleed on phones, a poster beside the text on wide screens. */
  portrait?: boolean;
  /**
   * More covers from the same shelf. With portrait art, wide screens show them as a slowly
   * drifting wall behind the featured poster instead of an empty blurred backdrop.
   */
  mosaic?: string[];
  /** Shows "+ My List" when given. */
  save?: Omit<CollectionItem, "status" | "updatedAt">;
};

/**
 * The full-bleed feature at the top of Home and each section. It runs under the header,
 * which stays clear over the art until the page scrolls (see `.billboard` in globals.css).
 */
export function Billboard({ item }: { item: BillboardItem }) {
  const facts = item.facts.filter(Boolean);
  const wall = item.portrait && item.mosaic && item.mosaic.length >= 6 ? item.mosaic : null;
  // Enough tiles for 7 columns × 6 rows, then the whole set again so the drift loops seamlessly.
  const tiles = wall ? Array.from({ length: 42 }, (_, i) => wall[i % wall.length]) : [];
  return (
    <section
      data-billboard
      className="billboard relative isolate flex min-h-[min(78svh,680px)] items-end overflow-hidden sm:min-h-[min(80svh,780px)]"
    >
      <img
        src={item.image}
        alt=""
        fetchPriority="high"
        decoding="async"
        referrerPolicy="no-referrer"
        className={`absolute inset-0 -z-20 size-full object-cover ${
          item.portrait
            ? `object-top lg:scale-110 lg:object-center lg:opacity-45 lg:blur-2xl ${wall ? "lg:hidden" : ""}`
            : "object-[center_22%]"
        }`}
      />
      {wall && (
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 -z-20 hidden w-[72%] overflow-hidden lg:block"
        >
          <div className="absolute -inset-y-[60%] -right-24 -left-16 rotate-[-9deg]">
            <div className="mosaic-drift grid grid-cols-7 gap-3 pb-3">
              {[...tiles, ...tiles].map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="aspect-[2/3] w-full rounded-[6px] bg-card object-cover"
                />
              ))}
            </div>
          </div>
          <div className="absolute inset-0 bg-bg/45" />
        </div>
      )}
      {item.portrait && (
        <img
          src={item.image}
          alt=""
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute top-1/2 right-[calc(var(--gutter)+2vw)] z-0 hidden aspect-[2/3] w-[280px] -translate-y-[44%] rounded-[16px] object-cover shadow-[0_40px_100px_-10px_rgba(0,0,0,0.95)] ring-1 ring-white/20 lg:block xl:w-[320px]"
        />
      )}
      <div
        className={`absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/50 to-black/20 lg:bg-gradient-to-r ${
          wall
            ? "lg:from-bg lg:from-30% lg:via-bg/75 lg:via-50% lg:to-bg/0"
            : "lg:from-bg/90 lg:via-bg/35 lg:to-transparent"
        }`}
      />
      {wall && (
        <div className="absolute inset-x-0 top-0 -z-10 hidden h-40 bg-gradient-to-b from-bg/80 to-transparent lg:block" />
      )}
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-bg to-transparent" />
      <div className="gutter mx-auto w-full max-w-[2560px] pt-32 pb-6 lg:pb-32">
        <div className="max-w-xl">
          <p className="t-eyebrow text-[#f2c14e]">{item.kicker}</p>
          <h1
            className={`mt-2 text-balance font-bold tracking-[-0.038em] ${
              // Width steps down as titles get longer, so long names stay a block, not a wall.
              item.title.length > 40
                ? "line-clamp-3 text-[28px] leading-[1.04] [font-stretch:104%] sm:text-[34px] lg:text-[42px]"
                : item.title.length > 22
                  ? "line-clamp-3 text-[34px] leading-[1] [font-stretch:108%] sm:text-[46px] lg:text-[56px]"
                  : "text-[44px] leading-[0.95] [font-stretch:112%] sm:text-[64px] lg:text-[80px]"
            }`}
          >
            {item.title}
          </h1>
          {facts.length > 0 && (
            <ul className="t-sub mt-4 flex flex-wrap gap-x-4 gap-y-1 font-medium text-label/80">
              {facts.map((f, i) => (
                <li key={`${f}${i}`}>{f}</li>
              ))}
            </ul>
          )}
          {item.description && (
            <p className="t-sub mt-3 line-clamp-2 max-w-[34rem] text-label/70 sm:line-clamp-3">
              {item.description}
            </p>
          )}
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link
              href={item.play}
              prefetch={false}
              className="btn btn-primary gap-2 px-7"
            >
              <PlayIcon className="size-4" />
              {item.playLabel ?? "Play"}
            </Link>
            {item.save ? (
              <MyListButton item={item.save} showStatus={false} />
            ) : null}
            {item.info && (
              <Link
                href={item.info}
                prefetch={false}
                aria-label="More info"
                className="btn glass-light w-11 px-0 sm:w-auto sm:px-5"
              >
                <InfoIcon className="size-[18px]" />
                <span className="hidden sm:inline">More info</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
