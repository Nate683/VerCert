// Product detail placeholder — same two-column geometry as the real page, so
// the image and the buy panel land where the eye is already looking.
export default function ProductLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
      <div className="skeleton h-3 w-48" />
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="skeleton aspect-square w-full" />
        <div>
          <div className="skeleton h-3 w-32" />
          <div className="skeleton mt-4 h-10 w-3/4" />
          <div className="skeleton mt-5 h-6 w-40" />
          <div className="skeleton mt-6 h-4 w-full" />
          <div className="skeleton mt-2 h-4 w-5/6" />
          <div className="skeleton mt-8 h-72 w-full" />
        </div>
      </div>
    </div>
  );
}
