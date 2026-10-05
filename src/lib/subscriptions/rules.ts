import type { Product } from "@/lib/types";

// Subscribe and save: settings, eligibility and pricing. Client-safe (no
// server imports) so the product page and the order API apply the same rules.

export type SubscriptionSettings = {
  // Percent off each subscribed line. Null (the default) turns the whole
  // feature off: nothing is offered until an executive sets a discount in
  // /command → Site Content.
  discountPercent: number | null;
  // How often a customer can choose to receive the order, in days.
  intervalDays: number[];
};

export const DEFAULT_SUBSCRIPTION_SETTINGS: SubscriptionSettings = {
  discountPercent: null,
  intervalDays: [30, 60, 90],
};

export function subscriptionsEnabled(settings: SubscriptionSettings): settings is SubscriptionSettings & {
  discountPercent: number;
} {
  return (
    typeof settings.discountPercent === "number" &&
    settings.discountPercent > 0 &&
    settings.discountPercent < 100 &&
    settings.intervalDays.length > 0
  );
}

// A blend is any product with a composition on one of its sizes, or filed
// under Peptide Blends. Blends and anything not active are never offered.
export function isBlend(product: Pick<Product, "sizes" | "category">): boolean {
  return product.category === "Peptide Blends" || product.sizes.some((s) => (s.composition?.length ?? 0) > 0);
}

export function isSubscribable(product: Pick<Product, "sizes" | "category" | "active">): boolean {
  return product.active !== false && !isBlend(product);
}

export function subscriptionUnitPrice(listUnitPrice: number, discountPercent: number): number {
  return Math.round(listUnitPrice * (1 - discountPercent / 100) * 100) / 100;
}

export function intervalLabel(days: number): string {
  if (days % 7 === 0 && days < 28) return days === 7 ? "every week" : `every ${days / 7} weeks`;
  return `every ${days} days`;
}
