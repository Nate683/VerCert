import type { LowInventoryAlert } from "@/lib/inventory";
import { Panel, Empty, type Variant } from "./Chrome";

export function LowInventory({
  alerts,
  variant,
}: {
  alerts: LowInventoryAlert[];
  variant: Variant;
}) {
  return (
    <Panel
      variant={variant}
      title="Low Inventory"
      meta={alerts.length > 0 ? `${alerts.length} flagged` : "Clear"}
      bodyClassName="px-5 pb-3 pt-1"
      className="h-full"
    >
      {alerts.length === 0 ? (
        <Empty variant={variant}>All stock levels are healthy.</Empty>
      ) : (
        <ul className="max-h-72 divide-y divide-[var(--x-border)] overflow-y-auto pr-1">
          {alerts.map((alert) => (
            <li key={alert.slug} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
              <span className="truncate text-[var(--x-text-2)]">{alert.name}</span>
              {/* A warning, so the desaturated warning tone — not an error red. */}
              <span className="shrink-0 text-[12px] font-medium tabular-nums text-[var(--x-warning)]">
                {alert.quantity} left
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
