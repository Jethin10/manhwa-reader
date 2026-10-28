import { PROVIDERS } from "@/lib/sources";

export function Footer() {
  return (
    <footer className="site-chrome mt-24 hidden shadow-[inset_0_0.5px_0_var(--color-hairline)] lg:block">
      <div className="gutter t-caption mx-auto flex max-w-[1440px] justify-between gap-6 py-8 text-tertiary">
        <p>Manhwa. Read and watch in one place.</p>
        <p>
          {PROVIDERS.map((p) => p.name).join(" · ")}.{" "}
          <a href="https://mangadex.org" target="_blank" rel="noreferrer" className="text-secondary hover:text-label">
            Support creators through official releases.
          </a>
        </p>
      </div>
    </footer>
  );
}
