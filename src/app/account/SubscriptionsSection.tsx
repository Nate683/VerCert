"use client";

import { useState } from "react";
import Link from "next/link";
import { intervalLabel } from "@/lib/subscriptions/rules";

export type SubscriptionView = {
  id: string;
  productName: string;
  productSlug: string;
  sizeLabel: string;
  quantity: number;
  intervalDays: number;
  discountPercent: number;
  status: "active" | "paused" | "cancelled";
  statusReason?: string;
  nextOrderAt: string;
  lastOrderReference?: string;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

// The customer's subscribe-and-save orders: when the next one is placed, and
// controls to skip it, change how often, resume or cancel.
export function SubscriptionsSection({
  initial,
  intervalOptions,
}: {
  initial: SubscriptionView[];
  intervalOptions: number[];
}) {
  const [subs, setSubs] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/account/subscriptions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.subscription) throw new Error(data.error ?? "That didn't save. Please try again.");
      setSubs((all) => all.map((s) => (s.id === id ? { ...s, ...data.subscription } : s)));
    } catch (err) {
      setError({ id, message: err instanceof Error ? err.message : "That didn't save." });
    } finally {
      setBusy(null);
    }
  }

  const shown = subs.filter((s) => s.status !== "cancelled");
  if (shown.length === 0) return null;

  return (
    <section className="mt-12 border-t border-hairline pt-8" aria-labelledby="subscriptions-heading">
      <h2 id="subscriptions-heading" className="text-xs uppercase tracking-[0.25em] text-gold-ink">
        Subscriptions
      </h2>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Each delivery is placed as a new order and emailed to you with bank transfer instructions.
        It ships once paid; nothing is charged automatically.
      </p>
      <ul className="mt-5 space-y-4">
        {shown.map((s) => (
          <li key={s.id} className={`border border-hairline p-5 ${busy === s.id ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/shop/${s.productSlug}`} className="font-serif text-lg text-navy hover:text-gold-ink">
                  {s.productName}
                </Link>
                <p className="mt-1 text-sm text-muted">
                  {s.sizeLabel} × {s.quantity} · {intervalLabel(s.intervalDays)} · {s.discountPercent}% off
                </p>
              </div>
              <span
                className={`border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${
                  s.status === "active" ? "border-navy/40 text-navy" : "border-gold/60 text-navy"
                }`}
              >
                {s.status}
              </span>
            </div>

            <p className="mt-3 text-sm text-navy">
              {s.status === "active"
                ? `Next order: ${formatDate(s.nextOrderAt)}`
                : "Paused: no orders will be placed."}
            </p>
            {s.statusReason && <p className="mt-1 text-xs text-muted">{s.statusReason}</p>}
            {s.lastOrderReference && (
              <p className="mt-1 text-xs text-muted">
                Last order:{" "}
                <Link href={`/order/${s.lastOrderReference}`} className="font-mono text-navy underline-offset-4 hover:underline">
                  {s.lastOrderReference}
                </Link>
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.14em]">
              {s.status === "active" && (
                <>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act(s.id, { action: "skip" })}
                    className="border border-hairline px-3 py-2 text-navy transition-colors hover:border-navy disabled:opacity-40"
                  >
                    Skip next order
                  </button>
                  {intervalOptions.length > 1 && (
                    <label className="flex items-center gap-2 normal-case tracking-normal text-muted">
                      Deliver
                      <select
                        value={s.intervalDays}
                        disabled={busy !== null}
                        onChange={(e) => act(s.id, { action: "interval", intervalDays: Number(e.target.value) })}
                        className="border border-hairline bg-paper px-2 py-1.5 text-sm text-navy"
                      >
                        {[...new Set([...intervalOptions, s.intervalDays])].sort((a, b) => a - b).map((d) => (
                          <option key={d} value={d}>
                            {intervalLabel(d)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
              {s.status === "paused" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => act(s.id, { action: "resume" })}
                  className="border border-hairline px-3 py-2 text-navy transition-colors hover:border-navy disabled:opacity-40"
                >
                  Resume
                </button>
              )}
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => act(s.id, { action: "cancel" })}
                className="px-1 py-2 text-muted underline-offset-4 transition-colors hover:text-navy hover:underline disabled:opacity-40"
              >
                Cancel subscription
              </button>
            </div>
            {error?.id === s.id && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error.message}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
