"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExecutiveOverview } from "@/lib/executive/stats";
import type { Alert, CalendarEvent } from "@/lib/types";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";
import { LiveIndicator } from "./LiveIndicator";

export function BriefingPanel({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [overview, setOverview] = useState<ExecutiveOverview | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(() => {
    setNow(Date.now());
    return Promise.all([
      fetch("/api/executive/overview", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/executive/alerts", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/executive/calendar", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([overviewData, alertsData, calendarData]) => {
      setOverview(overviewData.overview ?? null);
      setAlerts(alertsData.alerts ?? []);
      setEvents(calendarData.events ?? []);
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  useLiveRefresh(load);

  const cardClass = isCommand ? "command-panel p-6" : "office-card";
  const figureClass = isCommand ? "command-figure" : "";
  const upcoming = events
    .filter((e) => new Date(e.date).getTime() >= (now ?? 0) - 24 * 60 * 60 * 1000)
    .slice(0, 5);
  const critical = alerts.filter((a) => a.severity !== "info");

  if (!overview) return <p className="text-sm text-white/30">Loading...</p>;

  return (
    <div className="space-y-6">
      <LiveIndicator variant={variant} asOf={overview.computedAt} />

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Overnight / Today</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Revenue Today</p>
            <p className={`mt-1 text-2xl text-white ${figureClass}`}>${overview.revenueToday.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Orders (Total)</p>
            <p className={`mt-1 text-2xl text-white ${figureClass}`}>{overview.orderCount}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Pending Payments</p>
            <p className={`mt-1 text-2xl text-white ${figureClass}`}>{overview.pendingPaymentsCount}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-white/40">Avg Order Value</p>
            <p className={`mt-1 text-2xl text-white ${figureClass}`}>${overview.averageOrderValue.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Decisions Needed ({critical.length})</p>
        {critical.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">Nothing urgent — all clear.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {critical.map((a) => (
              <li key={a.id} className="text-sm text-white/70">
                {a.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Coming Up</p>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">Nothing on the calendar.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((e) => (
              <li key={e.id} className="flex justify-between text-sm text-white/70">
                <span>{e.title}</span>
                <span className="text-white/40">{new Date(e.date).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
