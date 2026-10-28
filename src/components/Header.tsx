import Link from "next/link";
import { SearchBox } from "./SearchBox";

export function Header() {
  return (
    <header className="site-chrome glass sticky top-0 z-40 border-b border-hairline">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-5 px-5 sm:px-8">
        <Link
          href="/"
          className="display flex items-center gap-2 text-[19px] font-semibold"
        >
          <Logo />
          Manhwa
        </Link>
        <nav className="hidden items-center gap-5 text-[13px] text-secondary lg:flex">
          <Link href="/" className="transition-colors hover:text-label">
            Home
          </Link>
          <Link href="/series" className="transition-colors hover:text-label">
            Manhwa
          </Link>
          <Link href="/manga" className="transition-colors hover:text-label">
            Manga
          </Link>

          <Link href="/anime" className="transition-colors hover:text-label">
            Anime
          </Link>
          <Link
            href="/bookmarks"
            className="transition-colors hover:text-label"
          >
            Library
          </Link>
          <Link href="/settings" className="transition-colors hover:text-label">
            Preferences
          </Link>
        </nav>
        <div className="ml-auto w-full max-w-[260px]">
          <SearchBox />
        </div>
      </div>
      <nav className="no-scrollbar flex gap-6 overflow-x-auto border-t border-hairline px-5 py-2.5 text-[13px] text-secondary lg:hidden">
        <Link href="/">Home</Link>
        <Link href="/series">Manhwa</Link>
        <Link href="/manga">Manga</Link>

        <Link href="/anime" className="transition-colors hover:text-label">
          Anime
        </Link>
        <Link href="/bookmarks">Library</Link>
        <Link href="/settings">Preferences</Link>
      </nav>
    </header>
  );
}

function Logo() {
  return (
    <span className="grid size-7 place-items-center rounded-[8px] bg-gradient-to-br from-[#c4b5fd] via-[#8b5cf6] to-[#4c1d95] shadow-[0_2px_10px_rgba(139,92,246,0.45)]">
      <svg
        viewBox="0 0 24 24"
        className="size-4 text-white"
        fill="currentColor"
        aria-hidden
      >
        <path d="M5 4h4.5v16H5zM14.5 4H19v16h-4.5z" opacity=".95" />
        <path d="M9.5 4 12 9l2.5-5v6L12 15l-2.5-5z" />
      </svg>
    </span>
  );
}
