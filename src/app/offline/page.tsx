import Link from "next/link";

export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <div className="gutter mx-auto max-w-md py-28 text-center">
      <h1 className="t-title1">You&apos;re offline</h1>
      <p className="t-callout mt-3 text-secondary">
        Downloaded chapters still open, and pages you&apos;ve already read stay cached.
        Reconnect to load new chapters.
      </p>
      <Link href="/downloads" className="btn btn-primary mt-8">
        Open Downloads
      </Link>
    </div>
  );
}
