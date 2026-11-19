"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReservationRow, SweepHeartbeat } from "@/lib/inventory-shared";
import { methodLabel } from "@/lib/payments/methods";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";

// Executive Office → Reservations (Stage 3, governance B). A reservation that is never released permanently lowers
// sellable stock with no visible cause, so every live one is listed here: order, SKU, lot, quantity, created and
// expiry time. Anything past its expiry and still held is flagged — that means the expiry sweep hasn't run since —
// and can be released by hand (reason required; the release is recorded with the administrator's name). The
// sweep's heartbeat shows when it last ran, and warns when it looks stopped.

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never");
const ago = (iso: string | null, now: number) => {
  if (!iso) return null;
  const m = Math.round((now - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
// The scheduled sweep runs once a day (vercel.json). It is "stopped" when its last run is more than 26 hours old
// (a day plus margin) or it has never run.
const STALE_HOURS = 26;

export function ReservationsPanel({ variant }: { variant: "command" | "office" }) {
  const cardClass = variant === "command" ? "command-panel p-6" : "office-card";
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [heartbeat, setHeartbeat] = useState<SweepHeartbeat | null>(null);
  const [serverNow, setServerNow] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/executive/reservations", { cache: "no-store" });
    if (!res.ok) {
      setError(`Reservations couldn't be loaded (${res.status}).`);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRows(data.reservations ?? []);
    setHeartbeat(data.heartbeat ?? null);
    setServerNow(Date.parse(data.now));
    setError(null);
    setLoading(false);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);
  useLiveRefresh(load, 20000, Boolean(releasing) || busy);

  const stuck = rows.filter((r) => r.expired);
  const lastAny = heartbeat?.lastAnyRun ?? null;
  const lastCron = heartbeat?.lastCronRun ?? null;
  const sweepStale = !lastCron || serverNow - Date.parse(lastCron) > STALE_HOURS * 3600_000;

  async function sweepNow() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/executive/reservations", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? `Sweep ran: ${data.released} reservation(s) released.` : data.error ?? `Sweep failed (${res.status}).`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function release(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/executive/reservations/${encodeURIComponent(id)}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? `Release failed (${res.status}).`);
        return;
      }
      setMessage("Reservation released and recorded.");
      setReleasing(null);
      setReason("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-reservations-panel>
      <div className={cardClass}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Stock reservations</p>
          <p className="text-[11px] text-white/40" data-reservation-summary>
            {rows.length} live · {rows.reduce((a, r) => a + r.quantity, 0)} units held ·{" "}
            <span className={stuck.length ? "text-[var(--x-negative,#e0675f)]" : ""}>{stuck.length} past expiry, not released</span>
          </p>
        </div>

        <div
          className={`mt-4 border p-3 text-xs ${sweepStale ? "border-[var(--x-warning,#d9a441)] text-[var(--x-warning,#d9a441)]" : "border-white/15 text-white/60"}`}
          data-heartbeat={sweepStale ? "stale" : "ok"}
        >
          <p>
            Expiry sweep — last run: {when(lastAny)}
            {lastAny && ` (${ago(lastAny, serverNow)}, ${heartbeat?.lastAnySource})`} · last scheduled (cron) run: {when(heartbeat?.lastCronRun ?? null)} ·{" "}
            {heartbeat?.runsLast24h ?? 0} run(s) in 24 h
          </p>
          {sweepStale && (
            <p className="mt-1">
              {lastCron ? `The daily scheduled sweep hasn't run for more than ${STALE_HOURS} hours.` : "The daily scheduled sweep has never run."} Shoppers are
              unaffected — expired holds count as free the moment they expire and are released at checkout — but the stored Reserved figure and
              this list may include holds that have run out. Check the Vercel cron job and CRON_SECRET, or run the sweep now.
            </p>
          )}
          <button
            type="button"
            onClick={sweepNow}
            disabled={busy}
            className="mt-2 border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:text-white disabled:opacity-40"
          >
            Run sweep now
          </button>
        </div>

        {error && <p className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
        {message && <p role="status" className="mt-4 border border-white/20 p-3 text-xs text-white/80" data-reservation-message>{message}</p>}

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-white/30">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-white/40">No stock is reserved right now.</p>
          ) : (
            <table className="w-full min-w-[820px] text-left text-xs" data-reservations-table>
              <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40">
                <tr>
                  <th className="py-2 pr-3 font-normal">Order</th>
                  <th className="py-2 pr-3 font-normal">SKU</th>
                  <th className="py-2 pr-3 font-normal">Lot</th>
                  <th className="py-2 pr-3 text-right font-normal">Qty</th>
                  <th className="py-2 pr-3 font-normal">Method / payment</th>
                  <th className="py-2 pr-3 font-normal">Created</th>
                  <th className="py-2 pr-3 font-normal">Expires</th>
                  <th className="py-2 font-normal" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-white/5 align-top ${r.expired ? "bg-red-500/10" : ""}`} data-reservation={r.id} data-expired={r.expired ? "1" : "0"}>
                    <td className="py-2 pr-3 font-mono text-white">{r.orderReference}</td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-white/70">{r.sku}</td>
                    <td className="py-2 pr-3 font-mono text-[10px] text-white/70">{r.lotCode}</td>
                    <td className="py-2 pr-3 text-right text-white">{r.quantity}</td>
                    <td className="py-2 pr-3 text-white/60">{methodLabel(r.paymentMethod)} · {r.paymentStatus}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-white/50">{when(r.createdAt)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className={r.expired ? "text-[var(--x-negative,#e0675f)]" : "text-white/70"}>{when(r.expiresAt)}</span>
                      {r.expired && (
                        <span className="ml-2 border border-[var(--x-negative,#e0675f)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--x-negative,#e0675f)]">
                          Expired — not released
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {releasing === r.id ? (
                        <div className="flex min-w-[240px] flex-col items-end gap-2">
                          <input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason (required)"
                            aria-label="Reason for releasing"
                            maxLength={300}
                            className="input-field w-full"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busy || reason.trim().length < 3}
                              onClick={() => release(r.id)}
                              className="border border-[var(--x-negative,#e0675f)] px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--x-negative,#e0675f)] disabled:opacity-40"
                            >
                              Confirm release
                            </button>
                            <button type="button" onClick={() => setReleasing(null)} className="border border-white/15 px-2 py-1 text-[10px] uppercase text-white/50">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setReleasing(r.id); setReason(r.expired ? "Expired; sweep had not released it" : ""); }}
                          data-release={r.id}
                          className="border border-white/20 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:text-white"
                        >
                          Release
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
