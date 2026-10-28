import Link from "next/link";

export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <div className="gutter mx-auto max-w-md py-28 text-center">
      <h1 className="t-title1">You&apos;re offline</h1>
      <p className="t-callout mt-3 text-secondary">
        Pages you&apos;ve already opened are still available. Reconnect to load new chapters.
      </p>
      <Link href="/bookmarks" className="btn btn-primary mt-8">
        Open Library
      </Link>
    </div>
  );
}
