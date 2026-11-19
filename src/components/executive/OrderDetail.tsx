"use client";

import { useCallback, useEffect, useState } from "react";
import type { Order, RefundReasonCode } from "@/lib/types";
import type { InventoryMovement } from "@/lib/inventory-shared";
import { MOVEMENT_LABELS } from "@/lib/inventory-shared";
import type { OrderAllocation, OrderEvent, OrderReturn } from "@/lib/orders/lifecycle";
import { FULFILLMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_METHODS, methodLabel } from "@/lib/payments/methods";

// Executive Office → Orders → one order (Stage 3). Everything about it in one place, and every action an
// administrator can take on it. Each action is one server call that the database applies atomically and records
// with your name; the buttons only appear when the action is allowed, and the server re-checks anyway.

type Detail = { order: Order; events: OrderEvent[]; allocations: OrderAllocation[]; returns: OrderReturn[]; movements: InventoryMovement[] };
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const money = (n?: number | null) => (n === undefined || n === null ? "—" : `$${n.toFixed(2)}`);
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
const today = () => new Date().toISOString().slice(0, 10);
const label = (t: string) => <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">{t}</span>;
const btn = "border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)] disabled:opacity-40";
const dangerBtn = "border border-[var(--x-border-strong)] px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--x-text-2)] hover:border-[var(--x-negative)] hover:text-[var(--x-negative)] disabled:opacity-40";

const REFUND_REASONS: { value: RefundReasonCode; label: string }[] = [
  { value: "customer_request", label: "Customer Request" },
  { value: "quality_issue", label: "Quality Issue" },
  { value: "duplicate_order", label: "Duplicate Order" },
  { value: "shipping_issue", label: "Shipping Issue" },
  { value: "other", label: "Other" },
];
type Action = null | "confirm" | "void" | "cancel" | "refund" | "ship" | "return" | "review-close" | "reallocate";

