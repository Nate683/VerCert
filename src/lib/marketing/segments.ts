import { toCsv } from "@/lib/csv";
import type { CustomerMetrics } from "./customer-metrics";
import { heardAboutLabel } from "./heard-about";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PurchaseHistory = "all" | "never" | "first-time" | "repeat";
export type ReferralFilter = "all" | "affiliate" | "direct";

export type SegmentFilters = {
  history: PurchaseHistory;
  /** Has ordered before, but not in at least this many days. */
  lapsedDays?: number;
  minLifetimeValue?: number;
  /** Most-purchased category. */
  category?: string;
  referral: ReferralFilter;
  affiliateId?: string;
  /** Left a cart within this many days. */
  abandonedWithinDays?: number;
  // On unless explicitly turned off: segments feed email campaigns, and
  // customers who haven't opted in must not end up in one.
  optedInOnly: boolean;
};

function positiveNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseSegmentFilters(params: URLSearchParams): SegmentFilters {
  const history = params.get("history");
  const referral = params.get("referral");
  return {
    history: history === "never" || history === "first-time" || history === "repeat" ? history : "all",
    lapsedDays: positiveNumber(params.get("lapsedDays")),
    minLifetimeValue: positiveNumber(params.get("minLtv")),
    category: params.get("category") || undefined,
    referral: referral === "affiliate" || referral === "direct" ? referral : "all",
    affiliateId: params.get("affiliateId") || undefined,
    abandonedWithinDays: positiveNumber(params.get("abandonedWithinDays")),
    optedInOnly: params.get("optedInOnly") !== "false",
  };
}

export function matchesSegment(c: CustomerMetrics, f: SegmentFilters, now = Date.now()): boolean {
  if (f.history === "never" && c.orderCount !== 0) return false;
  if (f.history === "first-time" && c.orderCount !== 1) return false;
  if (f.history === "repeat" && c.orderCount < 2) return false;
  if (f.lapsedDays !== undefined && (c.daysSinceLastOrder === undefined || c.daysSinceLastOrder < f.lapsedDays)) {
    return false;
  }
  if (f.minLifetimeValue !== undefined && c.lifetimeValue < f.minLifetimeValue) return false;
  if (f.category && c.topCategory !== f.category) return false;
  if (f.referral === "affiliate" && !c.affiliateId) return false;
  if (f.referral === "direct" && c.affiliateId) return false;
  if (f.affiliateId && c.affiliateId !== f.affiliateId) return false;
  if (
    f.abandonedWithinDays !== undefined &&
    (!c.abandonedCartAt || now - Date.parse(c.abandonedCartAt) > f.abandonedWithinDays * DAY_MS)
  ) {
    return false;
  }
  if (f.optedInOnly && !c.marketingOptIn) return false;
  return true;
}

export type SegmentSummary = {
  totalCustomers: number;
  matched: number;
  lifetimeValue: number;
  averageLifetimeValue: number;
  /** Fit every other filter but haven't opted in to marketing email. */
  withoutConsent: number;
};

export function summarizeSegment(
  all: CustomerMetrics[],
  matched: CustomerMetrics[],
  filters: SegmentFilters,
  now = Date.now()
): SegmentSummary {
  const lifetimeValue = matched.reduce((sum, c) => sum + c.lifetimeValue, 0);
  const ignoringConsent = { ...filters, optedInOnly: false };
  return {
    totalCustomers: all.length,
    matched: matched.length,
    lifetimeValue: Math.round(lifetimeValue * 100) / 100,
    averageLifetimeValue: matched.length ? Math.round((lifetimeValue / matched.length) * 100) / 100 : 0,
    withoutConsent: all.filter((c) => !c.marketingOptIn && matchesSegment(c, ignoringConsent, now)).length,
  };
}

export type SegmentOptions = {
  categories: string[];
  affiliates: { id: string; name: string }[];
  /** Lifetime value where the top fifth of buyers starts. */
  highValueThreshold: number;
};

export function segmentOptions(all: CustomerMetrics[]): SegmentOptions {
  const categories = [...new Set(all.map((c) => c.topCategory).filter((c): c is string => Boolean(c)))].sort();
  const affiliates = new Map<string, string>();
  for (const c of all) if (c.affiliateId) affiliates.set(c.affiliateId, c.affiliateName ?? "Unknown affiliate");
  const values = all
    .filter((c) => c.orderCount > 0)
    .map((c) => c.lifetimeValue)
    .sort((a, b) => a - b);
  return {
    categories,
    affiliates: [...affiliates].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    highValueThreshold: values.length ? values[Math.min(values.length - 1, Math.floor(values.length * 0.8))] : 0,
  };
}

// Plain-English description of a segment, for the activity log entry an export leaves.
export function describeSegment(f: SegmentFilters): string {
  const parts: string[] = [];
  if (f.history === "never") parts.push("never ordered");
  if (f.history === "first-time") parts.push("first-time buyers");
  if (f.history === "repeat") parts.push("repeat buyers");
  if (f.lapsedDays) parts.push(`no order in ${f.lapsedDays}+ days`);
  if (f.minLifetimeValue) parts.push(`lifetime value $${f.minLifetimeValue}+`);
  if (f.category) parts.push(`mostly buys ${f.category}`);
  if (f.referral === "affiliate") parts.push("affiliate-referred");
  if (f.referral === "direct") parts.push("not affiliate-referred");
  if (f.affiliateId) parts.push(`one affiliate (${f.affiliateId})`);
  if (f.abandonedWithinDays) parts.push(`abandoned a cart in the last ${f.abandonedWithinDays} days`);
  parts.push(f.optedInOnly ? "email opt-ins only" : "including customers without email consent");
  return parts.join(", ");
}

const CSV_COLUMNS = [
  "email",
  "first_name",
  "last_name",
  "company",
  "marketing_opt_in",
  "order_count",
  "lifetime_value",
  "average_order_value",
  "first_order_date",
  "last_order_date",
  "days_since_last_order",
  "reorder_interval_days",
  "top_category",
  "affiliate",
  "heard_about",
  "utm_source",
  "utm_campaign",
  "signup_date",
  "email_opens",
  "email_clicks",
  "abandoned_cart_at",
];

export function segmentToCsv(customers: CustomerMetrics[]): string {
  return toCsv(
    customers.map((c) => ({
      email: c.email,
      first_name: c.firstName,
      last_name: c.lastName,
      company: c.company ?? "",
      marketing_opt_in: c.marketingOptIn ? "yes" : "no",
      order_count: c.orderCount,
      lifetime_value: c.lifetimeValue.toFixed(2),
      average_order_value: c.averageOrderValue.toFixed(2),
      first_order_date: c.firstOrderAt?.slice(0, 10) ?? "",
      last_order_date: c.lastOrderAt?.slice(0, 10) ?? "",
      days_since_last_order: c.daysSinceLastOrder ?? "",
      reorder_interval_days: c.reorderIntervalDays ?? "",
      top_category: c.topCategory ?? "",
      affiliate: c.affiliateName ?? "",
      heard_about: heardAboutLabel(c.heardAbout) ?? "",
      utm_source: c.attribution?.utmSource ?? "",
      utm_campaign: c.attribution?.utmCampaign ?? "",
      signup_date: c.signedUpAt.slice(0, 10),
      email_opens: c.emailOpens,
      email_clicks: c.emailClicks,
      abandoned_cart_at: c.abandonedCartAt ?? "",
    })),
    CSV_COLUMNS
  );
}
