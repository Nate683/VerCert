"use client";

import { useCallback, useEffect, useState } from "react";
import type { Order, OrderStatus, PaymentMethod, RefundReasonCode } from "@/lib/types";
import { LiveIndicator } from "./LiveIndicator";
import { useLiveRefresh } from "@/lib/executive/use-live-refresh";

const STATUS_OPTIONS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "paid", label: "Paid" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_OPTIONS: { value: PaymentMethod | "all"; label: string }[] = [
  { value: "all", label: "All Methods" },
  { value: "crypto", label: "Crypto" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

const BOARD_COLUMNS: OrderStatus[] = [
  "awaiting_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
];

const REFUND_REASONS: { value: RefundReasonCode; label: string }[] = [
  { value: "customer_request", label: "Customer Request" },
  { value: "quality_issue", label: "Quality Issue" },
  { value: "duplicate_order", label: "Duplicate Order" },
  { value: "shipping_issue", label: "Shipping Issue" },
  { value: "other", label: "Other" },
];

// Forward-only pipeline an executive can advance an order through.
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: "processing",
  processing: "shipped",
  shipped: "delivered",
};

const CANCELLABLE: OrderStatus[] = ["awaiting_payment", "paid", "processing"];
const REFUNDABLE: OrderStatus[] = ["paid", "processing", "shipped", "delivered"];

export function OrderTable({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "all">("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [shippingFormId, setShippingFormId] = useState<string | null>(null);
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "board">("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const [refundFormId, setRefundFormId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState<RefundReasonCode>("customer_request");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (paymentMethod !== "all") params.set("paymentMethod", paymentMethod);
    if (search) params.set("search", search);

    const res = await fetch(`/api/executive/orders?${params.toString()}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders);
    }
    setLoading(false);
  }, [status, paymentMethod, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when filters change
    load();
  }, [load]);

  // Poll for new/updated orders so the board reflects sales as they happen.
  // Skip while an inline form is open or a bulk action is running so we
  // don't clobber in-progress input.
  useLiveRefresh(load, 20000, Boolean(shippingFormId) || Boolean(refundFormId) || bulkRunning);

  async function handleMarkPaid(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/executive/orders/${id}/mark-paid`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not mark order paid.");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not mark order paid.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdvance(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;

    if (next === "shipped") {
      setShippingFormId(order.id);
      setCarrier(order.carrier ?? "");
      setTrackingNumber(order.trackingNumber ?? "");
      return;
    }

    await submitStatusUpdate(order.id, next);
  }

  async function submitStatusUpdate(
    id: string,
    next: OrderStatus,
    extra?: { carrier?: string; trackingNumber?: string }
  ) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/executive/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update order status.");
      setShippingFormId(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update order status.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm("Cancel this order? Any decremented stock will be restored.")) return;
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/executive/orders/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not cancel order.");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not cancel order.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefund(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/executive/orders/${id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: refundReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not refund order.");
      setRefundFormId(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not refund order.");
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))));
  }

  async function handleBulkMarkPaid() {
    setBulkRunning(true);
    setActionError(null);
    try {
      for (const id of selected) {
        const order = orders.find((o) => o.id === id);
        if (order?.paymentMethod === "bank_transfer" && order.status === "awaiting_payment") {
          await fetch(`/api/executive/orders/${id}/mark-paid`, { method: "POST" });
        }
      }
      setSelected(new Set());
      await load();
    } finally {
      setBulkRunning(false);
    }
  }

  async function handleBulkCancel() {
    if (!window.confirm(`Cancel ${selected.size} selected order(s)?`)) return;
    setBulkRunning(true);
    setActionError(null);
    try {
      for (const id of selected) {
        const order = orders.find((o) => o.id === id);
        if (order && CANCELLABLE.includes(order.status)) {
          await fetch(`/api/executive/orders/${id}/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        }
      }
      setSelected(new Set());
      await load();
    } finally {
      setBulkRunning(false);
    }
  }

  const cardClass = isCommand
    ? "command-panel p-6"
    : "office-card";

  return (
    <div className={cardClass}>
      <div className="mb-3">
        <LiveIndicator variant={variant} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | "all")}
          className="border border-white/15 bg-black px-3 py-2 text-xs uppercase tracking-[0.1em] text-white/70 focus:border-gold focus:outline-none"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "all")}
          className="border border-white/15 bg-black px-3 py-2 text-xs uppercase tracking-[0.1em] text-white/70 focus:border-gold focus:outline-none"
        >
          {PAYMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reference or customer..."
          className="min-w-[220px] flex-1 border border-white/15 bg-black px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setView("table")}
            className={`border px-3 py-2 text-xs uppercase tracking-[0.1em] ${view === "table" ? "border-gold text-gold" : "border-white/15 text-white/50"}`}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => setView("board")}
            className={`border px-3 py-2 text-xs uppercase tracking-[0.1em] ${view === "board" ? "border-gold text-gold" : "border-white/15 text-white/50"}`}
          >
            Board
          </button>
        </div>
      </div>

      {selected.size > 0 && view === "table" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border border-gold/30 bg-gold/5 p-3">
          <span className="text-xs text-white/70">{selected.size} selected</span>
          <button
            type="button"
            onClick={handleBulkMarkPaid}
            disabled={bulkRunning}
            className="border border-gold px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-gold hover:bg-gold hover:text-black disabled:opacity-40"
          >
            Bulk Mark Paid
          </button>
          <button
            type="button"
            onClick={handleBulkCancel}
            disabled={bulkRunning}
            className="border border-red-500/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-red-300/80 hover:border-red-400 disabled:opacity-40"
          >
            Bulk Cancel
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-[10px] uppercase tracking-[0.1em] text-white/40 hover:text-white"
          >
            Clear
          </button>
        </div>
      )}

      {actionError && (
        <p className="mt-4 border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          {actionError}
        </p>
      )}

      {view === "board" ? (
        <div className="mt-6 grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
          {BOARD_COLUMNS.map((col) => {
            const columnOrders = orders.filter((o) => o.status === col);
            return (
              <div key={col} className="min-w-[220px] border border-white/10 bg-black/30 p-3">
                <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">
                  {col.replace("_", " ")} ({columnOrders.length})
                </p>
                <div className="mt-3 space-y-2">
                  {columnOrders.map((order) => (
                    <div key={order.id} className="border border-white/10 bg-black/60 p-2.5 text-xs">
                      <p className={isCommand ? "font-mono text-white" : "text-white"}>{order.reference}</p>
                      <p className="mt-1 text-white/50">
                        {order.customer.firstName} {order.customer.lastName}
                      </p>
                      <p className={isCommand ? "mt-1 font-mono text-gold" : "mt-1 text-gold"}>
                        ${order.total.toFixed(2)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {order.paymentMethod === "bank_transfer" && order.status === "awaiting_payment" && (
                          <button
                            type="button"
                            onClick={() => handleMarkPaid(order.id)}
                            disabled={busyId === order.id}
                            className="border border-gold px-2 py-1 text-[9px] uppercase text-gold hover:bg-gold hover:text-black disabled:opacity-40"
                          >
                            Mark Paid
                          </button>
                        )}
                        {NEXT_STATUS[order.status] && NEXT_STATUS[order.status] !== "shipped" && (
                          <button
                            type="button"
                            onClick={() => handleAdvance(order)}
                            disabled={busyId === order.id}
                            className="border border-white/20 px-2 py-1 text-[9px] uppercase text-white/70 hover:border-gold hover:text-gold disabled:opacity-40"
                          >
                            → {NEXT_STATUS[order.status]}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {columnOrders.length === 0 && <p className="text-[10px] text-white/20">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
              <th className="pb-3 pr-2 font-normal">
                <input
                  type="checkbox"
                  checked={orders.length > 0 && selected.size === orders.length}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 accent-[#c9a227]"
                />
              </th>
              <th className="pb-3 pr-4 font-normal">Date</th>
              <th className="pb-3 pr-4 font-normal">Reference</th>
              <th className="pb-3 pr-4 font-normal">Customer</th>
              <th className="pb-3 pr-4 font-normal">Items</th>
              <th className="pb-3 pr-4 font-normal">Total</th>
              <th className="pb-3 pr-4 font-normal">Payment</th>
              <th className="pb-3 pr-4 font-normal">Status</th>
              <th className="pb-3 font-normal">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-white/30">
                  Loading...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-white/30">
                  No orders match these filters.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-b border-white/5 align-top text-white/80">
                  <td className="py-3 pr-2">
                    <input
                      type="checkbox"
                      checked={selected.has(order.id)}
                      onChange={() => toggleSelect(order.id)}
                      className="h-3.5 w-3.5 accent-[#c9a227]"
                    />
                  </td>
                  <td className="py-3 pr-4 text-xs text-white/50">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                  <td className={isCommand ? "py-3 pr-4 font-mono text-xs text-white" : "py-3 pr-4 text-xs text-white"}>
                    {order.reference}
                  </td>
                  <td className="py-3 pr-4">
                    <p className="text-white">
                      {order.customer.firstName} {order.customer.lastName}
                    </p>
                    <p className="text-xs text-white/40">{order.customer.email}</p>
                  </td>
                  <td className="py-3 pr-4 text-xs">
                    {order.items.map((item) => (
                      <p key={`${item.slug}-${item.sizeLabel}`}>
                        {item.name} × {item.quantity}
                      </p>
                    ))}
                  </td>
                  <td className={isCommand ? "py-3 pr-4 font-mono text-white" : "py-3 pr-4 text-white"}>
                    ${order.total.toFixed(2)}
                  </td>
                  <td className="py-3 pr-4 text-xs uppercase tracking-[0.1em] text-white/60">
                    {order.paymentMethod === "crypto" ? "Crypto" : "Bank Transfer"}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`border px-2 py-1 text-[10px] uppercase tracking-[0.1em] ${
                        order.status === "delivered" || order.status === "paid"
                          ? "border-gold text-gold"
                          : order.status === "cancelled" || order.status === "expired"
                          ? "border-red-500/40 text-red-300"
                          : "border-white/25 text-white/60"
                      }`}
                    >
                      {order.status.replace("_", " ")}
                    </span>
                    {order.trackingNumber && (
                      <p className="mt-1 text-[10px] text-white/40">
                        {order.carrier ? `${order.carrier} · ` : ""}
                        {order.trackingNumber}
                      </p>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      {order.paymentMethod === "bank_transfer" && order.status === "awaiting_payment" && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(order.id)}
                          disabled={busyId === order.id}
                          className="border border-gold px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
                        >
                          {busyId === order.id ? "Marking..." : "Mark Paid"}
                        </button>
                      )}
                      {NEXT_STATUS[order.status] && (
                        <button
                          type="button"
                          onClick={() => handleAdvance(order)}
                          disabled={busyId === order.id}
                          className="border border-white/20 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/70 transition-colors hover:border-gold hover:text-gold disabled:opacity-40"
                        >
                          Mark {NEXT_STATUS[order.status]}
                        </button>
                      )}
                      {CANCELLABLE.includes(order.status) && (
                        <button
                          type="button"
                          onClick={() => handleCancel(order.id)}
                          disabled={busyId === order.id}
                          className="border border-red-500/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-red-300/80 transition-colors hover:border-red-400 hover:text-red-300 disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      )}
                      {REFUNDABLE.includes(order.status) && !order.refundedAt && (
                        <button
                          type="button"
                          onClick={() => setRefundFormId(refundFormId === order.id ? null : order.id)}
                          disabled={busyId === order.id}
                          className="border border-red-500/30 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-red-300/80 transition-colors hover:border-red-400 hover:text-red-300 disabled:opacity-40"
                        >
                          Refund
                        </button>
                      )}
                      {order.refundedAt && (
                        <span className="border border-red-500/40 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-red-300">
                          Refunded
                        </span>
                      )}
                    </div>

                    {refundFormId === order.id && (
                      <div className="mt-3 space-y-2 border border-white/15 bg-black p-3">
                        <select
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value as RefundReasonCode)}
                          className="w-full border border-white/15 bg-black px-2 py-1.5 text-xs text-white focus:border-gold focus:outline-none"
                        >
                          {REFUND_REASONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleRefund(order.id)}
                            disabled={busyId === order.id}
                            className="border border-red-500/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                          >
                            Confirm Refund
                          </button>
                          <button
                            type="button"
                            onClick={() => setRefundFormId(null)}
                            className="border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {shippingFormId === order.id && (
                      <div className="mt-3 space-y-2 border border-white/15 bg-black p-3">
                        <input
                          value={carrier}
                          onChange={(e) => setCarrier(e.target.value)}
                          placeholder="Carrier (e.g. USPS, UPS)"
                          className="w-full border border-white/15 bg-black px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
                        />
                        <input
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                          placeholder="Tracking number"
                          className="w-full border border-white/15 bg-black px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-gold focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              submitStatusUpdate(order.id, "shipped", { carrier, trackingNumber })
                            }
                            disabled={busyId === order.id || !trackingNumber.trim()}
                            className="border border-gold px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
                          >
                            Confirm Shipped
                          </button>
                          <button
                            type="button"
                            onClick={() => setShippingFormId(null)}
                            className="border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white/50 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
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
