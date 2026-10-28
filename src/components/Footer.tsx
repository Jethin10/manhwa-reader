export function Footer() {
  return (
    <footer className="site-chrome mt-24 border-t border-hairline">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-5 py-8 text-[12px] text-tertiary sm:flex-row sm:justify-between sm:px-8">
        <p>Manhwa. Read and watch in one place.</p>
        <p>
          MangaDex, Asura Scans, Comix and anime.{" "}
          <a
            href="https://mangadex.org"
            target="_blank"
            rel="noreferrer"
            className="text-secondary hover:text-label"
          >
            Support creators through official releases
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
