import { PROVIDERS } from "@/lib/sources";
import { Logo } from "./Header";

export function Footer() {
  return (
    <footer className="site-chrome mt-24 hidden border-t border-hairline lg:block">
      <div className="gutter t-footnote mx-auto flex max-w-[2560px] items-center justify-between gap-6 py-8 text-tertiary">
        <p className="flex items-center gap-2.5">
          <Logo className="h-4 w-auto opacity-80" />
          Comics from {PROVIDERS.map((p) => p.name).join(", ")}.
        </p>
        <a
          href="https://mangadex.org"
          target="_blank"
          rel="noreferrer"
          className="text-secondary transition-colors hover:text-label"
        >
          Support creators through official releases
        </a>
      </div>
    </footer>
  );
}
