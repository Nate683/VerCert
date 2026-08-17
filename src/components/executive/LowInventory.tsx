import type { LowInventoryAlert } from "@/lib/inventory";
import { Panel, Empty, type Variant } from "./Chrome";

export function LowInventory({
  alerts,
  variant,
}: {
  alerts: LowInventoryAlert[];
  variant: Variant;
}) {
  const isCommand = variant === "command";
  return (
    <Panel
      variant={variant}
      title="Low Inventory"
      meta={alerts.length > 0 ? `${alerts.length} flagged` : "Clear"}
      bodyClassName="px-5 pb-5 pt-4"
      className="h-full"
    >
      {alerts.length === 0 ? (
        <Empty variant={variant}>All stock levels are healthy.</Empty>
      ) : (
        <ul className="divide-y divide-[var(--cmd-brass)]/10">
          {alerts.map((alert) => (
            <li key={alert.slug} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className={isCommand ? "command-body truncate" : "truncate text-[var(--office-fg)]"}>
                {alert.name}
              </span>
              <span
                className={
                  isCommand
                    ? "command-figure shrink-0 border border-[#8c3a32]/70 bg-[#3a1011]/60 px-2 py-0.5 text-[11px] text-[#e0a89c]"
                    : "shrink-0 rounded border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200"
                }
              >
                {alert.quantity} left
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
