import Link from "next/link";
import { ChevronLeft } from "./Icons";

/** Title block for list pages ("See all", search results, filters), the same in every section. */
export function SectionHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="pt-3 lg:pt-8">
      {back && (
        <Link
          href={back.href}
          prefetch={false}
          className="t-footnote -ml-1 inline-flex min-h-11 items-center gap-0.5 font-medium text-secondary transition-colors hover:text-label"
        >
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="t-title1 text-balance sm:t-large">{title}</h1>
          {subtitle && (
            <p className="t-footnote mt-1 text-secondary">{subtitle}</p>
          )}
        </div>
        {actions}
      </div>
    </header>
  );
}
