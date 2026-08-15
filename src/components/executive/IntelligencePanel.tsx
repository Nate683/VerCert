"use client";

import { useCallback, useEffect, useState } from "react";
import type { RevenuePoint } from "@/lib/executive/stats";
import type { FunnelStats } from "@/lib/types";
import type { CustomerSummary } from "@/lib/executive/customers";

const RANGES = [7, 30, 90, 365];

type TopAffiliate = { name: string; grossRevenue: number; ordersDriven: number };

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-white/60">
        <span>{label}</span>
        <span className="font-mono text-white">{value}</span>
      </div>
      <div className="mt-1 h-3 w-full bg-white/5">
        <div className="h-3 bg-gold/70" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function IntelligencePanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [days, setDays] = useState(30);
  const [trendSeries, setTrendSeries] = useState<RevenuePoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelStats | null>(null);
  const [topCustomers, setTopCustomers] = useState<CustomerSummary[]>([]);
  const [topAffiliates, setTopAffiliates] = useState<TopAffiliate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/executive/intelligence?days=${days}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setTrendSeries(data.trendSeries ?? []);
      setFunnel(data.funnel ?? null);
      setTopCustomers(data.topCustomers ?? []);
      setTopAffiliates(data.topAffiliates ?? []);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when the range changes
    load();
  }, [load]);

  const cardClass = isCommand ? "border border-gold/20 bg-white/[0.02] p-6" : "office-card";
  const maxRevenue = Math.max(1, ...trendSeries.map((p) => p.revenue));

  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Sales Trend</p>
          <div className="flex gap-2">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] ${
                  days === r ? "border-gold text-gold" : "border-white/20 text-white/50 hover:border-white/40"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="mt-6 text-sm text-white/30">Loading...</p>
        ) : (
          <div className="mt-6 flex h-40 items-end gap-[2px] overflow-x-auto">
            {trendSeries.map((point) => (
              <div key={point.date} className="group relative flex-1">
                <div
                  className="rounded-t bg-gold/60 transition-all group-hover:bg-gold"
                  style={{ height: `${Math.max(2, (point.revenue / maxRevenue) * 100)}%` }}
                />
                <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap border border-white/10 bg-black px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {point.date}: ${point.revenue.toFixed(0)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Conversion Funnel ({days}d)</p>
        <p className="mt-1 text-[10px] text-white/30">Counted by unique visitor session, not raw event volume.</p>
        {funnel && (
          <div className="mt-5 space-y-4">
            <FunnelBar label="Page Views" value={funnel.pageViews} max={funnel.pageViews} />
            <FunnelBar label="Added to Cart" value={funnel.addToCart} max={funnel.pageViews} />
            <FunnelBar label="Checkout Started" value={funnel.checkoutStarted} max={funnel.pageViews} />
            <FunnelBar label="Order Completed" value={funnel.orderCompleted} max={funnel.pageViews} />
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-6 ${isCommand ? "lg:grid-cols-2" : "lg:grid-cols-2"}`}>
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Top Customers</p>
          <ul className="mt-4 space-y-2 text-sm">
            {topCustomers.map((c, i) => (
              <li key={c.id} className="flex justify-between">
                <span className="text-white/70">
                  <span className="font-mono text-gold">{String(i + 1).padStart(2, "0")}</span> {c.email}
                </span>
                <span className="text-white">${c.lifetimeValue.toFixed(0)}</span>
              </li>
            ))}
            {topCustomers.length === 0 && <p className="text-white/40">No customers yet.</p>}
          </ul>
        </div>
        {isCommand && (
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Top Affiliates</p>
            <ul className="mt-4 space-y-2 text-sm">
              {topAffiliates.map((a, i) => (
                <li key={a.name} className="flex justify-between">
                  <span className="text-white/70">
                    <span className="font-mono text-gold">{String(i + 1).padStart(2, "0")}</span> {a.name}
                  </span>
                  <span className="text-white">${a.grossRevenue.toFixed(0)}</span>
                </li>
              ))}
              {topAffiliates.length === 0 && <p className="text-white/40">No affiliate-driven orders yet.</p>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