export function OrderDetail({ orderId, onClose, onChanged }: { orderId: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // form fields (one action open at a time)
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);
  const [reason, setReason] = useState("");
  const [refundReason, setRefundReason] = useState<RefundReasonCode>("customer_request");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [ret, setRet] = useState({ lineIndex: 0, allocationId: "", quantity: "1", condition: "", decision: "quarantine" as "restock" | "quarantine" | "discard" });
  const [returnKey, setReturnKey] = useState(newKey);
  const [refundKey, setRefundKey] = useState(newKey);

  const load = useCallback(async () => {
    const res = await fetch(`/api/executive/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
    if (!res.ok) return setLoadError(`The order couldn't be loaded (${res.status}).`);
    setDetail(await res.json());
    setLoadError(null);
  }, [orderId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load this order on open
    load();
  }, [load]);

  function openAction(a: Action) {
    setAction(a);
    setMessage(null);
    setReason("");
    setNote("");
    setAttested(false);
    if (a === "confirm") { setReference(""); setAmount(detail ? detail.order.total.toFixed(2) : ""); setReceivedOn(today()); }
    if (a === "ship") { setCarrier(detail?.order.carrier ?? ""); setTracking(detail?.order.trackingNumber ?? ""); }
    if (a === "return") setReturnKey(newKey());
    if (a === "refund") { setAmount(""); setRefundKey(newKey()); }
  }

  async function post(path: string, body: unknown, method = "POST", success = "Saved.") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/executive/orders/${encodeURIComponent(orderId)}${path}`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? `That didn't go through (${res.status}).` });
        if (data.order) { await load(); onChanged(); }
        return;
      }
      const outcome = data.outcome as string | undefined;
      setMessage({
        ok: !data.review,
        text: outcome === "insufficient_stock" || outcome === "late_payment" ? `Payment recorded — but the order is in Administrative Review: ${data.review}`
          : outcome === "on_hold" ? `Not reallocated: ${data.review}. Nothing was moved; the order stays on hold.`
          : data.result?.outcome === "partially_refunded" ? `Partial refund of ${Number(data.result.amount).toFixed(2)} recorded — ${Number(data.result.refunded_total).toFixed(2)} of ${Number(data.result.paid).toFixed(2)} refunded so far, ${Number(data.result.remaining).toFixed(2)} remaining. No stock changed.`
          : data.result?.outcome === "duplicate" ? "That refund was already recorded. Nothing more was changed."
          : success,
      });
      setAction(null);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <div className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{loadError}</div>;
  if (!detail) return <div className="mt-4 text-sm text-white/30">Loading order…</div>;
  const { order, events, allocations, returns, movements } = detail;
  const info = PAYMENT_METHODS[order.paymentMethod];
  const pay = order.paymentStatus ?? "pending";
  const ful = order.fulfillmentStatus ?? "unfulfilled";
  const human = info?.verification === "human";
  const paidAmount = order.paymentAmountReceived ?? order.total;
  const refunded = order.refundAmount ?? (order.refundedAt ? order.total : 0);
  const shipped = ["shipped", "delivered", "returned"].includes(ful);
  const can = {
    confirm: human && (pay === "pending" || pay === "processing") && ful !== "cancelled",
    void: pay === "confirmed" && order.paymentSource === "admin" && ["unfulfilled", "allocated", "processing"].includes(ful),
    processing: ful === "allocated" && !order.needsReview,
    ship: (ful === "allocated" || ful === "processing") && !order.needsReview,
    deliver: ful === "shipped",
    cancel: ["unfulfilled", "reserved", "allocated", "processing"].includes(ful),
    refund: Boolean(order.paidAt) && (pay === "confirmed" || pay === "partially_refunded"),
    // Unshipped, filled from a lot that is no longer approved (the database re-checks eligibility exactly).
    reallocate: ["allocated", "processing"].includes(ful) && allocations.some((a) => a.state === "committed" && (a.lotReleaseStatus !== "approved" || a.lotTestingStatus === "failed")),
    return: shipped,
    allocate: order.needsReview && pay === "confirmed" && ful === "unfulfilled",
    closeReview: Boolean(order.needsReview),
  };
  const committed = allocations.filter((a) => a.state === "committed");
  const lineAllocs = committed.filter((a) => a.lineIndex === ret.lineIndex);

  return (
    <div className="mt-6 border border-white/15 p-4 sm:p-5" data-order-detail={order.reference}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--x-muted)]">Order</p>
          <p className="mt-1 font-mono text-lg text-white">{order.reference}</p>
          <p className="text-[11px] text-white/50">Placed {when(order.createdAt)} · {methodLabel(order.paymentMethod)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-white/25 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70" data-payment-status={pay}>{PAYMENT_STATUS_LABELS[pay] ?? pay}</span>
          <span className="border border-white/25 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-white/70" data-fulfillment-status={ful}>{FULFILLMENT_STATUS_LABELS[ful] ?? ful}</span>
          <button type="button" onClick={onClose} className={btn}>Close</button>
        </div>
      </div>

      {order.needsReview && (
        <div className="mt-4 border border-[var(--x-warning,#d9a441)] p-3 text-xs text-[var(--x-warning,#d9a441)]" data-review>
          <p className="uppercase tracking-[0.12em]">Administrative review</p>
          <p className="mt-1">{order.reviewReason}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {can.allocate && <button type="button" disabled={busy} onClick={() => post("/review", { action: "allocate" }, "POST", "Stock allocated; review closed.")} className={btn} data-action="allocate">Allocate stock now</button>}
            <button type="button" disabled={busy} onClick={() => openAction("review-close")} className={btn} data-action="close-review">Close review with a note</button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="border border-white/10 p-3 text-xs text-white/70">
          {label("Customer and shipping")}
          <p className="mt-1 text-white">{order.customer.firstName} {order.customer.lastName}</p>
          <p>{order.customer.email}</p>
          <p className="mt-1">{order.customer.address}<br />{order.customer.city}, {order.customer.state} {order.customer.postalCode}<br />{order.customer.country}</p>
          {order.researchAttestation && <p className="mt-1 text-[10px] text-white/40">RUO attested {when(order.researchAttestation.at)}</p>}
          {(order.carrier || order.trackingNumber) && <p className="mt-2">Shipment: {order.carrier ?? ""} {order.trackingNumber ?? ""} · shipped {when(order.shippedAt)}</p>}
        </section>
        <section className="border border-white/10 p-3 text-xs text-white/70" data-payment-record>
          {label("Payment")}
          <p className="mt-1">{methodLabel(order.paymentMethod)} — {info?.verification === "human" ? "verified by an administrator" : "verified by the provider"}{info && !info.legacy ? " · no live integration" : ""}</p>
          <p>Status: {PAYMENT_STATUS_LABELS[pay] ?? pay}</p>
          <p>Reference: <span className="font-mono text-white">{order.paymentReference ?? "—"}</span></p>
          <p>Amount received: {money(order.paymentAmountReceived)} {order.paymentReceivedOn ? `on ${order.paymentReceivedOn}` : ""}</p>
          <p>Confirmed by: {order.paymentConfirmedBy ?? "—"} · {when(order.paymentConfirmedAt)}</p>
          {order.paymentSource && (
            <p className={order.paymentSource === "simulated" ? "text-[var(--x-negative,#e0675f)]" : ""}>
              Source: {order.paymentSource === "simulated" ? "SIMULATED (local test — not a real payment)" : order.paymentSource === "legacy" ? "recorded before Stage 3 (no reference on file)" : order.paymentSource}
            </p>
          )}
          {order.reservationExpiresAt && <p>Stock hold until: {when(order.reservationExpiresAt)}</p>}
          {refunded > 0 && (
            <p className="text-red-300" data-refund-summary>
              {pay === "refunded" ? "Fully refunded" : "Partially refunded"}: {money(refunded)} of {money(paidAmount)}
              {pay === "partially_refunded" ? ` (${money(paidAmount - refunded)} remaining)` : ""}
              {order.refundedAt ? ` · completed ${when(order.refundedAt)}` : ""}
            </p>
          )}
        </section>
        <section className="border border-white/10 p-3 text-xs text-white/70">
          {label("Totals")}
          <p className="mt-1">Subtotal {money(order.subtotal)}</p>
          {order.discountAmount ? <p>Discount −{money(order.discountAmount)} {order.promoCode ? `(${order.promoCode})` : ""}</p> : null}
          <p className="text-white">Total {money(order.total)}</p>
          {order.cancelledAt && <p className="mt-2">Cancelled {when(order.cancelledAt)}{order.cancelReason ? ` — ${order.cancelReason}` : ""}</p>}
        </section>
      </div>

      <section className="mt-4 overflow-x-auto">
        {label("Lines")}
        <table className="mt-1 w-full min-w-[640px] text-left text-xs" data-order-lines>
          <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40">
            <tr><th className="py-1 pr-3 font-normal">#</th><th className="py-1 pr-3 font-normal">Product / strength</th><th className="py-1 pr-3 font-normal">SKU · strength ID</th>
              <th className="py-1 pr-3 text-right font-normal">Qty</th><th className="py-1 pr-3 text-right font-normal">Unit price</th><th className="py-1 text-right font-normal">Line total</th></tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i} className="border-t border-white/5 text-white/80">
                <td className="py-1 pr-3">{i + 1}</td>
                <td className="py-1 pr-3">{it.name} {it.sizeLabel}{it.subscription ? " · subscription" : ""}</td>
                <td className="py-1 pr-3 font-mono text-[10px] text-white/50">{it.sku ?? "—"}<span className="block">{it.strengthId ?? "no strength ID (pre-Stage-1 line)"}</span></td>
                <td className="py-1 pr-3 text-right">{it.quantity}</td>
                <td className="py-1 pr-3 text-right">{money(it.priceUsd)}</td>
                <td className="py-1 text-right">{money(it.priceUsd * it.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 overflow-x-auto" data-allocations>
        {label("Inventory: reservations and deductions by lot")}
        {allocations.length === 0 ? (
          <p className="mt-1 text-xs text-white/40">
            {order.paymentSource === "legacy" ? "Deducted per SKU before Stage 3 — no lot assignment on record." : "No stock reserved or deducted for this order."}
          </p>
        ) : (
          <table className="mt-1 w-full min-w-[640px] text-left text-xs">
            <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40">
              <tr><th className="py-1 pr-3 font-normal">Line</th><th className="py-1 pr-3 font-normal">SKU</th><th className="py-1 pr-3 font-normal">Lot</th>
                <th className="py-1 pr-3 text-right font-normal">Qty</th><th className="py-1 pr-3 font-normal">State</th><th className="py-1 font-normal">Detail</th></tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id} className="border-t border-white/5 text-white/80" data-allocation={a.state}>
                  <td className="py-1 pr-3">{a.lineIndex + 1}</td>
                  <td className="py-1 pr-3 font-mono text-[10px]">{a.sku}</td>
                  <td className="py-1 pr-3 font-mono text-[10px]">{a.lotCode}<span className="block text-white/40">{a.manufacturerLot ?? ""} {a.vericertLotNumber ? `· ${a.vericertLotNumber}` : ""} · {a.lotReleaseStatus}</span></td>
                  <td className="py-1 pr-3 text-right">{a.quantity}{a.returnedQuantity ? ` (${a.returnedQuantity} returned)` : ""}</td>
                  <td className="py-1 pr-3">{a.state}</td>
                  <td className="py-1 text-white/50">
                    {a.state === "reserved" && `expires ${when(a.expiresAt)}`}
                    {a.state === "committed" && `deducted ${when(a.committedAt ?? a.createdAt)}`}
                    {a.state === "released" && `released ${when(a.releasedAt)} by ${a.releasedBy} — ${a.releaseReason}`}
                    {a.state === "restored" && `restored ${when(a.restoredAt)} by ${a.restoredBy}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {returns.length > 0 && (
          <div className="mt-2 text-xs text-white/70" data-returns>
            {label("Returns")}
            {returns.map((r) => (
              <p key={r.id}>Line {r.lineIndex + 1}: {r.quantity} unit(s) from {r.fromLot ?? "—"} — {r.decision}{r.toLot ? ` into ${r.toLot}` : ""} · {r.condition} · {r.reason} · {r.decidedBy} {when(r.createdAt)}</p>
            ))}
          </div>
        )}
      </section>

      {/* Actions */}
      <section className="mt-4 border-t border-white/10 pt-4" data-order-actions>
        <div className="flex flex-wrap gap-2">
          {can.confirm && <button type="button" onClick={() => openAction("confirm")} className={btn} data-action="confirm">Confirm payment…</button>}
          {can.void && <button type="button" onClick={() => openAction("void")} className={dangerBtn} data-action="void">Void confirmation…</button>}
          {can.processing && <button type="button" disabled={busy} onClick={() => post("/status", { status: "processing" }, "PATCH", "Marked processing.")} className={btn} data-action="processing">Mark processing</button>}
          {can.ship && <button type="button" onClick={() => openAction("ship")} className={btn} data-action="ship">Record shipment…</button>}
          {can.deliver && <button type="button" disabled={busy} onClick={() => post("/status", { status: "delivered" }, "PATCH", "Marked delivered.")} className={btn} data-action="deliver">Mark delivered</button>}
          {can.cancel && <button type="button" onClick={() => openAction("cancel")} className={dangerBtn} data-action="cancel">Cancel order…</button>}
          {can.refund && <button type="button" onClick={() => openAction("refund")} className={dangerBtn} data-action="refund">Record refund…</button>}
          {can.return && <button type="button" onClick={() => openAction("return")} className={btn} data-action="return">Record return…</button>}
          {can.reallocate && <button type="button" onClick={() => openAction("reallocate")} className={btn} data-action="reallocate">Reallocate to approved lots…</button>}
        </div>
        {!human && (pay === "pending" || pay === "processing") && (
          <p className="mt-2 text-[11px] text-white/45">{methodLabel(order.paymentMethod)} is confirmed only by its payment provider. No provider is connected, so no real payment can arrive for it.</p>
        )}

        {action === "confirm" && (
          <form className="mt-3 grid grid-cols-1 gap-3 border border-white/15 p-3 sm:grid-cols-3" data-form="confirm"
            onSubmit={(e) => { e.preventDefault(); post("/confirm-payment", { reference: reference.trim(), amountReceived: Number(amount), receivedOn, note: note.trim() || undefined, attested }, "POST", "Payment confirmed and stock deducted."); }}>
            <p className="text-[11px] text-white/60 sm:col-span-3">
              Enter exactly what the {methodLabel(order.paymentMethod)} notification shows. It is stored on the order with your name and the time. The amount must equal the order total ({money(order.total)}); otherwise the order goes to review and is not confirmed.
            </p>
            <label className="block">{label("Confirmation reference / transaction ID")}<input value={reference} onChange={(e) => setReference(e.target.value)} required minLength={4} maxLength={80} aria-label="Confirmation reference" className="input-field mt-1" /></label>
            <label className="block">{label("Amount received (USD)")}<input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required aria-label="Amount received" className="input-field mt-1" /></label>
            <label className="block">{label("Date received")}<input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} required aria-label="Date received" className="input-field mt-1" /></label>
            <label className="block sm:col-span-3">{label("Note (optional)")}<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="Note" className="input-field mt-1" /></label>
            <label className="flex items-start gap-2 text-xs text-white/70 sm:col-span-3">
              <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} aria-label="I have seen this payment" />
              I have seen this payment in the receiving account.
            </label>
            <div className="flex gap-2 sm:col-span-3">
              <button type="submit" disabled={busy || !attested || reference.trim().length < 4} className={btn}>{busy ? "Confirming…" : "Confirm payment"}</button>
              <button type="button" onClick={() => setAction(null)} className={btn}>Cancel</button>
            </div>
          </form>
        )}

        {(action === "void" || action === "cancel" || action === "review-close") && (
          <form className="mt-3 space-y-2 border border-white/15 p-3" data-form={action}
            onSubmit={(e) => {
              e.preventDefault();
              if (action === "void") post("/void-payment", { reason: reason.trim() }, "POST", "Confirmation voided; stock restored to its lots; order back to awaiting payment.");
              else if (action === "cancel") post("/cancel", { reason: reason.trim() || undefined }, "POST", "Order cancelled; held or deducted stock returned to its lots.");
              else post("/review", { action: "close", note: reason.trim() }, "POST", "Review closed.");
            }}>
            <p className="text-[11px] text-white/60">
              {action === "void" && "Voids the confirmation entered by an administrator. Deducted units go back to their lots and the order returns to awaiting payment. The original confirmation stays in the history."}
              {action === "cancel" && `Cancels the order. Reserved units are released and deducted units go back to the lots they came from.${pay === "confirmed" ? " Payment was confirmed: record the refund too." : ""}`}
              {action === "review-close" && "Closes the review without changing stock or payment. Say how it was resolved."}
            </p>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-label="Reason" placeholder={action === "cancel" ? "Reason (optional)" : "Reason (required, at least 10 characters)"} className="input-field w-full" />
            <div className="flex gap-2">
              <button type="submit" disabled={busy || (action !== "cancel" && reason.trim().length < 10)} className={dangerBtn}>{busy ? "Working…" : action === "void" ? "Void confirmation" : action === "cancel" ? "Cancel order" : "Close review"}</button>
              <button type="button" onClick={() => setAction(null)} className={btn}>Back</button>
            </div>
          </form>
        )}

        {action === "refund" && (
          <form className="mt-3 grid grid-cols-1 gap-3 border border-white/15 p-3 sm:grid-cols-3" data-form="refund"
            onSubmit={(e) => { e.preventDefault(); post("/refund", { reason: refundReason, ...(amount ? { amount: Number(amount) } : {}), ...(note.trim() ? { note: note.trim() } : {}), idempotencyKey: refundKey }, "POST", shipped ? "Order fully refunded. No stock was restored (the order had shipped) — record a return if goods come back." : "Order fully refunded; it was cancelled and its stock restored to its lots."); }}>
            <p className="text-[11px] text-white/60 sm:col-span-3">
              Records a refund (no money is moved by this system). Paid {money(paidAmount)}; refunded so far {money(refunded)}; remaining {money(paidAmount - refunded)}.
              Refunds add up and can&apos;t exceed what was paid. A partial refund changes nothing else.{" "}
              {shipped ? "When the remaining balance is refunded: the order has shipped, so NO stock is restored — record a return if goods come back." : "When the remaining balance is refunded, the unshipped order is also cancelled and its stock goes back to its lots."}
            </p>
            <label className="block">{label("Reason")}
              <select value={refundReason} onChange={(e) => setRefundReason(e.target.value as RefundReasonCode)} aria-label="Refund reason" className="input-field mt-1">
                {REFUND_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label className="block">{label(`Amount (blank = the remaining ${money(paidAmount - refunded)})`)}<input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Refund amount" className="input-field mt-1" /></label>
            <label className="block">{label("Note")}<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} aria-label="Refund note" className="input-field mt-1" /></label>
            <div className="flex gap-2 sm:col-span-3">
              <button type="submit" disabled={busy} className={dangerBtn}>{busy ? "Recording…" : "Record refund"}</button>
              <button type="button" onClick={() => setAction(null)} className={btn}>Back</button>
            </div>
          </form>
        )}

        {action === "ship" && (
          <form className="mt-3 grid grid-cols-1 gap-3 border border-white/15 p-3 sm:grid-cols-3" data-form="ship"
            onSubmit={(e) => { e.preventDefault(); post("/status", { status: "shipped", carrier: carrier.trim() || undefined, trackingNumber: tracking.trim() }, "PATCH", "Shipment recorded; the customer is emailed the tracking number."); }}>
            <label className="block">{label("Carrier")}<input value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength={100} aria-label="Carrier" className="input-field mt-1" /></label>
            <label className="block">{label("Tracking number (required)")}<input value={tracking} onChange={(e) => setTracking(e.target.value)} required maxLength={100} aria-label="Tracking number" className="input-field mt-1" /></label>
            <div className="flex items-end gap-2">
              <button type="submit" disabled={busy || !tracking.trim()} className={btn}>{busy ? "Saving…" : "Record shipment"}</button>
              <button type="button" onClick={() => setAction(null)} className={btn}>Back</button>
            </div>
          </form>
        )}

        {action === "return" && (
          <form className="mt-3 grid grid-cols-1 gap-3 border border-white/15 p-3 sm:grid-cols-3" data-form="return"
            onSubmit={(e) => { e.preventDefault(); post("/return", { lineIndex: ret.lineIndex, ...(ret.allocationId ? { allocationId: ret.allocationId } : {}), quantity: Number(ret.quantity), condition: ret.condition.trim(), decision: ret.decision, reason: reason.trim(), idempotencyKey: returnKey }, "POST", "Return recorded."); }}>
            <p className="text-[11px] text-white/60 sm:col-span-3">Restock puts units back into the lot they shipped from (sellable only if that lot is approved). Quarantine holds them in the strength&apos;s returns lot (not sellable). Discard records them with no stock change.</p>
            <label className="block">{label("Line")}
              <select value={ret.lineIndex} onChange={(e) => setRet({ ...ret, lineIndex: Number(e.target.value), allocationId: "" })} aria-label="Return line" className="input-field mt-1">
                {order.items.map((it, i) => <option key={i} value={i}>{i + 1}. {it.name} {it.sizeLabel} × {it.quantity}</option>)}
              </select>
            </label>
            <label className="block">{label("Lot it shipped from")}
              <select value={ret.allocationId} onChange={(e) => setRet({ ...ret, allocationId: e.target.value })} aria-label="Return lot" className="input-field mt-1">
                {lineAllocs.length === 0 && <option value="">No lot on record (held for inspection)</option>}
                {lineAllocs.length > 0 && <option value="">Choose…</option>}
                {lineAllocs.map((a) => <option key={a.id} value={a.id}>{a.lotCode} ({a.quantity - a.returnedQuantity} still out)</option>)}
              </select>
            </label>
            <label className="block">{label("Units returned")}<input type="number" min={1} step={1} value={ret.quantity} onChange={(e) => setRet({ ...ret, quantity: e.target.value })} aria-label="Units returned" className="input-field mt-1" /></label>
            <label className="block">{label("Condition")}<input value={ret.condition} onChange={(e) => setRet({ ...ret, condition: e.target.value })} maxLength={300} aria-label="Condition" className="input-field mt-1" /></label>
            <label className="block">{label("Decision")}
              <select value={ret.decision} onChange={(e) => setRet({ ...ret, decision: e.target.value as typeof ret.decision })} aria-label="Restocking decision" className="input-field mt-1">
                <option value="quarantine">Quarantine (hold for inspection)</option>
                <option value="restock" disabled={lineAllocs.length === 0}>Restock into the lot it shipped from</option>
                <option value="discard">Discard (no stock change)</option>
              </select>
            </label>
            <label className="block">{label("Reason")}<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} aria-label="Return reason" className="input-field mt-1" /></label>
            <div className="flex gap-2 sm:col-span-3">
              <button type="submit" disabled={busy || (lineAllocs.length > 0 && !ret.allocationId)} className={btn}>{busy ? "Recording…" : "Record return"}</button>
              <button type="button" onClick={() => setAction(null)} className={btn}>Back</button>
            </div>
          </form>
        )}

        {action === "reallocate" && (
          <form className="mt-3 space-y-2 border border-white/15 p-3" data-form="reallocate"
            onSubmit={(e) => { e.preventDefault(); post("/reallocate", { reason: reason.trim() }, "POST", "Reallocated: the units now come from approved lots. The original allocation is kept in the history."); }}>
            <p className="text-[11px] text-white/60">
              Moves the units this order took from lots that are no longer approved onto approved lots of the same strength, oldest first, in one step.
              The original allocation stays in the history. If approved stock can&apos;t cover it, nothing moves and the order stays on hold.
            </p>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} aria-label="Reallocation reason" placeholder="Reason (required, at least 10 characters)" className="input-field w-full" />
            <div className="flex gap-2">
              <button type="submit" disabled={busy || reason.trim().length < 10} className={btn}>{busy ? "Reallocating…" : "Reallocate"}</button>
              <button type="button" onClick={() => setAction(null)} className={btn}>Back</button>
            </div>
          </form>
        )}

        {message && (
          <p role="status" className={`mt-3 border p-3 text-xs ${message.ok ? "border-white/20 text-white/80" : "border-[var(--x-warning,#d9a441)] text-[var(--x-warning,#d9a441)]"}`} data-order-message>
            {message.text}
          </p>
        )}
      </section>

      <section className="mt-4 overflow-x-auto" data-order-history>
        {label("Activity history")}
        <table className="mt-1 w-full min-w-[720px] text-left text-xs">
          <thead className="text-[9px] uppercase tracking-[0.12em] text-white/40">
            <tr><th className="py-1 pr-3 font-normal">When</th><th className="py-1 pr-3 font-normal">Event</th><th className="py-1 pr-3 font-normal">By</th>
              <th className="py-1 pr-3 font-normal">Payment</th><th className="py-1 pr-3 font-normal">Fulfillment</th><th className="py-1 font-normal">Details</th></tr>
          </thead>
          <tbody>
            {events.length === 0 && <tr><td colSpan={6} className="py-2 text-white/40">No recorded events (orders placed before Stage 3 have their earlier history in the activity log).</td></tr>}
            {events.map((e) => (
              <tr key={e.id} className="border-t border-white/5 align-top text-white/70" data-event={e.type}>
                <td className="py-1 pr-3 whitespace-nowrap text-white/50">{when(e.createdAt)}</td>
                <td className="py-1 pr-3 text-white">{e.type.replace(/_/g, " ")}{e.source === "simulated" && <span className="ml-1 text-[9px] uppercase text-[var(--x-negative,#e0675f)]">simulated</span>}</td>
                <td className="py-1 pr-3">{e.actor}</td>
                <td className="py-1 pr-3">{e.paymentBefore === e.paymentAfter ? e.paymentAfter : `${e.paymentBefore} → ${e.paymentAfter}`}</td>
                <td className="py-1 pr-3">{e.fulfillmentBefore === e.fulfillmentAfter ? e.fulfillmentAfter : `${e.fulfillmentBefore} → ${e.fulfillmentAfter}`}</td>
                <td className="py-1 text-[10px] text-white/45">{Object.entries(e.details).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {movements.length > 0 && (
          <div className="mt-3">
            {label("Inventory movements caused by this order")}
            {movements.map((m) => (
              <p key={m.id} className="text-[11px] text-white/60">
                {when(m.createdAt)} · {MOVEMENT_LABELS[m.type] ?? m.type} · {m.sku} {m.lotCode ? `lot ${m.lotCode}` : ""} · physical {m.previous} → {m.resulting}{m.reservedChange ? `, reserved ${m.previousReserved} → ${m.resultingReserved}` : ""} · {m.actor}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
