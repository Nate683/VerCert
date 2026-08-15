import type { RevenuePoint } from "@/lib/executive/stats";
import { CommandAreaChart } from "./CommandAreaChart";

export function RevenueChart({
  series,
  variant,
}: {
  series: RevenuePoint[];
  variant: "command" | "office";
}) {
  const max = Math.max(1, ...series.map((p) => p.revenue));
  const isCommand = variant === "command";

  return (
    <div
      className={
        isCommand
          ? "command-card border border-gold/20 bg-white/[0.02] p-6"
          : "office-card"
      }
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
        Revenue — Last 14 Days
      </p>
      {isCommand ? (
        <div className="mt-6">
          <CommandAreaChart series={series} />
        </div>
      ) : (
        <div className="mt-6 flex h-40 items-end gap-1.5">
          {series.map((point) => (
            <div key={point.date} className="group relative flex-1">
              <div
                className="rounded-t bg-gold/60 transition-all group-hover:bg-gold"
                style={{ height: `${Math.max(2, (point.revenue / max) * 100)}%` }}
              />
              <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap border border-white/10 bg-black px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {point.date}: ${point.revenue.toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-between text-[10px] text-white/30">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

