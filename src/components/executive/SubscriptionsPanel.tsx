"use client";

import { useCallback, useEffect, useState } from "react";
import type { SubscriptionSettings } from "@/lib/subscriptions/rules";
import { intervalLabel } from "@/lib/subscriptions/rules";

type Row = {
  id: string;
  productName: string;
  sizeLabel: string;
  quantity: number;
  intervalDays: number;
  discountPercent: number;
  status: "active" | "paused" | "cancelled";
  statusReason?: string;
  nextOrderAt: string;
  lastOrderReference?: string;
  createdAt: string;
  customer: { firstName: string; lastName: string; email: string };
};

const CARD = "border border-white/10 bg-black/40 p-5";

// /command-only. Subscribe and save is off until a discount is set here; the
// storefront then offers it on single-compound products (never blends or
// inactive products). A daily job places due orders (api/cron/subscriptions).
export function SubscriptionsPanel() {
  const [settings, setSettings] = useState<SubscriptionSettings | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [discount, setDiscount] = useState("");
  const [intervals, setIntervals] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/executive/subscriptions", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setSettings(data.settings);
    setRows(data.subscriptions);
    setDiscount(data.settings.discountPercent === null ? "" : String(data.settings.discountPercent));
    setIntervals(data.settings.intervalDays.join(", "));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount-time fetch
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const intervalDays = intervals
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      const res = await fetch("/api/executive/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { discountPercent: discount.trim() ? Number(discount) : null, intervalDays },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      setSettings(data.settings);
      setMessage({
        ok: true,
        text:
          data.settings.discountPercent === null
            ? "Saved. Subscribe and save is off for new customers; existing subscriptions keep running."
            : `Saved. Single-compound products now offer ${data.settings.discountPercent}% off on subscription.`,
      });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save." });
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm("Cancel this subscription? No further orders will be placed.")) return;
    const res = await fetch("/api/executive/subscriptions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "cancel" }),
    });
    if (res.ok) await load();
  }

  if (!settings) return <p className="text-sm text-white/40">Loading subscriptions…</p>;

  const live = rows.filter((r) => r.status !== "cancelled");

  return (
    <div className="space-y-6">
      <form onSubmit={save} className={CARD}>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">Subscribe and save</p>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-white/50">
          {settings.discountPercent === null
            ? "Off. Set a discount to offer subscriptions on single-compound products (never blends or inactive products)."
            : `On: ${settings.discountPercent}% off, ${settings.intervalDays.map(intervalLabel).join(" / ")}.`}{" "}
          Each delivery is a new order awaiting bank transfer, emailed to the customer with its reference
          code. The discount a customer signs up at stays fixed for their subscription.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">Discount % (blank = off)</span>
            <input
              type="number"
              min={1}
              max={90}
              step="0.5"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="Off"
              className="input-field mt-1"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">Delivery intervals, in days</span>
            <input
              value={intervals}
              onChange={(e) => setIntervals(e.target.value)}
              placeholder="30, 60, 90"
              className="input-field mt-1"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 border border-gold px-5 py-2 text-[11px] uppercase tracking-[0.15em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message && (
          <p className={`mt-3 text-xs ${message.ok ? "text-gold" : "text-red-300"}`}>{message.text}</p>
        )}
      </form>

      <div className={CARD}>
        <p className="text-xs uppercase tracking-[0.2em] text-gold">
          Subscriptions <span className="text-white/40">({live.length} live)</span>
        </p>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-white/40">No subscriptions yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.15em] text-white/40">
                  <th className="pb-3 pr-4 font-normal">Customer</th>
                  <th className="pb-3 pr-4 font-normal">Product</th>
                  <th className="pb-3 pr-4 font-normal">Every</th>
                  <th className="pb-3 pr-4 font-normal">Next order</th>
                  <th className="pb-3 pr-4 font-normal">Last order</th>
                  <th className="pb-3 pr-4 font-normal">Status</th>
                  <th className="pb-3 font-normal" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 align-top text-white/80">
                    <td className="py-3 pr-4">
                      <p className="text-white">
                        {r.customer.firstName} {r.customer.lastName}
                      </p>
                      <p className="text-xs text-white/40">{r.customer.email}</p>
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {r.productName} {r.sizeLabel} × {r.quantity}
                      <span className="block text-white/40">{r.discountPercent}% off</span>
                    </td>
                    <td className="py-3 pr-4 text-xs">{r.intervalDays} days</td>
                    <td className="py-3 pr-4 text-xs">
                      {r.status === "active" ? new Date(r.nextOrderAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{r.lastOrderReference ?? ""}</td>
                    <td className="py-3 pr-4 text-xs">
                      <span className="uppercase tracking-[0.1em]">{r.status}</span>
                      {r.statusReason && <span className="mt-1 block text-white/40">{r.statusReason}</span>}
                    </td>
                    <td className="py-3 text-right">
                      {r.status !== "cancelled" && (
                        <button
                          type="button"
                          onClick={() => cancel(r.id)}
                          className="border border-red-500/30 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
