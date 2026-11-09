import type { TopProduct } from "@/lib/executive/stats";
import { Panel, Empty, type Variant } from "./Chrome";

export function TopProducts({
  products,
  variant,
}: {
  products: TopProduct[];
  variant: Variant;
}) {
  return (
    <Panel
      variant={variant}
      title="Top Products by Revenue"
      meta={products.length > 0 ? `${products.length} listed` : undefined}
      bodyClassName="px-5 pb-3 pt-1"
      className="h-full"
    >
      {products.length === 0 ? (
        <Empty variant={variant}>No paid orders yet.</Empty>
      ) : (
        <ol className="divide-y divide-[var(--x-border)]">
          {products.map((product, i) => (
            <li key={product.slug} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
              <span className="flex min-w-0 items-baseline gap-3">
                <span className="w-5 shrink-0 text-[11px] tabular-nums text-[var(--x-faint)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="truncate text-[var(--x-text-2)]">{product.name}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-4 tabular-nums">
                <span className="text-[11px] text-[var(--x-muted)]">{product.unitsSold} u</span>
                <span className="exec-figure text-sm">
                  ${product.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
