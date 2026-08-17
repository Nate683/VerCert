import type { RevenuePoint } from "@/lib/executive/stats";
import { CommandAreaChart } from "./CommandAreaChart";
import { Panel, Readout, type Variant } from "./Chrome";

export function RevenueChart({
  series,
  variant,
}: {
  series: RevenuePoint[];
  variant: Variant;
}) {
  const max = Math.max(1, ...series.map((p) => p.revenue));
  const total = series.reduce((sum, p) => sum + p.revenue, 0);
  const best = series.reduce<RevenuePoint | null>(
    (acc, p) => (acc === null || p.revenue > acc.revenue ? p : acc),
    null
  );
  const isCommand = variant === "command";

  return (
    <Panel
      variant={variant}
      title="Revenue — Trailing Fourteen Days"
      meta={series.length > 0 ? `${series[0]?.date} – ${series[series.length - 1]?.date}` : undefined}
      bodyClassName="px-5 pb-4 pt-4"
      className="h-full"
    >
      {isCommand ? (
        <CommandAreaChart series={series} />
      ) : (
        <div className="flex h-40 items-end gap-1.5">
          {series.map((point) => (
            <div key={point.date} className="group relative flex-1">
              <div
                className="rounded-t bg-[var(--office-gold)]/60 transition-all group-hover:bg-[var(--office-gold)]"
                style={{ height: `${Math.max(2, (point.revenue / max) * 100)}%` }}
              />
              <div className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-[var(--office-border)] bg-[var(--office-bg)] px-2 py-1 text-[10px] text-[var(--office-fg)] opacity-0 transition-opacity group-hover:opacity-100">
                {point.date}: ${point.revenue.toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      )}

      <dl
        className={`mt-4 grid grid-cols-3 gap-4 border-t pt-3 ${
          isCommand ? "border-[var(--cmd-brass)]/20" : "border-[var(--office-border)]"
        }`}
      >
        <Readout variant={variant} label="Fourteen-Day Total" size="sm">
          ${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </Readout>
        <Readout variant={variant} label="Daily Average" size="sm">
          ${(series.length > 0 ? total / series.length : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </Readout>
        <Readout variant={variant} label="Best Day" size="sm" footnote={best?.date}>
          ${(best?.revenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </Readout>
      </dl>
    </Panel>
  );
}
