"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SearchBox, type SearchSection } from "./SearchBox";
import {
  BooksIcon,
  GearIcon,
  HouseIcon,
  MagnifierIcon,
  MangaIcon,
  PlayRectIcon,
} from "./Icons";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/series", label: "Manhwa" },
  { href: "/manga", label: "Manga" },
  { href: "/anime", label: "Anime" },
  { href: "/bookmarks", label: "Library" },
];

const TABS = [
  {
    href: "/",
    label: "Home",
    Icon: HouseIcon,
    match: (p: string) => p === "/",
  },
  {
    href: "/series",
    label: "Manga",
    Icon: MangaIcon,
    match: (p: string) => p.startsWith("/series") || p.startsWith("/manga"),
  },
  {
    href: "/search",
    label: "Search",
    Icon: MagnifierIcon,
    match: (p: string) => p.startsWith("/search"),
  },
  {
    href: "/anime",
    label: "Anime",
    Icon: PlayRectIcon,
    match: (p: string) => p.startsWith("/anime"),
  },
  {
    href: "/bookmarks",
    label: "Library",
    Icon: BooksIcon,
    match: (p: string) => p.startsWith("/bookmarks"),
  },
];

const active = (path: string, href: string) =>
  href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);

/** Reads the URL for active states; wrap in Suspense and fall back to `<Chrome path="" />`. */
export function Header() {
  const path = usePathname();
  const params = useSearchParams();
  const section =
    path.startsWith("/anime") ||
    (path === "/search" && params.get("section") === "anime")
      ? "anime"
      : "manga";
  return <Chrome path={path} section={section} />;
}

export function Chrome({
  path,
  section = "manga",
}: {
  path: string;
  section?: SearchSection;
}) {
  return (
    <>
      <header className="site-chrome glass-bar sticky top-0 z-40 pt-[var(--safe-top)] shadow-[inset_0_-0.5px_0_var(--color-hairline)]">
        <div className="gutter mx-auto flex h-[52px] max-w-[1440px] items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            aria-label="Manhwa home"
          >
            <Logo />
            <span className="t-headline">Manhwa</span>
          </Link>
          <nav
            className="hidden items-center gap-1 lg:flex"
            aria-label="Primary"
          >
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(path, n.href) ? "page" : undefined}
                className={`t-footnote rounded-full px-3.5 py-1.5 font-medium transition-colors ${
                  active(path, n.href)
                    ? "bg-fill text-label"
                    : "text-secondary hover:text-label"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden w-[260px] lg:block">
              <SearchBox
                section={section}
                mangaOnly={path.startsWith("/manga")}
              />
            </div>
            <Link
              href="/settings"
              aria-label="Preferences"
              aria-current={path.startsWith("/settings") ? "page" : undefined}
              className={`grid size-9 place-items-center rounded-full transition-colors hover:bg-fill ${
                path.startsWith("/settings") ? "text-accent" : "text-secondary"
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
                  href={
                    href === "/search" ? `/search?section=${section}` : href
                  }
                  aria-current={on ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-[3px] transition-colors ${
                    on ? "text-accent" : "text-tertiary active:text-secondary"
                  }`}
                >
                  <Icon filled={on} className="size-[25px]" />
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

export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <span
      className={`grid place-items-center rounded-[8px] bg-gradient-to-b from-[#3a3a3c] to-[#1c1c1e] shadow-[inset_0_0.5px_0_rgba(255,255,255,0.25),0_1px_3px_rgba(0,0,0,0.5)] ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[60%] text-white"
        fill="currentColor"
        aria-hidden
      >
        <path d="M4 5.2c2.6-.9 5.3-.6 7.2 1v13c-1.9-1.4-4.6-1.7-7.2-.8z" />
        <path
          d="M20 5.2c-2.6-.9-5.3-.6-7.2 1v13c1.9-1.4 4.6-1.7 7.2-.8z"
          opacity=".55"
        />
      </svg>
    </span>
  );
}
