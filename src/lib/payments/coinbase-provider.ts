import type { Order } from "@/lib/types";
import { createCoinbaseCharge } from "@/lib/coinbase";
import { PaymentProviderError } from "./errors";
import type { PaymentProvider } from "./types";

export const coinbaseProvider: PaymentProvider = {
  method: "crypto",
  async initiate(order: Order) {
    try {
      const charge = await createCoinbaseCharge(order);
      return { crypto: charge };
    } catch (err) {
      console.error(`Coinbase Commerce charge creation failed for order ${order.reference}:`, err);
      throw new PaymentProviderError(
        "Crypto payments aren't configured yet. Set COINBASE_COMMERCE_API_KEY in .env.local."
      );
    }
  },
};
