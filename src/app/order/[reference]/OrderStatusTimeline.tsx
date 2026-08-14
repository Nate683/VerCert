import type { Order, OrderStatus } from "@/lib/types";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "paid", label: "Paid" },
  { status: "processing", label: "Processing" },
  { status: "shipped", label: "Shipped" },
  { status: "delivered", label: "Delivered" },
];

const STEP_DATE_KEY: Partial<Record<OrderStatus, keyof Order>> = {
  paid: "paidAt",
  processing: "processingAt",
  shipped: "shippedAt",
  delivered: "deliveredAt",
};

function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function OrderStatusTimeline({ order }: { order: Order }) {
  if (order.status === "cancelled") {
    return (
      <div className="border border-red-500/30 bg-red-500/5 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-red-300">Order Cancelled</p>
        <h2 className="mt-3 font-serif text-2xl text-white">Order {order.reference}</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          {order.cancelReason || "This order was cancelled."}
          {order.cancelledAt ? ` (${formatDate(order.cancelledAt)})` : ""}
        </p>
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.status === order.status);

  return (
    <div className="border border-white/10 p-6 sm:p-8">
      <p className="text-xs uppercase tracking-[0.25em] text-gold">Order Status</p>
      <h2 className="mt-2 font-serif text-2xl text-white">Order {order.reference}</h2>

      <ol className="mt-8 space-y-6">
        {STEPS.map((step, index) => {
          const done = currentIndex >= index;
          const dateKey = STEP_DATE_KEY[step.status];
          const date = dateKey ? (order[dateKey] as string | undefined) : undefined;
          return (
            <li key={step.status} className="flex items-start gap-4">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                  done ? "border-gold bg-gold text-black" : "border-white/20 text-white/30"
                }`}
              >
                {index + 1}
              </span>
              <div>
                <p className={done ? "text-white" : "text-white/40"}>{step.label}</p>
                {date && <p className="text-xs text-white/40">{formatDate(date)}</p>}
                {step.status === "shipped" && done && (order.carrier || order.trackingNumber) && (
                  <p className="mt-1 text-xs text-white/50">
                    {order.carrier ? `${order.carrier} — ` : ""}
                    {order.trackingNumber}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
