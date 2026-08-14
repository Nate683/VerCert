"use client";

import { useEffect, useState } from "react";
import { BANK_TRANSFER_DETAILS } from "@/lib/bank-details";
import type { OrderStatus } from "@/lib/types";

const DETAIL_ROWS: [string, string][] = [
  ["Account Name", BANK_TRANSFER_DETAILS.accountName],
  ["Bank Name", BANK_TRANSFER_DETAILS.bankName],
  ["Account Number", BANK_TRANSFER_DETAILS.accountNumber],
  ["Routing Number", BANK_TRANSFER_DETAILS.routingNumber],
  ["SWIFT / BIC", BANK_TRANSFER_DETAILS.swiftBic],
  ["Account Type", BANK_TRANSFER_DETAILS.accountType],
];

export function BankTransferPanel({
  reference,
  total,
  initialStatus,
}: {
  reference: string;
  total: number;
  initialStatus: OrderStatus;
}) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [checking, setChecking] = useState(false);

  async function refreshStatus() {
    setChecking(true);
    try {
      const res = await fetch(`/api/orders/${reference}/status`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "paid" || data.status === "awaiting_payment") {
          setStatus(data.status);
        } else {
          // Order moved past "paid" (processing/shipped/etc) — the status
          // timeline covers that, so reload to get the server-rendered view.
          window.location.reload();
        }
      }
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (status !== "awaiting_payment") return;
    const poll = setInterval(refreshStatus, 10000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshStatus is stable enough for this polling interval
  }, [status]);

  if (status === "paid") {
    return (
      <div className="border border-gold/40 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Payment Received</p>
        <h2 className="mt-3 font-serif text-2xl text-white">Thank You</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          We&apos;ve confirmed your bank transfer for order {reference}. Your
          order is now being processed.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-white/10 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Bank Transfer</p>
          <p className="mt-1 text-sm text-white/50">Order {reference}</p>
        </div>
        <span className="border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.15em] text-white/60">
          Awaiting Payment
        </span>
      </div>

      <p className="mt-6 text-sm leading-relaxed text-white/60">
        Send <span className="text-white">${total.toFixed(2)} USD</span> to the
        account below and include your order reference in the transfer memo.
        We&apos;ve also emailed these details to you.
      </p>

      <div className="mt-6 border border-gold/40 bg-gold/5 p-4 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/40">
          Include This Reference
        </p>
        <p className="mt-1 font-mono text-xl text-gold">{reference}</p>
      </div>

      <dl className="mt-6 divide-y divide-white/10 border-y border-white/10">
        {DETAIL_ROWS.map(([label, value]) => (
          <div key={label} className="flex justify-between py-3 text-sm">
            <dt className="text-white/40">{label}</dt>
            <dd className="font-mono text-white">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-white/40">
          Your order ships once we confirm receipt of funds.
        </p>
        <button
          type="button"
          onClick={refreshStatus}
          disabled={checking}
          className="border border-white/15 px-4 py-2 text-xs uppercase tracking-[0.15em] text-white/70 transition-colors hover:border-gold hover:text-gold disabled:opacity-40"
        >
          {checking ? "Checking..." : "Refresh Status"}
        </button>
      </div>
    </div>
  );
}
