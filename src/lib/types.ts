export type BulkPriceTier = {
  minQuantity: number;
  priceUsd: number; // price per unit once minQuantity is reached
};

export type SizeOption = {
  label: string;
  priceUsd: number;
  bulkTiers?: BulkPriceTier[];
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
  primaryImageUrl?: string;
  galleryImageUrls?: string[];
  sortOrder?: number;
  active?: boolean;
  costUsd?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CoaDocument = {
  batchNumber: string;
  fileUrl: string;
  uploadedAt: string;
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
  fileUrl?: string;
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

export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "processing"
  | "shipped"
  | "delivered"
  | "expired"
  | "cancelled";

// Statuses that can be manually advanced to from the executive terminals,
// in pipeline order (awaiting_payment is entered automatically, not chosen).
export const ORDER_STATUS_FLOW: OrderStatus[] = [
  "paid",
  "processing",
  "shipped",
  "delivered",
];

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
  processingAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  carrier?: string;
  trackingNumber?: string;
  // Tracks whether stock has already been decremented for this order, so
  // paid/cancel transitions never double-decrement or double-restore.
  stockDecremented?: boolean;
  promoCode?: string;
  promoCodeId?: string;
  discountAmount?: number;
  freeShipping?: boolean;
  refundedAt?: string;
  refundReason?: RefundReasonCode;
  refundAmount?: number;
};

export type RefundReasonCode =
  | "customer_request"
  | "quality_issue"
  | "duplicate_order"
  | "shipping_issue"
  | "other";

export type PromoType = "percent" | "fixed" | "free_shipping";

export type PromoCode = {
  id: string;
  code: string;
  type: PromoType;
  value: number; // percent (0-100) or fixed dollar amount; ignored for free_shipping
  minOrderAmount: number;
  usageLimit?: number;
  perCustomerLimit?: number;
  startsAt?: string;
  endsAt?: string;
  active: boolean;
  restrictedProductSlugs?: string[];
  restrictedCategories?: string[];
  affiliateId?: string;
  createdAt: string;
  updatedAt: string;
};

export type PromoCodeStats = PromoCode & {
  redemptions: number;
  revenueAttributed: number;
  discountGiven: number;
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
  // Self-service email change — set while the new address awaits verification.
  pendingEmail?: string;
  pendingEmailToken?: string;
  pendingEmailTokenExpiresAt?: string;
  // Grants access to the matching executive dashboard via the normal login.
  role?: "command" | "office";
  // Executive-facing only — never shown to the customer.
  notes?: string;
};

export type CommissionType = "percent" | "flat";

export type Affiliate = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  paymentMethod?: string;
  notes?: string;
  commissionType: CommissionType;
  commissionRate: number; // percent (0-100), used when commissionType === "percent"
  commissionFlatAmount: number; // used when commissionType === "flat"
  promoCodeId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AffiliatePayout = {
  id: string;
  affiliateId: string;
  amount: number;
  paidAt: string;
  note?: string;
  createdAt: string;
};

export type AffiliateSummary = Affiliate & {
  code?: string;
  ordersDriven: number;
  grossRevenue: number;
  commissionEarned: number;
  commissionPaid: number;
  balanceOwed: number;
  ytdRevenue: number;
  ytdCommission: number;
};

export type ActivityLogEntry = {
  id: string;
  actorEmail: string;
  action: string;
  details?: string;
  createdAt: string;
};

export type AnalyticsEventType =
  | "page_view"
  | "add_to_cart"
  | "checkout_started"
  | "order_completed";

export type FunnelStats = {
  pageViews: number;
  addToCart: number;
  checkoutStarted: number;
  orderCompleted: number;
};

export type PublicCustomer = Omit<
  Customer,
  | "passwordHash"
  | "verificationToken"
  | "resetToken"
  | "resetTokenExpiresAt"
  | "pendingEmailToken"
  | "pendingEmailTokenExpiresAt"
>;

// --- Financial ledger (manual bookkeeping) ---

export type RecurringFrequency = "weekly" | "monthly" | "yearly";

export type Expense = {
  id: string;
  date: string;
  category: string;
  vendor?: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  receiptUrl?: string;
  recurring: boolean;
  recurringFrequency?: RecurringFrequency;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type CogsEntry = {
  id: string;
  productSlug?: string;
  batchNumber?: string;
  purchasePriceUsd: number;
  supplier?: string;
  quantity: number;
  dateReceived: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type LedgerAssetType = "cash" | "inventory" | "equipment" | "receivable" | "other";
export type LedgerLiabilityType = "loan" | "credit_card" | "payable" | "accrued_commission" | "other";

export type LedgerAsset = {
  id: string;
  type: LedgerAssetType;
  name: string;
  valueUsd: number;
  asOfDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type LedgerLiability = {
  id: string;
  type: LedgerLiabilityType;
  name: string;
  valueUsd: number;
  asOfDate: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type OwnerTransactionType = "contribution" | "draw";

export type OwnerTransaction = {
  id: string;
  type: OwnerTransactionType;
  amountUsd: number;
  date: string;
  notes?: string;
  createdAt: string;
};
