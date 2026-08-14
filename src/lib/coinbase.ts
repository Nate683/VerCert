import { createHmac, timingSafeEqual } from "crypto";
import type { CryptoChargeInfo, Order } from "@/lib/types";

// Coinbase Commerce REST API (server-only). Endpoint/field names follow the
// long-standing Commerce v2 API — verify against your Coinbase Commerce
// dashboard/docs if the shape has changed since.
const API_BASE = "https://api.commerce.coinbase.com";
const API_VERSION = "2018-03-22";

function getApiKey(): string {
  const key = process.env.COINBASE_COMMERCE_API_KEY;
  if (!key) {
    throw new Error(
      "COINBASE_COMMERCE_API_KEY is not set. Add it to .env.local to accept crypto payments."
    );
  }
  return key;
}

type CoinbaseChargeResponse = {
  data: {
    id: string;
    code: string;
    hosted_url: string;
    expires_at: string;
    pricing?: Record<string, { amount: string; currency: string }>;
    addresses?: Record<string, string>;
    timeline?: { status: string; time: string }[];
  };
};

export async function createCoinbaseCharge(order: Order): Promise<CryptoChargeInfo> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const res = await fetch(`${API_BASE}/charges`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": getApiKey(),
      "X-CC-Version": API_VERSION,
    },
    body: JSON.stringify({
      name: `VeriCert Order ${order.reference}`,
      description: `${order.items.length} item(s) — research compounds`,
      pricing_type: "fixed_price",
      local_price: {
        amount: order.total.toFixed(2),
        currency: "USD",
      },
      metadata: {
        orderId: order.id,
        orderReference: order.reference,
      },
      redirect_url: `${siteUrl}/order/${order.reference}`,
      cancel_url: `${siteUrl}/checkout`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Coinbase Commerce charge creation failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as CoinbaseChargeResponse;
  const { data } = json;

  return {
    chargeId: data.id,
    chargeCode: data.code,
    hostedUrl: data.hosted_url,
    expiresAt: data.expires_at,
    pricing: pickCurrencies(data.pricing),
    addresses: pickCurrencies(data.addresses),
  };
}

function pickCurrencies<T>(
  record: Record<string, T> | undefined
): Partial<Record<"bitcoin" | "ethereum" | "usdc", T>> {
  if (!record) return {};
  const result: Partial<Record<"bitcoin" | "ethereum" | "usdc", T>> = {};
  for (const currency of ["bitcoin", "ethereum", "usdc"] as const) {
    if (record[currency]) result[currency] = record[currency];
  }
  return result;
}

export async function getCoinbaseCharge(chargeId: string) {
  const res = await fetch(`${API_BASE}/charges/${chargeId}`, {
    headers: {
      "X-CC-Api-Key": getApiKey(),
      "X-CC-Version": API_VERSION,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Coinbase charge ${chargeId}: ${res.status}`);
  }
  const json = (await res.json()) as CoinbaseChargeResponse;
  return json.data;
}

// A charge is considered paid once its timeline reports CONFIRMED or COMPLETED/RESOLVED.
export function isChargeConfirmed(timeline: { status: string }[] | undefined): boolean {
  if (!timeline) return false;
  return timeline.some((entry) =>
    ["CONFIRMED", "COMPLETED", "RESOLVED"].includes(entry.status)
  );
}

export function verifyCoinbaseWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
