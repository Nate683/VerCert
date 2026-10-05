import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { getContent, setContent } from "@/lib/site-content";
import { listProducts } from "@/lib/products";
import { DEFAULT_SUBSCRIPTION_SETTINGS } from "@/lib/subscriptions/rules";
import { getSubscription, listAllSubscriptions, updateSubscription } from "@/lib/subscriptions/store";
import { parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

// Subscribe-and-save settings and every subscription. /command only: the
// discount is a pricing decision.
export const GET = withApiErrorHandling(async () => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const [settings, subscriptions, products] = await Promise.all([
    getContent("subscriptions", DEFAULT_SUBSCRIPTION_SETTINGS),
    listAllSubscriptions(),
    listProducts({ includeInactive: true }),
  ]);
  const name = (slug: string) => products.find((p) => p.slug === slug)?.name ?? slug;
  return NextResponse.json({
    settings,
    subscriptions: subscriptions.map((s) => ({
      ...s,
      productName: name(s.productSlug),
      customer: { firstName: s.customer.firstName, lastName: s.customer.lastName, email: s.customer.email },
    })),
  });
});

const patchSchema = z.union([
  z.object({
    settings: z.object({
      // Null switches subscribe-and-save off for new subscriptions.
      discountPercent: z.number().min(1).max(90).nullable(),
      intervalDays: z.array(z.number().int().min(7).max(365)).min(1).max(6),
    }),
  }),
  z.object({ id: z.string().min(1), action: z.literal("cancel") }),
]);

export const PATCH = withApiErrorHandling(async (request: Request) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const parsed = await parseBody(request, patchSchema);
  if ("error" in parsed) return parsed.error;
  const actor = await getCurrentCustomer();

  if ("settings" in parsed.data) {
    const settings = {
      discountPercent: parsed.data.settings.discountPercent,
      intervalDays: [...new Set(parsed.data.settings.intervalDays)].sort((a, b) => a - b),
    };
    await setContent("subscriptions", settings);
    if (actor) {
      await logActivity(
        actor.email,
        "subscriptions.settings",
        settings.discountPercent === null ? "turned off" : `${settings.discountPercent}% off, every ${settings.intervalDays.join("/")} days`
      );
    }
    return NextResponse.json({ settings });
  }

  const sub = await getSubscription(parsed.data.id);
  if (!sub) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  const updated = await updateSubscription(sub.id, { status: "cancelled", statusReason: "Cancelled by VeriCert" });
  if (actor) await logActivity(actor.email, "subscription.cancelled", sub.id);
  return NextResponse.json({ subscription: updated });
});
