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
      <h1 className="t-title2">
        This source is unavailable
      </h1>
      <p role="alert" className="mt-4 text-sm leading-7 text-secondary">
        {message}
      </p>
      <Link
        href={href}
        className="btn btn-primary mt-7"
      >
        Choose another source
      </Link>
    </div>
  );
}
