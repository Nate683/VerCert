import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { getMethodStates, getPaymentConfig, isPaymentSimulation, savePaymentConfig, type PaymentConfig } from "@/lib/payments/config";
import { PAYMENT_METHODS, STAGE3_METHODS } from "@/lib/payments/methods";
import { paymentConfigSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { noStore, unauthorized } from "@/lib/executive/route-helpers";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

// Executive Office → Payments. Each method's switch, whether its integration is ready, whether customers are
// actually offered it, its reservation window, and what activating it requires. No credential or secret is ever
// returned (none are stored here).
export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveActor())) return unauthorized();
  const [methods, config] = await Promise.all([getMethodStates(), getPaymentConfig()]);
  return NextResponse.json({ methods, config, simulation: isPaymentSimulation() }, noStore);
});

// Saves the switches and reservation windows. Only the eight Stage 3 methods and bank transfer can be switched here
// (legacy crypto follows its build flag). Switching a method on does not make it available: a provider method
// still needs a live integration, which none has.
export const PUT = withApiErrorHandling(async (request: Request) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const parsed = await parseBody(request, paymentConfigSchema);
  if ("error" in parsed) return parsed.error;
  const switchable = new Set<PaymentMethod>([...STAGE3_METHODS, "bank_transfer"]);
  const before = await getPaymentConfig();
  const next: PaymentConfig = { enabled: {}, reservationMinutes: {}, achFulfillment: parsed.data.achFulfillment };
  for (const [m, on] of Object.entries(parsed.data.enabled) as [PaymentMethod, boolean][]) {
    if (switchable.has(m)) next.enabled[m] = on;
  }
  for (const [m, minutes] of Object.entries(parsed.data.reservationMinutes) as [PaymentMethod, number | null][]) {
    if (PAYMENT_METHODS[m]?.reservationConfigurable) next.reservationMinutes[m] = minutes;
  }
  await savePaymentConfig(next);
  const changes = [...switchable].filter((m) => Boolean(before.enabled[m]) !== Boolean(next.enabled[m])).map((m) => `${m} ${next.enabled[m] ? "on" : "off"}`);
  const resChanges = Object.keys(next.reservationMinutes).filter((m) => before.reservationMinutes[m as PaymentMethod] !== next.reservationMinutes[m as PaymentMethod])
    .map((m) => `${m} hold ${next.reservationMinutes[m as PaymentMethod] ?? "none"}`);
  await logActivity(actor.email, "payments.config_changed",
    [...changes, ...resChanges, ...(before.achFulfillment !== next.achFulfillment ? [`ACH fulfilment ${next.achFulfillment}`] : [])].join(", ") || "no change");
  return NextResponse.json({ methods: await getMethodStates(), config: await getPaymentConfig() });
});
