"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-5 py-32 text-center">
      <h1 className="t-title2">Something went wrong</h1>
      <p className="mt-2 text-[15px] text-secondary">The catalog may be busy for a moment. Try again.</p>
      <button onClick={reset} className="mt-8 rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-black">
        Try Again
      </button>
    </div>
  );
}
