import type { Order, PaymentMethod } from "@/lib/types";

// Every payment method (crypto, bank transfer, and any future card
// processor) implements this same shape so checkout/order creation never
// needs method-specific branching beyond picking a provider.
export interface PaymentProvider {
  readonly method: PaymentMethod;
  // Called right after the order row is created with status
  // "awaiting_payment". Returns a partial patch to persist on the order
  // (e.g. the Coinbase charge info) — return {} if nothing to persist.
  // Throw PaymentProviderError for expected, user-facing failures.
  initiate(order: Order): Promise<Partial<Order>>;
}
