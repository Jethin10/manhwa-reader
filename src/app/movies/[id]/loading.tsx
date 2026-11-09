export default function Loading() {
  return (
    <div className="gutter mx-auto max-w-[1440px] pt-14 sm:pt-20">
      <p role="status" className="sr-only">
        Loading movie details…
      </p>
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-10">
        <div className="skeleton aspect-[2/3] rounded-xl" />
        <div>
          <div className="skeleton h-9 max-w-md rounded-lg" />
          <div className="skeleton mt-3 h-4 max-w-56 rounded" />
          <div className="skeleton mt-6 h-11 w-40 rounded-full" />
        </div>
      </div>
    </div>
  );
}
