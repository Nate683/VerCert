import type { PromoCode } from "@/lib/types";
import { getPromoCodeByCode, countRedemptions, countCustomerRedemptions } from "./store";

export type PromoLineItem = { slug: string; category: string; lineTotal: number };

export type PromoValidationResult =
  | { ok: true; promo: PromoCode; discountAmount: number; freeShipping: boolean }
  | { ok: false; message: string };

function isWithinDateRange(promo: PromoCode, now: Date): boolean {
  if (promo.startsAt && now < new Date(promo.startsAt)) return false;
  if (promo.endsAt && now > new Date(promo.endsAt)) return false;
  return true;
}

// Authoritative server-side promo validation — used by both the checkout
// preview endpoint and order creation, so a code can never be honored on
// preview but rejected (or vice versa) at the moment an order is placed.
export async function validatePromoCode(input: {
  code: string;
  subtotal: number;
  lineItems: PromoLineItem[];
  customerId?: string;
}): Promise<PromoValidationResult> {
  const promo = await getPromoCodeByCode(input.code.trim());
  if (!promo) return { ok: false, message: "This promo code doesn't exist." };
  if (!promo.active) return { ok: false, message: "This promo code is no longer active." };
  if (!isWithinDateRange(promo, new Date())) {
    return { ok: false, message: "This promo code isn't valid right now." };
  }
  if (input.subtotal < promo.minOrderAmount) {
    return {
      ok: false,
      message: `This code requires a minimum order of $${promo.minOrderAmount.toFixed(2)}.`,
    };
  }
  if (promo.usageLimit !== undefined) {
    const used = await countRedemptions(promo.id);
    if (used >= promo.usageLimit) {
      return { ok: false, message: "This promo code has reached its usage limit." };
    }
  }
  if (promo.perCustomerLimit !== undefined && input.customerId) {
    const used = await countCustomerRedemptions(promo.id, input.customerId);
    if (used >= promo.perCustomerLimit) {
      return {
        ok: false,
        message: "You've already used this promo code the maximum number of times.",
      };
    }
  }

  const restricted = Boolean(
    (promo.restrictedProductSlugs && promo.restrictedProductSlugs.length > 0) ||
      (promo.restrictedCategories && promo.restrictedCategories.length > 0)
  );

  let eligibleAmount = input.subtotal;
  if (restricted) {
    eligibleAmount = input.lineItems
      .filter(
        (item) =>
          promo.restrictedProductSlugs?.includes(item.slug) ||
          promo.restrictedCategories?.includes(item.category)
      )
      .reduce((sum, item) => sum + item.lineTotal, 0);
    if (eligibleAmount <= 0) {
      return { ok: false, message: "This promo code doesn't apply to any items in your cart." };
    }
  }

  if (promo.type === "free_shipping") {
    return { ok: true, promo, discountAmount: 0, freeShipping: true };
  }

  const rawDiscount =
    promo.type === "percent"
      ? eligibleAmount * (promo.value / 100)
      : Math.min(promo.value, eligibleAmount);

  return { ok: true, promo, discountAmount: Math.round(rawDiscount * 100) / 100, freeShipping: false };
}
