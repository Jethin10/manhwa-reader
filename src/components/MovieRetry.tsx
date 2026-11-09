"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function MovieRetry({ quiet = false }: { quiet?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className={`btn ${quiet ? "btn-gray" : "btn-primary"} disabled:opacity-50`}
    >
      {pending ? "Retrying…" : "Retry"}
    </button>
  );
}
