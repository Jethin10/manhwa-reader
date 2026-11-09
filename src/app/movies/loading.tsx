export default function Loading() {
  return (
    <div className="gutter mx-auto max-w-[1440px] pt-5 sm:pt-8">
      <h1 className="t-large">Movies</h1>
      <p role="status" className="t-footnote mt-2 text-secondary">
        Loading movie catalog…
      </p>
      <div className="no-scrollbar mt-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton h-11 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
