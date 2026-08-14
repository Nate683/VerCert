import { NextResponse } from "next/server";
import { verifyCoinbaseWebhookSignature } from "@/lib/coinbase";
import { updateOrderByChargeId } from "@/lib/orders/store";

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

  const { type, data } = payload.event ?? {};
  if (PAID_EVENT_TYPES.has(type) && data?.id) {
    await updateOrderByChargeId(data.id, {
      status: "paid",
      paidAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ received: true });
}
