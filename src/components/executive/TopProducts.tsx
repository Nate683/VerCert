import type { TopProduct } from "@/lib/executive/stats";

export function TopProducts({
  products,
  variant,
}: {
  products: TopProduct[];
  variant: "command" | "office";
}) {
  const isCommand = variant === "command";
  return (
    <div
      className={
        isCommand
          ? "command-card command-panel p-6"
          : "office-card"
      }
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Top Products by Revenue</p>
      {products.length === 0 ? (
        <p className="mt-4 text-sm text-white/40">No paid orders yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {products.map((product, i) => (
            <li key={product.slug} className="flex items-center justify-between text-sm">
              <span className="text-white/70">
                <span className={isCommand ? "font-mono text-gold" : "text-gold"}>
                  {String(i + 1).padStart(2, "0")}
                </span>{" "}
                {product.name}
              </span>
              <span className={isCommand ? "font-mono text-white" : "text-white"}>
                ${product.revenue.toFixed(0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
