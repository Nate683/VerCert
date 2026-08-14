export type SizeOption = {
  label: string;
  priceUsd: number;
};

export type Product = {
  slug: string;
  name: string;
  category: string;
  casNumber: string;
  molecularFormula: string;
  molecularWeight: string;
  purityPercent: number;
  sequenceOrForm: string;
  storage: string;
  sizes: SizeOption[];
  batchNumbers: string[];
  summary: string;
  description: string[];
};

export type CoaResult = {
  batchNumber: string;
  productName: string;
  casNumber: string;
  purityPercent: number;
  testMethod: string;
  dateTested: string;
  dateIssued: string;
  lab: string;
  appearance: string;
  tests: {
    parameter: string;
    method: string;
    result: string;
  }[];
};

export type CartItem = {
  slug: string;
  name: string;
  sizeLabel: string;
  priceUsd: number;
  quantity: number;
};

export type PaymentMethod = "crypto" | "bank_transfer";

export type OrderStatus = "awaiting_payment" | "paid" | "expired" | "cancelled";

export type CryptoCurrencyCode = "bitcoin" | "ethereum" | "usdc";

export type CustomerInfo = {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type CryptoChargeInfo = {
  chargeId: string;
  chargeCode: string;
  hostedUrl: string;
  expiresAt: string;
  pricing: Partial<Record<CryptoCurrencyCode, { amount: string; currency: string }>>;
  addresses: Partial<Record<CryptoCurrencyCode, string>>;
};

export type Order = {
  id: string;
  reference: string;
  createdAt: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customerId?: string;
  customer: CustomerInfo;
  items: CartItem[];
  subtotal: number;
  total: number;
  crypto?: CryptoChargeInfo;
  paidAt?: string;
};

export type SavedAddress = {
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type Customer = {
  id: string;
  email: string;
  passwordHash: string;
  marketingOptIn: boolean;
  emailVerified: boolean;
  createdAt: string;
  savedAddress?: SavedAddress;
  verificationToken?: string;
  verificationTokenExpiresAt?: string;
  resetToken?: string;
  resetTokenExpiresAt?: string;
};

export type PublicCustomer = Omit<
  Customer,
  "passwordHash" | "verificationToken" | "resetToken" | "resetTokenExpiresAt"
>;
