import type { Order } from "@/lib/types";
import type { PaymentProvider } from "./types";
import { getBankTransferDetails } from "@/lib/bank-details";
import { PaymentProviderError } from "./errors";

// No external API call — the customer pays offline (ACH/wire) using the
// reference + bank details emailed to them, and staff mark the order paid
// from an executive terminal once funds clear.
export const bankTransferProvider: PaymentProvider = {
  method: "bank_transfer",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match PaymentProvider
  async initiate(_order: Order) {
    if (!getBankTransferDetails().isConfigured) {
      throw new PaymentProviderError(
        "Bank transfer isn't configured yet. Set BANK_ACCOUNT_NAME/BANK_NAME/BANK_ACCOUNT_NUMBER/BANK_ROUTING_NUMBER in .env.local."
      );
    }
    return {};
  },
};
