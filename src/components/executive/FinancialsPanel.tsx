"use client";

import { useCallback, useEffect, useState } from "react";
import type { FinancialSummary } from "@/lib/executive/financials";
import { LiveIndicator } from "./LiveIndicator";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";
import { ChangeBadge } from "./ChangeBadge";

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

export function FinancialsPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [financials, setFinancials] = useState<FinancialSummary | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/executive/financials", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setFinancials(data.financials);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  useLiveRefresh(load);

  const cardClass = isCommand ? "border border-gold/20 bg-white/[0.02] p-6" : "office-card";

  if (!financials) {
    return <p className="text-sm text-white/30">Loading...</p>;
  }

  const periods: { label: string; key: keyof FinancialSummary["revenue"] }[] = [
    { label: "Today", key: "today" },
    { label: "Week to Date", key: "wtd" },
    { label: "Month to Date", key: "mtd" },
    { label: "Quarter to Date", key: "qtd" },
    { label: "Year to Date", key: "ytd" },
  ];

  return (
    <div className="space-y-6">
      <LiveIndicator variant={variant} />
      <div className={cardClass}>
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Revenue by Period</p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not a page route */}
          <a
            href="/api/executive/financials?format=csv"
            className="border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black"
          >
            Export P&L CSV
          </a>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {periods.map(({ label, key }) => {
            const period = financials.revenue[key] as { current: number; prior: number; changePercent: number | null };
            return (
              <div key={key} className="border border-white/10 p-4">
                <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">{label}</p>
                <p className="mt-2 font-mono text-xl text-gold">{fmt(period.current)}</p>
                <p className="mt-1 text-xs">
                  <ChangeBadge changePercent={period.changePercent} /> vs prior period
                </p>
              </div>
            );
          })}
          <div className="border border-gold/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">All Time</p>
            <p className="mt-2 font-mono text-xl text-gold">{fmt(financials.revenue.allTime)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">P&amp;L Summary</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-white/60">Gross Revenue</dt><dd className="text-white">{fmt(financials.grossRevenue)}</dd></div>
            <div className="flex justify-between"><dt className="text-white/60">Discounts Given</dt><dd className="text-white">-{fmt(financials.discountsGiven)}</dd></div>
            <div className="flex justify-between"><dt className="text-white/60">Commissions Owed</dt><dd className="text-white">-{fmt(financials.commissionsOwed)}</dd></div>
            <div className="flex justify-between border-t border-white/10 pt-2"><dt className="text-white">Net Revenue</dt><dd className="text-gold">{fmt(financials.netRevenue)}</dd></div>
            <div className="flex justify-between border-t border-white/10 pt-2"><dt className="text-white/60">Average Order Value</dt><dd className="text-white">{fmt(financials.averageOrderValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-white/60">Repeat Purchase Rate</dt><dd className="text-white">{financials.repeatPurchaseRate.toFixed(1)}%</dd></div>
            <div className="flex justify-between"><dt className="text-white/60">Customer Lifetime Value</dt><dd className="text-white">{fmt(financials.customerLifetimeValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-white/60">Blended Margin</dt><dd className="text-white">{financials.blendedMarginPercent !== null ? `${financials.blendedMarginPercent.toFixed(1)}%` : "Add product costs to see margin"}</dd></div>
          </dl>
        </div>

        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Cash View</p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-white/60">Paid</dt><dd className="text-white">{fmt(financials.cash.paid)}</dd></div>
            <div className="flex justify-between"><dt className="text-white/60">Awaiting Payment</dt><dd className="text-white">{fmt(financials.cash.awaitingPayment)}</dd></div>
            <div className="flex justify-between"><dt className="text-white/60">Refunded</dt><dd className="text-red-300">{fmt(financials.cash.refunded)}</dd></div>
          </dl>
        </div>
      </div>

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Margin by Product</p>
        {financials.marginByProduct.length === 0 ? (
          <p className="mt-4 text-sm text-white/40">No paid orders yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
                  <th className="pb-2 pr-4 font-normal">Product</th>
                  <th className="pb-2 pr-4 font-normal">Revenue</th>
                  <th className="pb-2 pr-4 font-normal">Cost</th>
                  <th className="pb-2 pr-4 font-normal">Margin</th>
                  <th className="pb-2 font-normal">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {financials.marginByProduct.map((p) => (
                  <tr key={p.slug} className="border-b border-white/5 text-white/80">
                    <td className="py-2 pr-4">{p.name}</td>
                    <td className="py-2 pr-4">{fmt(p.revenue)}</td>
                    <td className="py-2 pr-4">{p.marginPercent !== null ? fmt(p.cost) : "—"}</td>
                    <td className="py-2 pr-4">{p.marginPercent !== null ? fmt(p.margin) : "—"}</td>
                    <td className="py-2">{p.marginPercent !== null ? `${p.marginPercent.toFixed(1)}%` : "no cost entered"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Revenue by Category</p>
          <ul className="mt-4 space-y-2 text-sm">
            {financials.revenueByCategory.map((c) => (
              <li key={c.category} className="flex justify-between"><span className="text-white/70">{c.category}</span><span className="text-white">{fmt(c.revenue)}</span></li>
            ))}
            {financials.revenueByCategory.length === 0 && <p className="text-white/40">No data yet.</p>}
          </ul>
        </div>
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Revenue by Promo Code</p>
          <ul className="mt-4 space-y-2 text-sm">
            {financials.revenueByPromoCode.map((p) => (
              <li key={p.code} className="flex justify-between"><span className="text-white/70">{p.code}</span><span className="text-white">{fmt(p.revenue)}</span></li>
            ))}
            {financials.revenueByPromoCode.length === 0 && <p className="text-white/40">No promo codes used yet.</p>}
          </ul>
        </div>
        {isCommand && (
          <div className={cardClass}>
            <p className="text-xs uppercase tracking-[0.2em] text-white/40">Revenue by Affiliate</p>
            <ul className="mt-4 space-y-2 text-sm">
              {financials.revenueByAffiliate.map((a) => (
                <li key={a.name} className="flex justify-between"><span className="text-white/70">{a.name}</span><span className="text-white">{fmt(a.revenue)}</span></li>
              ))}
              {financials.revenueByAffiliate.length === 0 && <p className="text-white/40">No affiliate-driven orders yet.</p>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
