"use client";

import { useCallback, useEffect, useState } from "react";
import type { HqMember } from "@/lib/hq";
import type { AffiliateTier } from "@/lib/types";

type LeaderboardEntry = { name: string; tier?: AffiliateTier; grossRevenue: number; ordersDriven: number };

const TIER_LABELS: Record<AffiliateTier, string> = {
  standard: "Standard",
  associate: "Associate",
  principal: "Principal",
  managing_principal: "Managing Principal",
  partner: "Partner",
};

export function LeaderboardPanel({ member }: { member?: HqMember }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/hq/leaderboard", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setEnabled(data.enabled);
      setEntries(data.entries ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  async function handleToggle() {
    setToggling(true);
    try {
      await fetch("/api/hq/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderboardEnabled: !enabled }),
      });
      await load();
    } finally {
      setToggling(false);
    }
  }

  const isExecutive = member?.kind === "executive";
  const ranked = [...entries].sort((a, b) => b.grossRevenue - a.grossRevenue);

  return (
    <div className="mx-auto max-w-3xl">
      {isExecutive && (
        <div className="mb-6 flex items-center justify-between border border-white/10 bg-white/[0.02] px-5 py-4">
          <p className="text-sm text-white/60">Leaderboard is currently {enabled ? "visible" : "hidden"} to affiliates.</p>
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            className="border border-gold px-4 py-2 text-xs uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
          >
            {enabled ? "Turn Off" : "Turn On"}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-white/30">Loading...</p>
      ) : !enabled ? (
        <p className="border border-white/10 bg-white/[0.02] p-6 text-sm text-white/50">
          The leaderboard is currently disabled.
        </p>
      ) : ranked.length === 0 ? (
        <p className="text-sm text-white/30">No affiliate activity yet.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
              <th className="pb-3 pr-4 font-normal">Rank</th>
              <th className="pb-3 pr-4 font-normal">Affiliate</th>
              <th className="pb-3 pr-4 font-normal">Tier</th>
              <th className="pb-3 pr-4 font-normal">Orders</th>
              <th className="pb-3 font-normal">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((e, i) => (
              <tr key={e.name + i} className="border-b border-white/5 text-white/80">
                <td className="py-3 pr-4 font-mono text-gold">#{i + 1}</td>
                <td className="py-3 pr-4 text-white">{e.name}</td>
                <td className="py-3 pr-4 text-xs">{e.tier ? TIER_LABELS[e.tier] : "—"}</td>
                <td className="py-3 pr-4">{e.ordersDriven}</td>
                <td className="py-3">${e.grossRevenue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
