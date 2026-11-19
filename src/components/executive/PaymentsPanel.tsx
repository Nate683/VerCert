"use client";

import { useCallback, useEffect, useState } from "react";
import type { PaymentMethod } from "@/lib/types";
import type { PaymentMethodInfo } from "@/lib/payments/methods";

// Executive Office → Payments (Stage 3). One row per method: the switch, whether its integration is ready, whether
// customers are actually offered it, the stock reservation window, and what activating it requires.
//
// NO METHOD HAS A LIVE PROVIDER INTEGRATION. Switching a provider method on does not make it available: it stays
// "not offered" until a real, approved integration exists. Zelle and bank transfer are verified by a person and need
// only their receiving details configured on the server.

type MethodState = {
  id: PaymentMethod; label: string; enabled: boolean; ready: boolean; offered: boolean; reason: string; simulated: boolean;
  reservationMinutes: number | null; info: PaymentMethodInfo;
};
type Config = { enabled: Partial<Record<PaymentMethod, boolean>>; reservationMinutes: Partial<Record<PaymentMethod, number | null>>; achFulfillment: "after_settlement" | "after_initiation" };

export function PaymentsPanel({ variant }: { variant: "command" | "office" }) {
  const cardClass = variant === "command" ? "command-panel p-6" : "office-card";
  const [methods, setMethods] = useState<MethodState[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [simulation, setSimulation] = useState(false);
  const [draft, setDraft] = useState<Config | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/executive/payment-methods", { cache: "no-store" });
    if (!res.ok) return setMessage({ ok: false, text: `Payment settings couldn't be loaded (${res.status}).` });
    const data = await res.json();
    setMethods(data.methods);
    setConfig(data.config);
    setDraft(data.config);
    setSimulation(Boolean(data.simulation));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/executive/payment-methods", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: draft.enabled, reservationMinutes: draft.reservationMinutes, achFulfillment: draft.achFulfillment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMessage({ ok: false, text: data.error ?? `Not saved (${res.status}).` });
      setMethods(data.methods);
      setConfig(data.config);
      setDraft(data.config);
      setMessage({ ok: true, text: "Payment settings saved." });
    } finally {
      setBusy(false);
    }
  }

  if (!draft || !config) return <div className={cardClass}><p className="text-sm text-white/30">Loading…</p>{message && <p className="mt-2 text-xs text-red-300">{message.text}</p>}</div>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  return (
    <div className="space-y-6" data-payments-panel>
      <div className={cardClass}>
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">Payment methods</p>
        <p className="mt-2 border border-[var(--x-warning,#d9a441)] p-3 text-[11px] leading-relaxed text-[var(--x-warning,#d9a441)]">
          No payment provider is connected. Crypto, ACH, card, Apple Pay and Google Pay are built as integration points only and are never offered to
          customers, whatever their switch says, until an approved provider is integrated. Zelle and bank transfer are confirmed by an administrator, who
          must enter the payment reference.
          {simulation && " LOCAL SIMULATION IS ON: provider methods use simulated adapters on this machine only."}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs" data-payment-methods>
            <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40">
              <tr>
                <th className="py-2 pr-3 font-normal">Method</th>
                <th className="py-2 pr-3 font-normal">Switch</th>
                <th className="py-2 pr-3 font-normal">Offered to customers</th>
                <th className="py-2 pr-3 font-normal">Verified by</th>
                <th className="py-2 pr-3 font-normal">Stock hold</th>
                <th className="py-2 font-normal">To activate</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => {
                const legacyCrypto = m.id === "crypto";
                const on = legacyCrypto ? m.enabled : draft.enabled[m.id] === true;
                const minutes = draft.reservationMinutes[m.id];
                return (
                  <tr key={m.id} className="border-t border-white/5 align-top" data-method={m.id} data-offered={m.offered ? "1" : "0"}>
                    <td className="py-2 pr-3 text-white">{m.label}{m.info.legacy && <span className="ml-1 text-[9px] uppercase text-white/40">pre-Stage 3</span>}</td>
                    <td className="py-2 pr-3">
                      {legacyCrypto ? (
                        <span className="text-white/40">build flag ({m.enabled ? "on" : "off"})</span>
                      ) : (
                        <label className="inline-flex items-center gap-2 text-white/70">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => setDraft({ ...draft, enabled: { ...draft.enabled, [m.id]: e.target.checked } })}
                            aria-label={`${m.label} switched on`}
                            data-toggle={m.id}
                          />
                          {on ? "On" : "Off"}
                        </label>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={m.offered ? "text-[var(--x-positive,#6fbf8e)]" : "text-white/50"}>{m.offered ? "Yes" : "No"}</span>
                      <span className="block text-[10px] text-white/40">{m.reason}</span>
                    </td>
                    <td className="py-2 pr-3 text-white/60">{m.info.verification === "human" ? "Administrator (reference required)" : "Provider notification"}</td>
                    <td className="py-2 pr-3 text-white/60">
                      {m.info.reservationConfigurable ? (
                        <select
                          value={minutes === undefined ? (m.info.defaultReservationMinutes ?? "none") : (minutes ?? "none")}
                          onChange={(e) => setDraft({ ...draft, reservationMinutes: { ...draft.reservationMinutes, [m.id]: e.target.value === "none" ? null : Number(e.target.value) } })}
                          aria-label={`${m.label} reservation window`}
                          className="input-field w-auto"
                        >
                          <option value="none">No hold (deduct on payment)</option>
                          {[15, 30, 60, 120, 240, 1440, 4320].map((n) => <option key={n} value={n}>{n < 120 ? `${n} min` : `${n / 60} h`}</option>)}
                        </select>
                      ) : (
                        <span>{m.reservationMinutes ? `${m.reservationMinutes} min (fixed)` : "None — deducted when payment is confirmed"}</span>
                      )}
                    </td>
                    <td className="py-2 text-[10px] leading-relaxed text-white/45">{m.info.activationRequires}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label className="mt-4 block max-w-md text-xs text-white/60">
          <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">ACH fulfilment policy</span>
          <select
            value={draft.achFulfillment}
            onChange={(e) => setDraft({ ...draft, achFulfillment: e.target.value as Config["achFulfillment"] })}
            aria-label="ACH fulfilment policy"
            className="input-field mt-1"
          >
            <option value="after_settlement">Ship after the transfer settles (recommended)</option>
            <option value="after_initiation">Allocate and allow shipping once the transfer is initiated (risk: returns after shipment)</option>
          </select>
        </label>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || busy}
            className="border border-[var(--x-muted)] bg-[var(--x-raised)] px-5 py-2 text-xs uppercase tracking-[0.15em] text-[var(--x-text)] disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save payment settings"}
          </button>
          {message && <span role="status" className={`text-xs ${message.ok ? "text-white/70" : "text-red-300"}`} data-payments-message>{message.text}</span>}
        </div>
      </div>
    </div>
  );
}
