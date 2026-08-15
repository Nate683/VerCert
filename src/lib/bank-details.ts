// Real bank transfer details come from environment variables — never
// hardcoded — so a misconfigured deployment can't accidentally show
// customers fake account numbers to wire real money to.
export type BankTransferDetails = {
  accountName: string;
  bankName: string;
  accountNumber: string;
  routingNumber: string;
  swiftBic: string;
  accountType: string;
  isConfigured: boolean;
};

export function getBankTransferDetails(): BankTransferDetails {
  const accountName = process.env.BANK_ACCOUNT_NAME?.trim() ?? "";
  const bankName = process.env.BANK_NAME?.trim() ?? "";
  const accountNumber = process.env.BANK_ACCOUNT_NUMBER?.trim() ?? "";
  const routingNumber = process.env.BANK_ROUTING_NUMBER?.trim() ?? "";
  const swiftBic = process.env.BANK_SWIFT_BIC?.trim() ?? "";
  const accountType = process.env.BANK_ACCOUNT_TYPE?.trim() ?? "";

  return {
    accountName,
    bankName,
    accountNumber,
    routingNumber,
    swiftBic,
    accountType,
    isConfigured: Boolean(accountName && bankName && accountNumber && routingNumber),
  };
}
