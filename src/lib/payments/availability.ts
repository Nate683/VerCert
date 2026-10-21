import type { PaymentMethod } from "@/lib/types";

// Which payment methods checkout may offer. Client-safe: no provider code here,
// so the checkout form can import it.
//
// Crypto is off: Coinbase Commerce, the provider behind it, has shut down (its
// API answers HTTP 530 / Cloudflare 1016, checked 2026-10-20), so no charge can
// be created. Checkout hides the option and order creation refuses it until a
// working provider replaces lib/coinbase.ts and this is set to "1".
// NEXT_PUBLIC_ values are inlined at build, so a change needs a redeploy.
export const CRYPTO_CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_CRYPTO_CHECKOUT_ENABLED === "1";

export function isPaymentMethodAvailable(method: PaymentMethod): boolean {
  return method !== "crypto" || CRYPTO_CHECKOUT_ENABLED;
}
