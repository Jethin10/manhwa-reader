import Link from "next/link";
export function SourceIssue({
  message,
  href = "/series",
}: {
  message: string;
  href?: string;
}) {
  return (
    <div className="mx-auto max-w-lg px-5 py-24 text-center">
      <h1 className="display text-2xl font-semibold">
        This source is unavailable
      </h1>
      <p role="alert" className="mt-4 text-sm leading-7 text-secondary">
        {message}
      </p>
      <Link
        href={href}
        className="mt-7 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-black"
      >
        Choose another source
      </Link>
    </div>
  );
}
