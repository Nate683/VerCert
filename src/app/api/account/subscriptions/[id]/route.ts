import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { getProductBySlug, isOnSale } from "@/lib/products";
import { getContent } from "@/lib/site-content";
import { DEFAULT_SUBSCRIPTION_SETTINGS, isSubscribable } from "@/lib/subscriptions/rules";
import { addDays, getSubscription, updateSubscription } from "@/lib/subscriptions/store";
import { parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("skip") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("interval"), intervalDays: z.number().int().min(1).max(365) }),
]);

// The customer's own controls for a subscription: cancel, skip the next
// order, change how often, or resume one that was paused.
export const PATCH = withApiErrorHandling(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const sub = await getSubscription(id);
  if (!sub || sub.customerId !== user.id) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  if (sub.status === "cancelled") return NextResponse.json({ error: "This subscription has been cancelled." }, { status: 409 });

  const parsed = await parseBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  let updated;
  if (body.action === "cancel") {
    updated = await updateSubscription(id, { status: "cancelled", statusReason: "Cancelled by customer" });
  } else if (body.action === "skip") {
    if (sub.status !== "active") return NextResponse.json({ error: "Only an active subscription can skip an order." }, { status: 409 });
    updated = await updateSubscription(id, { nextOrderAt: addDays(sub.nextOrderAt, sub.intervalDays) });
  } else if (body.action === "interval") {
    const settings = await getContent("subscriptions", DEFAULT_SUBSCRIPTION_SETTINGS);
    if (!settings.intervalDays.includes(body.intervalDays)) {
      return NextResponse.json({ error: "That delivery interval isn't offered." }, { status: 400 });
    }
    // The next order moves to the new interval counted from the last one.
    const last = addDays(sub.nextOrderAt, -sub.intervalDays);
    let next = addDays(last, body.intervalDays);
    if (new Date(next) < new Date()) next = new Date().toISOString();
    updated = await updateSubscription(id, { intervalDays: body.intervalDays, nextOrderAt: next });
  } else {
    if (sub.status !== "paused") return NextResponse.json({ error: "This subscription isn't paused." }, { status: 409 });
    const product = await getProductBySlug(sub.productSlug);
    if (!product || !isOnSale(product) || !isSubscribable(product)) {
      return NextResponse.json({ error: "That product still isn't available on subscription." }, { status: 409 });
    }
    updated = await updateSubscription(id, {
      status: "active",
      statusReason: undefined,
      nextOrderAt: new Date(Math.max(Date.now(), new Date(sub.nextOrderAt).getTime())).toISOString(),
    });
  }
  return NextResponse.json({ subscription: updated });
});
