"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import type { CryptoChargeInfo, CryptoCurrencyCode, OrderStatus } from "@/lib/types";

const CURRENCY_LABELS: Record<CryptoCurrencyCode, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  usdc: "USDC",
};

function qrPayloadFor(currency: CryptoCurrencyCode, address: string, amount?: string) {
  if (currency === "bitcoin" && amount) {
    return `bitcoin:${address}?amount=${amount}`;
  }
  return address;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function CryptoPaymentPanel({
  reference,
  crypto,
  initialStatus,
}: {
  reference: string;
  crypto: CryptoChargeInfo;
  initialStatus: OrderStatus;
}) {
  const currencies = useMemo(
    () => (Object.keys(crypto.addresses) as CryptoCurrencyCode[]),
    [crypto.addresses]
  );
  const [selected, setSelected] = useState<CryptoCurrencyCode>(currencies[0]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [msRemaining, setMsRemaining] = useState(
    () => new Date(crypto.expiresAt).getTime() - Date.now()
  );

  const address = crypto.addresses[selected];
  const amount = crypto.pricing[selected]?.amount;

  useEffect(() => {
    if (!address) return;
    QRCode.toDataURL(qrPayloadFor(selected, address, amount), {
      margin: 1,
      width: 240,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [selected, address, amount]);

  useEffect(() => {
    if (status !== "awaiting_payment") return;
    const timer = setInterval(() => {
      setMsRemaining(new Date(crypto.expiresAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [crypto.expiresAt, status]);

  useEffect(() => {
    if (status !== "awaiting_payment") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${reference}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "paid" || data.status === "awaiting_payment" || data.status === "expired") {
          setStatus(data.status);
        } else {
          // Order moved past "paid" (processing/shipped/etc) — the status
          // timeline covers that, so reload to get the server-rendered view.
          window.location.reload();
        }
      } catch {
        // ignore transient network errors while polling
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [reference, status]);

  if (status === "paid") {
    return (
      <div className="border border-gold/40 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Payment Confirmed</p>
        <h2 className="mt-3 font-serif text-2xl text-white">Thank You</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          We&apos;ve received your crypto payment for order {reference}. A
          confirmation has been recorded and your order will begin processing.
        </p>
      </div>
    );
  }

  if (status === "expired" || msRemaining <= 0) {
    return (
      <div className="border border-white/15 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/40">Payment Window Expired</p>
        <h2 className="mt-3 font-serif text-2xl text-white">This Charge Has Expired</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          The payment window for order {reference} has closed. Please return
          to checkout to generate a new payment request.
        </p>
        <Link
          href="/checkout"
          className="mt-6 inline-block border border-gold px-8 py-3 text-sm uppercase tracking-[0.2em] text-gold transition-colors hover:bg-gold hover:text-black"
        >
          Return to Checkout
        </Link>
      </div>
    );
  }

  return (
    <div className="border border-white/10 p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-gold">Pay With Crypto</p>
          <p className="mt-1 text-sm text-white/50">Order {reference}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Time Remaining</p>
          <p className="font-mono text-2xl text-gold">{formatCountdown(msRemaining)}</p>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        {currencies.map((currency) => (
          <button
            key={currency}
            type="button"
            onClick={() => setSelected(currency)}
            className={`border px-4 py-2 text-xs uppercase tracking-[0.15em] transition-colors ${
              selected === currency
                ? "border-gold bg-gold text-black"
                : "border-white/15 text-white/60 hover:border-gold hover:text-gold"
            }`}
          >
            {CURRENCY_LABELS[currency]}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 sm:items-center">
        <div className="flex justify-center">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URI, not an optimizable asset
            <img
              src={qrDataUrl}
              alt={`QR code for ${CURRENCY_LABELS[selected]} payment address`}
              className="border border-white/10 bg-white p-3"
              width={240}
              height={240}
            />
          ) : (
            <div className="flex h-[240px] w-[240px] items-center justify-center border border-white/10 text-xs text-white/30">
              Generating QR code...
            </div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Amount Due</p>
          <p className="mt-2 font-serif text-2xl text-white">
            {amount} {CURRENCY_LABELS[selected]}
          </p>

          <p className="mt-6 text-xs uppercase tracking-[0.2em] text-white/40">
            {CURRENCY_LABELS[selected]} Deposit Address
          </p>
          <p className="mt-2 break-all border border-white/10 bg-white/[0.03] p-3 font-mono text-xs text-white/80">
            {address}
          </p>

          <p className="mt-6 text-xs leading-relaxed text-white/40">
            Send exactly the amount shown to this address. This page will
            update automatically once your payment is confirmed on-chain.
          </p>

          <a
            href={crypto.hostedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-xs uppercase tracking-[0.2em] text-white/50 underline-offset-4 hover:text-gold hover:underline"
          >
            Or pay via Coinbase Commerce →
          </a>
        </div>
      </div>
    </div>
  );
}
