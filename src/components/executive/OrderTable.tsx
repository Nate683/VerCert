"use client";

import { useCallback, useEffect, useState } from "react";
import type { Order, OrderStatus, PaymentMethod } from "@/lib/types";

const STATUS_OPTIONS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "awaiting_payment", label: "Awaiting Payment" },
  { value: "paid", label: "Paid" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_OPTIONS: { value: PaymentMethod | "all"; label: string }[] = [
  { value: "all", label: "All Methods" },
  { value: "crypto", label: "Crypto" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

export function OrderTable({ variant }: { variant: "command" | "office" }) {
  const isCommand = variant === "command";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "all">("all");
  const [search, setSearch] = useState("");
  const [markingId, setMarkingId] = useState<string | null>(null);

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

  async function handleMarkPaid(id: string) {
    setMarkingId(id);
    try {
      await fetch(`/api/executive/orders/${id}/mark-paid`, { method: "POST" });
      await load();
    } finally {
      setMarkingId(null);
    }
  }

  const cardClass = isCommand
    ? "border border-gold/20 bg-white/[0.02] p-6"
    : "rounded-md border border-white/10 bg-white/[0.03] p-5";

  return (
    <div className={cardClass}>
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
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/15 text-[10px] uppercase tracking-[0.1em] text-white/40">
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
            {loading ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-white/30">
                  Loading...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-white/30">
                  No orders match these filters.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-b border-white/5 align-top text-white/80">
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
                        order.status === "paid"
                          ? "border-gold text-gold"
                          : order.status === "awaiting_payment"
                          ? "border-white/25 text-white/60"
                          : "border-red-500/40 text-red-300"
                      }`}
                    >
                      {order.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3">
                    {order.paymentMethod === "bank_transfer" && order.status === "awaiting_payment" && (
                      <button
                        type="button"
                        onClick={() => handleMarkPaid(order.id)}
                        disabled={markingId === order.id}
                        className="border border-gold px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-gold transition-colors hover:bg-gold hover:text-black disabled:opacity-40"
                      >
                        {markingId === order.id ? "Marking..." : "Mark Paid"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
