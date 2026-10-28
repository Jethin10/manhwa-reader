import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-5 py-32 text-center">
      <p className="display text-[72px] font-bold text-white/20">404</p>
      <h1 className="t-title2 mt-2">This page doesn&apos;t exist</h1>
      <Link href="/" className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-black">
        Go Home
      </Link>
    </div>
  );
}
