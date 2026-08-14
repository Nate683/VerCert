import type { PaymentMethod } from "@/lib/types";
import type { PaymentProvider } from "./types";
import { coinbaseProvider } from "./coinbase-provider";
import { bankTransferProvider } from "./bank-transfer-provider";

// Add a new method here (e.g. "card") once a processor is wired up — nothing
// else in checkout/order creation needs to change.
const PROVIDERS: Record<PaymentMethod, PaymentProvider> = {
  crypto: coinbaseProvider,
  bank_transfer: bankTransferProvider,
};

export function getPaymentProvider(method: PaymentMethod): PaymentProvider {
  return PROVIDERS[method];
}

export { PaymentProviderError } from "./errors";
export type { PaymentProvider } from "./types";
