"use client";

import { useEffect, useState } from "react";
import type { BankTransferDetails } from "@/lib/bank-details";
import type { OrderStatus } from "@/lib/types";

function detailRows(d: BankTransferDetails): [string, string][] {
  return [
    ["Account Name", d.accountName],
    ["Bank Name", d.bankName],
    ["Account Number", d.accountNumber],
    ["Routing Number", d.routingNumber],
    ["SWIFT / BIC", d.swiftBic],
    ["Account Type", d.accountType],
  ];
}

export function BankTransferPanel({
  reference,
  total,
  initialStatus,
  bankDetails,
}: {
  reference: string;
  total: number;
  initialStatus: OrderStatus;
  bankDetails: BankTransferDetails;
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
        <p className="text-xs uppercase tracking-[0.3em] text-gold-ink">Payment Received</p>
        <h2 className="mt-3 font-serif text-2xl text-navy">Thank You</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          We&apos;ve confirmed your bank transfer for order {reference}. Your
          order is now being processed.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-hairline p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold-ink">Bank Transfer</p>
          <p className="mt-1 text-sm text-muted">Order {reference}</p>
        </div>
        <span className="border border-hairline px-3 py-1 text-xs uppercase tracking-[0.15em] text-muted">
          Awaiting Payment
        </span>
      </div>

      <p className="mt-6 text-sm leading-relaxed text-muted">
        Send <span className="text-navy">${total.toFixed(2)} USD</span> to the
        account below and include your order reference in the transfer memo.
        We&apos;ve also emailed these details to you.
      </p>

      <div className="mt-6 border border-gold/40 bg-gold/5 p-4 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">
          Include This Reference
        </p>
        <p className="mt-1 font-mono text-xl text-gold-ink">{reference}</p>
      </div>

      <dl className="mt-6 divide-y divide-hairline border-y border-hairline">
        {detailRows(bankDetails).map(([label, value]) => (
          <div key={label} className="flex justify-between py-3 text-sm">
            <dt className="text-muted">{label}</dt>
            <dd className="font-mono text-navy">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-muted">
          Your order ships once we confirm receipt of funds.
        </p>
        <button
          type="button"
          onClick={refreshStatus}
          disabled={checking}
          className="border border-hairline px-4 py-2 text-xs uppercase tracking-[0.15em] text-muted transition-colors hover:border-gold hover:text-gold-ink disabled:opacity-40"
        >
          {checking ? "Checking..." : "Refresh Status"}
        </button>
      </div>
    </div>
  );
}
