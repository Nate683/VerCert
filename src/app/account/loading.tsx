export default function AccountLoading() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 lg:px-10">
      <div className="border-b border-white/10 pb-6">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton mt-4 h-8 w-64" />
      </div>
      <div className="mt-10 space-y-4">
        <div className="skeleton h-3 w-32" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
