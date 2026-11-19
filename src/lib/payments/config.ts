import { getContent, setContent } from "@/lib/site-content";
import { getBankTransferDetails } from "@/lib/bank-details";
import { CRYPTO_CHECKOUT_ENABLED } from "./availability";
import { PAYMENT_METHODS, STAGE3_METHODS, type OfferedMethod, type PaymentMethodInfo } from "./methods";
import type { PaymentMethod } from "@/lib/types";

// Server-only. Which payment methods customers may use, and each method's reservation policy.
//
// Stored as the site_content row "payment_methods", written ONLY by /api/executive/payment-methods (validated and
// audited; the generic Site Content endpoint refuses this key). With no row saved, EVERY method is OFF (bank transfer and Zelle included).
//
// A method is offered to customers only when BOTH:
//   1. it is switched on here, and
//   2. its integration is ready: Zelle / bank transfer need their receiving details in the environment; every
//      provider method (crypto, ACH, cards, wallets) needs a live provider integration — and none exists.
// So today no provider method can reach a customer, whatever the switch says. The only exception is local
// simulation (isPaymentSimulation), which can never be true on Vercel or against a real database.

export const PAYMENT_CONFIG_KEY = "payment_methods";

export type AchFulfillmentPolicy = "after_settlement" | "after_initiation";
export type PaymentConfig = {
  enabled: Partial<Record<PaymentMethod, boolean>>;
  /** Reservation window per method that allows one (minutes). null = no reservation (deduct on confirmation). */
  reservationMinutes: Partial<Record<PaymentMethod, number | null>>;
  achFulfillment: AchFulfillmentPolicy;
};

export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  // Every method is OFF until the owner switches it on in Executive Office → Payments — including manual bank transfer
  // and Zelle (owner instruction 2026-11-18, superseding the earlier "bank transfer on by default"). Nothing is
  // offered to customers on a default.
  enabled: {},
  reservationMinutes: {},
  achFulfillment: "after_settlement",
};

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const stored = await getContent<Partial<PaymentConfig> | null>(PAYMENT_CONFIG_KEY, null);
  return {
    enabled: { ...DEFAULT_PAYMENT_CONFIG.enabled, ...(stored?.enabled ?? {}) },
    reservationMinutes: { ...(stored?.reservationMinutes ?? {}) },
    achFulfillment: stored?.achFulfillment === "after_initiation" ? "after_initiation" : "after_settlement",
  };
}

export async function savePaymentConfig(config: PaymentConfig): Promise<void> {
  await setContent(PAYMENT_CONFIG_KEY, config);
}

// LOCAL TESTS ONLY: simulated provider adapters. Requires an explicit variable AND a database host under the
// reserved .invalid domain (the local test shim) AND not running on Vercel — so it can't switch on in production
// even if the variable were copied there by mistake.
export function isPaymentSimulation(): boolean {
  if (process.env.PAYMENT_SIMULATION !== "local-test-only" || process.env.VERCEL === "1") return false;
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname.endsWith(".invalid");
  } catch {
    return false;
  }
}

export function zelleDetails() {
  const name = process.env.ZELLE_RECIPIENT_NAME?.trim() ?? "";
  const handle = process.env.ZELLE_RECIPIENT_HANDLE?.trim() ?? "";
  return { name, handle, isConfigured: Boolean(name && handle) };
}

// Whether the method's integration can take a payment right now, and why not.
export function integrationReady(method: PaymentMethod): { ready: boolean; reason: string; simulated: boolean } {
  const info = PAYMENT_METHODS[method];
  if (!info) return { ready: false, reason: "Unknown method.", simulated: false };
  if (method === "crypto") {
    return CRYPTO_CHECKOUT_ENABLED
      ? { ready: true, reason: "Legacy Coinbase Commerce flag is on.", simulated: false }
      : { ready: false, reason: "Retired: Coinbase Commerce has shut down.", simulated: false };
  }
  if (method === "bank_transfer") {
    return getBankTransferDetails().isConfigured
      ? { ready: true, reason: "Bank details configured.", simulated: false }
      : { ready: false, reason: "Bank details (BANK_*) are not set.", simulated: false };
  }
  if (method === "zelle") {
    return zelleDetails().isConfigured
      ? { ready: true, reason: "Zelle recipient configured; payments confirmed by an administrator with the reference.", simulated: false }
      : { ready: false, reason: "Zelle recipient (ZELLE_RECIPIENT_NAME / ZELLE_RECIPIENT_HANDLE) is not set.", simulated: false };
  }
  if (isPaymentSimulation()) return { ready: true, reason: "LOCAL SIMULATION — no real provider.", simulated: true };
  return { ready: false, reason: "No provider integration exists for this method.", simulated: false };
}

export function reservationMinutesFor(method: PaymentMethod, config: PaymentConfig): number | null {
  const info: PaymentMethodInfo = PAYMENT_METHODS[method];
  if (!info) return null;
  // Spec: Zelle (and the manual bank transfer) never reserve before verified payment.
  if (!info.reservationConfigurable) return info.inventoryPolicy === "reserve" ? info.defaultReservationMinutes : null;
  const set = config.reservationMinutes[method];
  return set === undefined ? info.defaultReservationMinutes : set;
}

export type MethodState = {
  id: PaymentMethod;
  label: string;
  enabled: boolean;
  ready: boolean;
  offered: boolean;
  reason: string;
  simulated: boolean;
  reservationMinutes: number | null;
  info: PaymentMethodInfo;
};

export async function getMethodStates(): Promise<MethodState[]> {
  const config = await getPaymentConfig();
  return ([...STAGE3_METHODS, "bank_transfer", "crypto"] as PaymentMethod[]).map((id) => {
    const info = PAYMENT_METHODS[id];
    // The legacy crypto option follows only its build-time flag, exactly as before Stage 3.
    const enabled = id === "crypto" ? CRYPTO_CHECKOUT_ENABLED : config.enabled[id] === true;
    const integ = integrationReady(id);
    return {
      id, label: info.label, enabled, ready: integ.ready, offered: enabled && integ.ready,
      reason: !enabled ? "Switched off." : integ.reason, simulated: integ.simulated,
      reservationMinutes: reservationMinutesFor(id, config), info,
    };
  });
}

export async function getMethodState(method: PaymentMethod): Promise<MethodState | null> {
  return (await getMethodStates()).find((m) => m.id === method) ?? null;
}

export async function getOfferedMethods(): Promise<OfferedMethod[]> {
  return (await getMethodStates())
    .filter((m) => m.offered)
    .map((m) => ({ id: m.id, label: m.label, reservationMinutes: m.reservationMinutes, simulated: m.simulated }));
}
