import type { Order } from "@/lib/types";
import type { PaymentProvider } from "./types";

// No external API call — the customer pays offline (ACH/wire) using the
// reference + bank details emailed to them, and staff mark the order paid
// from an executive terminal once funds clear.
export const bankTransferProvider: PaymentProvider = {
  method: "bank_transfer",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match PaymentProvider
  async initiate(_order: Order) {
    return {};
  },
};
