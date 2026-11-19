"use client";

import { useCallback, useEffect, useState } from "react";
import type { Order, OrderStatus } from "@/lib/types";
import { LiveIndicator } from "./LiveIndicator";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";
import { OrderDetail } from "./OrderDetail";
import { FULFILLMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_METHODS, methodLabel } from "@/lib/payments/methods";

// Executive Office → Orders (Stage 3). Search by order number, customer, email or SKU; filter by payment status,
// fulfillment status, method, review and date. Payment and fulfillment are shown separately. Open an order for its
// details, lots, history and every action.
//
// Removed in Stage 3 (governance C): "Mark Paid" and "Bulk Mark Paid". Confirming a payment a person verified now
// requires the confirmation reference, amount and date — in the order's detail view.

const sel = "border border-white/15 bg-[var(--x-base)] px-3 py-2 text-xs uppercase tracking-[0.1em] text-white/70 focus:border-[var(--x-muted)] focus:outline-none";
const BOARD_COLUMNS: OrderStatus[] = ["awaiting_payment", "paid", "processing", "shipped", "delivered"];
const CANCELLABLE = ["unfulfilled", "reserved", "allocated", "processing"];

export function OrderTable({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState<string>();
  const [search, setSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<"table" | "board">("table");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    if (fulfillmentStatus) params.set("fulfillmentStatus", fulfillmentStatus);
    if (paymentMethod) params.set("paymentMethod", paymentMethod);
    if (reviewOnly) params.set("review", "1");
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/executive/orders?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders);
      setAsOf(new Date().toISOString());
    }
    setLoading(false);
  }, [search, paymentStatus, fulfillmentStatus, paymentMethod, reviewOnly, from, to]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when filters change
    load();
    // An order opened from a link (?order=<id>) — kept on refresh.
    const id = new URLSearchParams(window.location.search).get("order");
    if (id) setOpenId((cur) => cur ?? id);
  }, [load]);

  // Poll for new/updated orders; paused while an order is open (its forms hold unsaved input) or a bulk action runs.
  useLiveRefresh(load, 20000, Boolean(openId) || bulkRunning);

  function openOrder(id: string | null) {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("order", id);
    else url.searchParams.delete("order");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function handleBulkCancel() {
    if (!window.confirm(`Cancel ${selected.size} selected order(s)? Held or deducted stock goes back to its lots.`)) return;
    setBulkRunning(true);
    setActionError(null);
    const failed: string[] = [];
    try {
      for (const id of selected) {
        const order = orders.find((o) => o.id === id);
        if (!order || !CANCELLABLE.includes(order.fulfillmentStatus ?? "")) continue;
        const res = await fetch(`/api/executive/orders/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Bulk cancel" }) });
        if (!res.ok) failed.push(order.reference);
      }
      if (failed.length) setActionError(`Not cancelled: ${failed.join(", ")}`);
      setSelected(new Set());
      await load();
    } finally {
      setBulkRunning(false);
    }
  }

  const cardClass = isCommand ? "command-panel p-6" : "office-card";
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className={cardClass} data-orders-panel>
      <div className="mb-3">
        <LiveIndicator variant={variant} asOf={asOf} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Order number, customer, email or SKU…"
          aria-label="Search orders"
          className="min-w-[220px] flex-1 border border-white/15 bg-[var(--x-base)] px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-[var(--x-muted)] focus:outline-none"
        />
        <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} aria-label="Payment status" className={sel}>
          <option value="">All payment statuses</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={fulfillmentStatus} onChange={(e) => setFulfillmentStatus(e.target.value)} aria-label="Fulfillment status" className={sel}>
          <option value="">All fulfillment statuses</option>
          {Object.entries(FULFILLMENT_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label="Payment method" className={sel}>
          <option value="">All methods</option>
          {Object.values(PAYMENT_METHODS).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-white/60">
          From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className={sel} />
        </label>
        <label className="flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-white/60">
          To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className={sel} />
        </label>
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-white/60">
          <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} aria-label="Needs review only" /> Needs review
        </label>
        <div className="flex gap-1">
          {(["table", "board"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`border px-3 py-2 text-xs uppercase tracking-[0.1em] ${view === v ? "border-gold text-gold" : "border-white/15 text-white/50"}`}>
              {v === "table" ? "Table" : "Board"}
            </button>
          ))}
        </div>
      </div>

      {selected.size > 0 && view === "table" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border border-[var(--x-border-strong)] bg-[var(--x-text)]/[0.03] p-3">
          <span className="text-xs text-white/70">{selected.size} selected</span>
          <button type="button" onClick={handleBulkCancel} disabled={bulkRunning}
            className="border border-[var(--x-border-strong)] px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--x-text-2)] hover:border-[var(--x-negative)] hover:text-[var(--x-negative)] disabled:opacity-40">
            Bulk Cancel
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-[10px] uppercase tracking-[0.1em] text-white/40 hover:text-white">Clear</button>
          <span className="text-[10px] text-white/40">Payments are confirmed one at a time, each with its reference.</span>
        </div>
      )}
      {actionError && <p className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{actionError}</p>}

      {openId && <OrderDetail key={openId} orderId={openId} onClose={() => openOrder(null)} onChanged={load} />}

      {view === "board" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {BOARD_COLUMNS.map((col) => {
            const columnOrders = orders.filter((o) => o.status === col);
            return (
              <div key={col} className="min-w-[220px] border border-white/10 bg-[var(--x-base)]/30 p-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">{col.replace("_", " ")} ({columnOrders.length})</p>
                <div className="mt-3 space-y-2">
                  {columnOrders.map((order) => (
                    <button key={order.id} type="button" onClick={() => openOrder(order.id)} className="block w-full border border-white/10 bg-[var(--x-base)]/60 p-2.5 text-left text-xs">
                      <span className={isCommand ? "font-mono text-white" : "text-white"}>{order.reference}</span>
                      {order.needsReview && <span className="ml-2 text-[9px] uppercase text-[var(--x-warning,#d9a441)]">review</span>}
                      <span className="mt-1 block text-white/50">{order.customer.firstName} {order.customer.lastName}</span>
                      <span className="mt-1 block font-mono text-[var(--x-text)]">${order.total.toFixed(2)}</span>
                    </button>
                  ))}
                  {columnOrders.length === 0 && <p className="text-[10px] text-white/20">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left text-sm" data-orders-table>
            <thead>
              <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
                <th className="pb-3 pr-2 font-normal">
                  <input type="checkbox" checked={orders.length > 0 && selected.size === orders.length}
                    onChange={() => setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))))} className="h-3.5 w-3.5 accent-gold" aria-label="Select all" />
                </th>
                <th className="pb-3 pr-4 font-normal">Date</th>
                <th className="pb-3 pr-4 font-normal">Reference</th>
                <th className="pb-3 pr-4 font-normal">Customer</th>
                <th className="pb-3 pr-4 font-normal">Items</th>
                <th className="pb-3 pr-4 font-normal">Total</th>
                <th className="pb-3 pr-4 font-normal">Method</th>
                <th className="pb-3 pr-4 font-normal">Payment</th>
                <th className="pb-3 pr-4 font-normal">Fulfillment</th>
                <th className="pb-3 font-normal" />
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <tr><td colSpan={10} className="py-6 text-center text-white/30">Loading...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={10} className="py-6 text-center text-white/30">No orders match these filters.</td></tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className={`border-b border-white/5 align-top text-white/80 ${openId === order.id ? "bg-white/[0.03]" : ""}`} data-order-row={order.reference}>
                    <td className="py-3 pr-2"><input type="checkbox" checked={selected.has(order.id)} onChange={() => toggle(order.id)} className="h-3.5 w-3.5 accent-gold" aria-label={`Select ${order.reference}`} /></td>
                    <td className="py-3 pr-4 text-xs text-white/50">{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td className={isCommand ? "py-3 pr-4 font-mono text-xs text-white" : "py-3 pr-4 text-xs text-white"}>
                      {order.reference}
                      {order.needsReview && <span className="mt-1 block text-[9px] uppercase tracking-[0.1em] text-[var(--x-warning,#d9a441)]" data-needs-review>Needs review</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-white">{order.customer.firstName} {order.customer.lastName}</p>
                      <p className="text-xs text-white/40">{order.customer.email}</p>
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {order.items.map((item, i) => (
                        <p key={i}>{item.name} {item.sizeLabel} × {item.quantity}{item.sku && <span className="text-white/40"> · {item.sku}</span>}</p>
                      ))}
                    </td>
                    <td className={isCommand ? "py-3 pr-4 font-mono text-white" : "py-3 pr-4 text-white"}>${order.total.toFixed(2)}</td>
                    <td className="py-3 pr-4 text-xs uppercase tracking-[0.1em] text-white/60">{methodLabel(order.paymentMethod)}</td>
                    <td className="py-3 pr-4 text-xs text-white/70" data-cell="payment">
                      {PAYMENT_STATUS_LABELS[order.paymentStatus ?? "pending"]}
                      {order.paymentReference && <span className="block font-mono text-[10px] text-white/40">{order.paymentReference}</span>}
                      {order.paymentSource === "simulated" && <span className="block text-[9px] uppercase text-[var(--x-negative,#e0675f)]">simulated</span>}
                    </td>
                    <td className="py-3 pr-4 text-xs text-white/70" data-cell="fulfillment">
                      {FULFILLMENT_STATUS_LABELS[order.fulfillmentStatus ?? "unfulfilled"]}
                      {order.trackingNumber && <span className="block text-[10px] text-white/40">{order.carrier ? `${order.carrier} · ` : ""}{order.trackingNumber}</span>}
                    </td>
                    <td className="py-3">
                      <button type="button" onClick={() => openOrder(openId === order.id ? null : order.id)} data-open-order={order.reference}
                        className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 hover:border-[var(--x-muted)] hover:text-[var(--x-text)]">
                        {openId === order.id ? "Close" : "Open"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
