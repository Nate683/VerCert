import type { TopProduct } from "@/lib/executive/stats";
import { Panel, Empty, type Variant } from "./Chrome";

export function TopProducts({
  products,
  variant,
}: {
  products: TopProduct[];
  variant: Variant;
}) {
  const isCommand = variant === "command";
  return (
    <Panel
      variant={variant}
      title="Top Products by Revenue"
      tone="green"
      meta={products.length > 0 ? `${products.length} listed` : undefined}
      bodyClassName="px-5 pb-5 pt-4"
      className="h-full"
    >
      {products.length === 0 ? (
        <Empty variant={variant}>No paid orders yet.</Empty>
      ) : (
        <ol className="divide-y divide-[var(--cmd-brass)]/10">
          {products.map((product, i) => (
            <li key={product.slug} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="flex min-w-0 items-baseline gap-2.5">
                <span
                  className={
                    isCommand
                      ? "command-figure shrink-0 text-[11px] text-[var(--cmd-brass)]/70"
                      : "shrink-0 text-[11px] office-gold"
                  }
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={isCommand ? "command-body truncate" : "truncate text-[var(--office-fg)]"}>
                  {product.name}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span
                  className={
                    isCommand
                      ? "command-figure text-[11px] text-[var(--cmd-bone-faint)]"
                      : "text-[11px] office-platinum"
                  }
                >
                  {product.unitsSold} u
                </span>
                <span className={isCommand ? "command-figure text-sm" : "text-sm font-semibold office-gold"}>
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
