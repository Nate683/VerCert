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
  const total = series.reduce((sum, p) => sum + p.revenue, 0);
  const best = series.reduce<RevenuePoint | null>(
    (acc, p) => (acc === null || p.revenue > acc.revenue ? p : acc),
    null
  );

  return (
    <Panel
      variant={variant}
      title="Revenue — Trailing Fourteen Days"
      meta={series.length > 0 ? `${series[0]?.date} – ${series[series.length - 1]?.date}` : undefined}
      bodyClassName="px-5 pb-4 pt-5"
      className="h-full"
    >
      <CommandAreaChart series={series} />

      <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-[var(--x-border)] pt-4">
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
