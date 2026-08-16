"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExecutiveOverview } from "@/lib/executive/stats";
import type { GoalPeriodType, RevenueGoal } from "@/lib/types";
import { LiveIndicator } from "./LiveIndicator";

function currentMonthPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentQuarterPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export function GoalsPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [goals, setGoals] = useState<RevenueGoal[]>([]);
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState<GoalPeriodType>("monthly");
  const [targetUsd, setTargetUsd] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [goalsRes, overviewRes] = await Promise.all([
      fetch("/api/executive/goals", { cache: "no-store" }),
      fetch("/api/executive/overview", { cache: "no-store" }),
    ]);
    if (goalsRes.ok) setGoals((await goalsRes.json()).goals ?? []);
    if (overviewRes.ok) setOverview((await overviewRes.json()).overview ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  async function handleSetGoal(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const period = periodType === "monthly" ? currentMonthPeriod() : currentQuarterPeriod();
      await fetch("/api/executive/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, periodType, targetUsd: Number(targetUsd) || 0 }),
      });
      setTargetUsd("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/executive/goals/${id}`, { method: "DELETE" });
    await load();
  }

  const cardClass = isCommand ? "command-panel p-6" : "office-card";
  const figureClass = isCommand ? "command-figure" : "";

  if (loading) return <p className="text-sm text-white/30">Loading...</p>;

  const monthlyGoal = goals.find((g) => g.period === currentMonthPeriod());
  const quarterlyGoal = goals.find((g) => g.period === currentQuarterPeriod());
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthPaceExpected = monthlyGoal ? (monthlyGoal.targetUsd / daysInMonth) * dayOfMonth : 0;
  const revenueMtd = overview?.revenueMtd ?? 0;

  return (
    <div className="space-y-6">
      <LiveIndicator variant={variant} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">This Month</p>
          {monthlyGoal ? (
            <>
              <p className={`mt-2 text-3xl text-gold ${figureClass}`}>${revenueMtd.toFixed(2)}</p>
              <p className="mt-1 text-sm text-white/50">of ${monthlyGoal.targetUsd.toFixed(2)} target</p>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gold"
                  style={{ width: `${Math.min(100, (revenueMtd / monthlyGoal.targetUsd) * 100)}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-white/40">
                {revenueMtd >= monthPaceExpected
                  ? `Ahead of pace by $${(revenueMtd - monthPaceExpected).toFixed(2)}.`
                  : `Behind pace by $${(monthPaceExpected - revenueMtd).toFixed(2)}.`}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/40">No monthly target set yet.</p>
          )}
        </div>

        <div className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">This Quarter</p>
          {quarterlyGoal ? (
            <>
              <p className={`mt-2 text-3xl text-gold ${figureClass}`}>
                ${(overview?.revenueMtd ?? 0).toFixed(2)}
              </p>
              <p className="mt-1 text-sm text-white/50">of ${quarterlyGoal.targetUsd.toFixed(2)} target</p>
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-gold"
                  style={{ width: `${Math.min(100, ((overview?.revenueMtd ?? 0) / quarterlyGoal.targetUsd) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/40">No quarterly target set yet.</p>
          )}
        </div>
      </div>

      {isCommand && (
        <form onSubmit={handleSetGoal} className={cardClass}>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">Set a Target</p>
          <div className="mt-4 flex flex-wrap gap-4">
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as GoalPeriodType)}
              className="input-field w-auto"
            >
              <option value="monthly">This Month ({currentMonthPeriod()})</option>
              <option value="quarterly">This Quarter ({currentQuarterPeriod()})</option>
            </select>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={targetUsd}
              onChange={(e) => setTargetUsd(e.target.value)}
              placeholder="Target USD"
              className="input-field w-auto"
            />
            <button
              type="submit"
              disabled={saving}
              className="border border-gold bg-gold px-6 py-2.5 text-xs uppercase tracking-[0.15em] text-black transition-colors hover:bg-transparent hover:text-gold disabled:opacity-40"
            >
              {saving ? "Saving..." : "Set Target"}
            </button>
          </div>
        </form>
      )}

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">All Targets</p>
        {goals.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">No targets set yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {goals.map((g) => (
              <li key={g.id} className="flex items-center justify-between text-sm text-white/70">
                <span>
                  {g.period} ({g.periodType})
                </span>
                <span className="flex items-center gap-3">
                  <span className={figureClass}>${g.targetUsd.toFixed(2)}</span>
                  {isCommand && (
                    <button type="button" onClick={() => handleDelete(g.id)} className="text-white/30 hover:text-red-300">
                      ×
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
