// Shown while the catalog is fetched. Mirrors the real grid so the page
// settles into place instead of jumping when the products arrive.
export default function ShopLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
      <div className="border-b border-white/10 pb-8">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton mt-4 h-9 w-72" />
        <div className="skeleton mt-4 h-4 w-full max-w-2xl" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[210px_1fr]">
        <div className="hidden space-y-8 lg:block">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <div className="skeleton h-3 w-20" />
              <div className="skeleton mt-3 h-9 w-full" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="border border-white/10">
              <div className="skeleton aspect-square w-full" />
              <div className="space-y-3 p-6">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-5 w-40" />
                <div className="skeleton h-3 w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
