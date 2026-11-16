"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useUnreadCounts } from "@/lib/updates";
import { SearchBox } from "./SearchBox";
import {
  BooksIcon,
  GearIcon,
  HouseIcon,
  MagnifierIcon,
  MangaIcon,
  PlayRectIcon,
} from "./Icons";

const inLibrary = (p: string) =>
  p.startsWith("/bookmarks") ||
  p.startsWith("/downloads") ||
  p.startsWith("/updates");

function FilmIcon({
  className,
  filled,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <rect
        x="3.5"
        y="4"
        width="17"
        height="16"
        rx="3"
        fill={filled ? "currentColor" : "none"}
      />
      <path
        d="M8 4v16M16 4v16M3.5 9.3H8M3.5 14.7H8M16 9.3h4.5M16 14.7h4.5"
        stroke={filled ? "#000" : "currentColor"}
      />
    </svg>
  );
}

type Item = {
  href: string;
  label: string;
  match: (p: string) => boolean;
};

/** One map of the app, shared by the desktop nav and the mobile tab bar. */
const HOME: Item = { href: "/", label: "Home", match: (p) => p === "/" };
const ANIME: Item = {
  href: "/anime",
  label: "Anime",
  match: (p) => p.startsWith("/anime"),
};
const MOVIES: Item = {
  href: "/movies",
  label: "Movies",
  match: (p) => p.startsWith("/movies"),
};
const MANHWA: Item = {
  href: "/series",
  label: "Manhwa",
  match: (p) => p.startsWith("/series"),
};
const MANGA: Item = {
  href: "/manga",
  label: "Manga",
  match: (p) => p.startsWith("/manga"),
};
const LIBRARY: Item = { href: "/bookmarks", label: "My List", match: inLibrary };

const NAV = [HOME, ANIME, MOVIES, MANHWA, MANGA, LIBRARY];

const TABS = [
  { ...HOME, Icon: HouseIcon },
  { ...ANIME, Icon: PlayRectIcon },
  { ...MOVIES, Icon: FilmIcon },
  {
    ...MANHWA,
    label: "Read",
    // Manhwa and manga share one tab on phones; the browse page switches between them.
    match: (p: string) => MANHWA.match(p) || MANGA.match(p),
    Icon: MangaIcon,
  },
  { ...LIBRARY, Icon: BooksIcon },
];

/** Reads the URL for active states; wrap in Suspense and fall back to `<Chrome path="" />`. */
export function Header() {
  return <Chrome path={usePathname()} />;
}

/** True until the page scrolls, so the bar can sit clear over a hero image. */
function useAtTop() {
  const [top, setTop] = useState(true);
  useEffect(() => {
    const update = () => setTop(window.scrollY < 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return top;
}

export function Chrome({ path }: { path: string }) {
  const atTop = useAtTop();
  const onSearch = path.startsWith("/search");
  return (
    <>
      <header
        data-top={atTop}
        className="site-chrome site-header glass-bar sticky top-0 z-40 pt-[var(--safe-top)] shadow-[inset_0_-0.5px_0_var(--color-hairline)] transition-[background-color,box-shadow,backdrop-filter] duration-300"
      >
        <div className="gutter mx-auto flex h-[52px] max-w-[2560px] items-center gap-6">
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2"
            aria-label="Kairo home"
          >
            <Logo />
            <span className="text-[21px] leading-none font-bold tracking-[-0.045em] [font-stretch:118%]">
              Kairo
            </span>
          </Link>
          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Primary"
          >
            {NAV.map((n) => {
              const on = n.match(path);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  prefetch={n.href === "/bookmarks" ? null : false}
                  aria-current={on ? "page" : undefined}
                  className={`hit relative px-3 py-1.5 text-[14px] transition-colors ${
                    on
                      ? "font-semibold text-label"
                      : "font-medium text-secondary hover:text-label"
                  }`}
                >
                  {n.label}
                  {n === LIBRARY && <UnreadDot className="top-0.5 right-0.5" />}
                  {on && (
                    <span className="absolute inset-x-3 -bottom-[9px] h-[2px] rounded-full bg-accent" />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {!onSearch && (
              <div className="hidden w-[300px] lg:block">
                <SearchBox />
              </div>
            )}
            <Link
              href="/search"
              aria-label="Search"
              aria-current={onSearch ? "page" : undefined}
              className={`grid size-11 place-items-center rounded-full transition-colors hover:bg-fill lg:hidden ${
                onSearch ? "text-label" : "text-secondary"
              }`}
            >
              <MagnifierIcon filled={onSearch} className="size-[22px]" />
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              aria-current={path.startsWith("/settings") ? "page" : undefined}
              className={`grid size-11 place-items-center rounded-full transition-colors hover:bg-fill ${
                path.startsWith("/settings") ? "text-label" : "text-secondary"
              }`}
            >
              <GearIcon />
            </Link>
          </div>
        </div>
      </header>

      <nav
        aria-label="Tabs"
        className="site-chrome glass-bar fixed inset-x-0 bottom-0 z-40 shadow-[inset_0_0.5px_0_var(--color-hairline)] lg:hidden"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <ul className="mx-auto grid h-14 max-w-xl grid-cols-5">
          {TABS.map(({ href, label, Icon, match }) => {
            const on = match(path);
            return (
              <li key={href}>
                <Link
                  href={href}
                  prefetch={href === "/bookmarks" ? null : false}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-[3px] transition-colors ${
                    on ? "text-label" : "text-tertiary active:text-secondary"
                  }`}
                >
                  <span className="relative">
                    <Icon filled={on} className="size-[24px]" />
                    {href === "/bookmarks" && (
                      <UnreadDot className="-top-0.5 -right-1" />
                    )}
                  </span>
                  <span className="text-[10px] leading-none font-medium tracking-[0.01em]">
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/** New chapters waiting in the library (from the last Updates check). */
function UnreadDot({ className = "" }: { className?: string }) {
  const unread = useUnreadCounts();
  if (!Object.values(unread).some((n) => n > 0)) return null;
  return (
    <span
      aria-label="New chapters"
      className={`absolute size-2 rounded-full bg-accent ring-2 ring-bg ${className}`}
    />
  );
}

/** The Kairo mark: a K built from a stem and a lifting page. Always lamp gold. */
export function Logo({ className = "h-[22px] w-auto" }: { className?: string }) {
  return (
    <svg
      viewBox="6.5 4.5 20.5 23"
      aria-hidden
      className={`shrink-0 text-[#f2c14e] ${className}`}
      fill="currentColor"
    >
      <rect x="7" y="5" width="5" height="22" rx="1.2" />
      <path d="M13.4 17.2 L26.5 5 C21.4 10.6 20.6 19.4 23.6 27 Z" />
    </svg>
  );
}
