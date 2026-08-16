"use client";

import { useCallback, useEffect, useState } from "react";
import type { Alert } from "@/lib/types";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";
import { LiveIndicator } from "./LiveIndicator";

const SEVERITY_STYLE: Record<Alert["severity"], string> = {
  critical: "border-red-500/40 text-red-300",
  warning: "border-gold/50 text-gold",
  info: "border-white/20 text-white/60",
};

const CATEGORY_LABEL: Record<Alert["category"], string> = {
  low_stock: "Low Stock",
  failed_payment: "Failed Payment",
  pending_payout: "Pending Payout",
  unusual_activity: "Unusual Activity",
};

export function AlertsPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    return fetch("/api/executive/alerts", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setAlerts(data.alerts ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  useLiveRefresh(load);

  const cardClass = isCommand ? "command-panel p-6" : "office-card";

  if (loading && alerts.length === 0) {
    return <p className="text-sm text-white/30">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <LiveIndicator variant={variant} />
      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
          Alerts Center ({alerts.length})
        </p>
        {alerts.length === 0 ? (
          <p className="mt-4 text-sm text-white/40">Nothing needs attention right now.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={`flex flex-wrap items-center justify-between gap-3 border-l-2 px-4 py-3 text-sm ${SEVERITY_STYLE[a.severity]} bg-white/[0.02]`}
              >
                <span className="text-white/80">{a.message}</span>
                <span className="text-[10px] uppercase tracking-[0.15em] opacity-70">
                  {CATEGORY_LABEL[a.category]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
