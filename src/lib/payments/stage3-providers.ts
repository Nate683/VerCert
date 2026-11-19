import type { Order, PaymentMethod } from "@/lib/types";
import type { PaymentProvider } from "./types";
import { PaymentProviderError } from "./errors";
import { integrationReady, isPaymentSimulation } from "./config";
import { methodLabel } from "./methods";

// Zelle: no external call. The customer pays the business Zelle recipient using the order reference; an
// administrator confirms by entering the reference from the Zelle notification (lib/orders/lifecycle.ts).
export function manualProvider(method: PaymentMethod): PaymentProvider {
  return {
    method,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match PaymentProvider
    async initiate(_order: Order) {
      if (!integrationReady(method).ready) throw new PaymentProviderError(`${methodLabel(method)} isn't available right now.`);
      return {};
    },
  };
}

// A method with no provider. Order creation never reaches this unless the method is offered, which (outside local
// simulation) it can't be. In local simulation it records nothing: the test harness drives the order with
// simulated provider events (/api/executive/payments/simulate), all labelled source = "simulated".
export function unavailableProvider(method: PaymentMethod): PaymentProvider {
  return {
    method,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match PaymentProvider
    async initiate(_order: Order) {
      if (isPaymentSimulation()) return {};
      throw new PaymentProviderError(`${methodLabel(method)} isn't available: no payment provider is connected.`);
    },
  };
}

// The shape a real provider's verified notification must be normalized to before it touches an order. Provider
// routes must verify the provider's signature first; the event id makes repeated deliveries harmless (unique in
// order_events). Nothing implements this yet except the local simulator.
export type ProviderPaymentEvent = {
  provider: string;
  providerEventId: string;
  orderReference: string;
  kind: "processing" | "confirmed" | "failed" | "reversed";
  amount?: number;
  providerPaymentId?: string;
  reason?: string;
};
