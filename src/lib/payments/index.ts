import type { PaymentMethod } from "@/lib/types";
import type { PaymentProvider } from "./types";
import { coinbaseProvider } from "./coinbase-provider";
import { bankTransferProvider } from "./bank-transfer-provider";
import { manualProvider, unavailableProvider } from "./stage3-providers";

// One provider adapter per method. Stage 3: Zelle is manual (an administrator confirms with the reference); every
// other new method has NO live integration — its adapter refuses (or, in local simulation only, does nothing and
// lets the test harness post simulated provider events). Replacing an unavailable adapter with a real provider is
// the integration point: implement PaymentProvider (initiate + verified notifications) and keep the order and
// inventory functions unchanged.
const PROVIDERS: Record<PaymentMethod, PaymentProvider> = {
  crypto: coinbaseProvider,
  bank_transfer: bankTransferProvider,
  zelle: manualProvider("zelle"),
  bitcoin: unavailableProvider("bitcoin"),
  ethereum: unavailableProvider("ethereum"),
  usdc: unavailableProvider("usdc"),
  ach: unavailableProvider("ach"),
  card: unavailableProvider("card"),
  apple_pay: unavailableProvider("apple_pay"),
  google_pay: unavailableProvider("google_pay"),
};

export function getPaymentProvider(method: PaymentMethod): PaymentProvider {
  return PROVIDERS[method];
}

export { PaymentProviderError } from "./errors";
export type { PaymentProvider } from "./types";
