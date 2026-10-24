/** Instant skeleton shown the moment a page link is tapped, while the server loads the page's data.
 *  The sidebar / bottom bar (layout) stays interactive; only the content area shows this. */
export default function PortalLoading() {
  return (
    <div className="px-4 sm:px-8 py-6 sm:py-10 max-w-6xl w-full" aria-busy="true" aria-live="polite">
      <span className="sr-only">جاري التحميل…</span>
      <div className="h-4 w-24 rounded-full bg-silver-200 animate-pulse" />
      <div className="h-9 sm:h-11 w-48 rounded-xl bg-navy-100 animate-pulse mt-3" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-7">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-[88px] p-4 flex flex-col justify-between">
            <div className="h-6 w-10 rounded-md bg-silver-200 animate-pulse" />
            <div className="h-3 w-20 rounded-full bg-silver-100 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid gap-2.5 mt-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="card h-16 px-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-navy-50 animate-pulse shrink-0" />
            <div className="flex-1 grid gap-2">
              <div className="h-3.5 rounded-full bg-silver-200 animate-pulse" style={{ width: `${70 - i * 8}%` }} />
              <div className="h-2.5 w-1/3 rounded-full bg-silver-100 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
