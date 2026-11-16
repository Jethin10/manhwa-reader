export default function Loading() {
  return (
    <div className="space-y-8 pb-12" role="status" aria-label="Loading movies">
      <div className="billboard skeleton min-h-[min(78svh,680px)] sm:min-h-[min(80svh,780px)]" />
      {Array.from({ length: 2 }, (_, r) => (
        <div key={r} className="gutter mx-auto max-w-[2560px] space-y-3">
          <div className="skeleton h-7 w-48 rounded-md" />
          <div className="flex gap-2.5 overflow-hidden sm:gap-3.5">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="skeleton aspect-[2/3] w-[30vw] max-w-[148px] shrink-0 rounded-[6px] sm:w-[164px] sm:max-w-none xl:w-[176px]"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
