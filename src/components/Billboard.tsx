/* eslint-disable @next/next/no-img-element -- Artwork comes from fixed catalog hosts. */
import Link from "next/link";
import { PlayIcon } from "./Icons";

export type BillboardItem = {
  title: string;
  image: string;
  facts: string[];
  description: string;
  play: string;
  info: string;
  kicker: string;
};

/** The full-width feature at the top of Home and Movies. */
export function Billboard({ item }: { item: BillboardItem }) {
  return (
    <section className="relative isolate flex min-h-[min(68svh,620px)] items-end overflow-hidden">
      <img
        src={item.image}
        alt=""
        fetchPriority="high"
        decoding="async"
        referrerPolicy="no-referrer"
        className="absolute inset-0 -z-20 size-full object-cover object-[center_20%]"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/45 to-black/10 lg:bg-gradient-to-r lg:from-black/90 lg:via-black/35 lg:to-transparent" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-black to-transparent" />
      <div className="gutter mx-auto w-full max-w-[1440px] pt-24 pb-6 lg:pb-14">
        <div className="max-w-xl">
          <p className="t-footnote font-semibold tracking-wide text-white/75 uppercase">
            {item.kicker}
          </p>
          <h1 className="display mt-2 text-balance text-4xl leading-[1.03] font-bold sm:text-6xl">
            {item.title}
          </h1>
          {item.facts.length > 0 && (
            <p className="t-footnote mt-3 text-white/70">
              {item.facts.join(" · ")}
            </p>
          )}
          {item.description && (
            <p className="t-sub mt-2 line-clamp-2 text-white/80 sm:line-clamp-3">
              {item.description}
            </p>
          )}
          <div className="mt-5 flex gap-2.5">
            <Link href={item.play} prefetch={false} className="btn btn-primary gap-2 px-7">
              <PlayIcon className="size-4" />
              Play
            </Link>
            <Link href={item.info} prefetch={false} className="btn glass-light px-6">
              More info
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
