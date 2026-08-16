"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExecutiveOverview } from "@/lib/executive/stats";
import { LiveIndicator } from "./LiveIndicator";

export function ForecastingPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);

  const load = useCallback(() => {
    return fetch("/api/executive/overview", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setOverview(data.overview ?? null));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  const cardClass = isCommand ? "command-panel p-6" : "office-card";
  const figureClass = isCommand ? "command-figure" : "";

  if (!overview) return <p className="text-sm text-white/30">Loading...</p>;

  // Run-rate projection derived from the trailing 14-day chart series —
  // no separate assumptions/inputs to manage, always live.
  const totalTrailing = overview.chartSeries.reduce((sum, p) => sum + p.revenue, 0);
  const dailyRunRate = totalTrailing / Math.max(1, overview.chartSeries.length);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemainingInMonth = daysInMonth - now.getDate();
  const projectedMonthEnd = overview.revenueMtd + dailyRunRate * daysRemainingInMonth;

  const daysRemainingInYear = Math.round(
    (new Date(now.getFullYear() + 1, 0, 1).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );
  const projectedYearEnd = overview.revenueAllTime + dailyRunRate * daysRemainingInYear;
  const projected30 = dailyRunRate * 30;
  const projected90 = dailyRunRate * 90;

  return (
    <div className="space-y-6">
      <LiveIndicator variant={variant} asOf={overview.computedAt} />

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Current Run Rate</p>
        <p className={`mt-2 text-3xl text-gold ${figureClass}`}>${dailyRunRate.toFixed(2)}/day</p>
        <p className="mt-1 text-sm text-white/50">Based on the trailing 14 days of paid revenue.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={cardClass}>
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Next 30 Days</p>
          <p className={`mt-2 text-xl text-white ${figureClass}`}>${projected30.toFixed(2)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Next 90 Days</p>
          <p className={`mt-2 text-xl text-white ${figureClass}`}>${projected90.toFixed(2)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Projected Month-End</p>
          <p className={`mt-2 text-xl text-white ${figureClass}`}>${projectedMonthEnd.toFixed(2)}</p>
        </div>
        <div className={cardClass}>
          <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Projected Year-End</p>
          <p className={`mt-2 text-xl text-white ${figureClass}`}>${projectedYearEnd.toFixed(2)}</p>
        </div>
      </div>

      <p className="text-xs text-white/30">
        Projections are a simple linear extrapolation of the current 14-day run rate — not seasonally adjusted.
      </p>
    </div>
  );
}
