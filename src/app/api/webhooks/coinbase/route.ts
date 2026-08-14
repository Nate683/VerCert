import { NextResponse } from "next/server";
import { verifyCoinbaseWebhookSignature } from "@/lib/coinbase";
import { listOrders } from "@/lib/orders/store";
import { markOrderPaid } from "@/lib/orders/lifecycle";

export const dynamic = "force-dynamic";

type CoinbaseWebhookEvent = {
  event: {
    type: string;
    data: { id: string };
  };
};

const PAID_EVENT_TYPES = new Set(["charge:confirmed", "charge:resolved"]);

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-cc-webhook-signature");

  if (!verifyCoinbaseWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: CoinbaseWebhookEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const { type, data } = payload.event ?? {};
    if (PAID_EVENT_TYPES.has(type) && data?.id) {
      // No indexed lookup by charge id needed elsewhere, so a linear scan here
      // keeps the store's public API small; order volume is low enough that
      // this isn't a bottleneck.
      const order = (await listOrders()).find((o) => o.crypto?.chargeId === data.id);
      if (order) await markOrderPaid(order);
    }
  } catch (err) {
    console.error("Failed to process Coinbase webhook:", err);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
