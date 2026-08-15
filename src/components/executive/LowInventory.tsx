import type { LowInventoryAlert } from "@/lib/inventory";

export function LowInventory({
  alerts,
  variant,
}: {
  alerts: LowInventoryAlert[];
  variant: "command" | "office";
}) {
  const isCommand = variant === "command";
  return (
    <div
      className={
        isCommand
          ? "command-card border border-gold/20 bg-white/[0.02] p-6"
          : "office-card"
      }
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Low Inventory</p>
      {alerts.length === 0 ? (
        <p className="mt-4 text-sm text-white/40">All stock levels are healthy.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {alerts.map((alert) => (
            <li key={alert.slug} className="flex items-center justify-between text-sm">
              <span className="text-white/70">{alert.name}</span>
              <span className="border border-red-500/40 px-2 py-0.5 text-xs text-red-300">
                {alert.quantity} left
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
