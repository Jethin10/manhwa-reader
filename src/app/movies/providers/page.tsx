import Link from "next/link";
import { MovieProviderSettings } from "@/components/MovieProviderSettings";
import { ChevronLeft } from "@/components/Icons";
export const metadata = { title: "Playback settings" };
export default function ProvidersPage() {
  return (
    <div className="gutter mx-auto max-w-[760px] pt-2 pb-12 lg:pt-6">
      <Link
        href="/movies"
        prefetch={false}
        className="t-sub -ml-1 inline-flex min-h-11 items-center gap-1 text-accent"
      >
        <ChevronLeft className="size-4" />
        Movies
      </Link>
      <h1 className="t-large mt-2">Playback settings</h1>
      <p className="t-sub mt-1 text-secondary">
        Saved on this device and included in library backups.
      </p>
      <div className="mt-6">
        <MovieProviderSettings />
      </div>
    </div>
  );
}
