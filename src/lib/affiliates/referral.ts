import type { Affiliate, Customer } from "@/lib/types";
import { getAffiliateById, getAffiliateByReferralCode } from "./store";

// The affiliate a customer signed up through by referral link (?ref=CODE),
// who is credited with every order that customer places — unless that order
// uses another affiliate's promo code, which wins for that order.
//
// Only a referral-link sign-up counts. An account is also tagged with an
// affiliate the first time it uses that affiliate's promo code (see
// /api/orders), but that alone earns nothing beyond the orders using the
// code. The sign-up stored the link's code (attribution.ref) and credited
// that affiliate (affiliateId) together, which is how the two are told apart.
// An inactive affiliate is credited with nothing.
export async function getReferringAffiliate(
  customer: Pick<Customer, "affiliateId" | "attribution">
): Promise<Affiliate | null> {
  const ref = customer.attribution?.ref;
  if (!customer.affiliateId || !ref) return null;
  const affiliate = await getAffiliateByReferralCode(ref);
  return affiliate?.id === customer.affiliateId ? affiliate : null;
}

// Which affiliate an order is credited to, decided when it's placed: the
// promo code's affiliate if one was used, otherwise the customer's referrer.
export async function creditedAffiliateId(input: {
  promoAffiliateId?: string;
  customer: Pick<Customer, "affiliateId" | "attribution"> | null;
}): Promise<string | undefined> {
  if (input.promoAffiliateId) return input.promoAffiliateId;
  if (!input.customer) return undefined;
  return (await getReferringAffiliate(input.customer))?.id;
}

// Whether the affiliate an order is credited to is the buyer themselves
// (their own promo code, or a referral link they followed). Matched by email,
// which is how an affiliate is tied to their account. Such orders keep the
// discount but earn no commission (see isCreditedTo).
export async function isSelfPurchase(affiliateId: string | undefined, buyerEmail: string): Promise<boolean> {
  if (!affiliateId) return false;
  const affiliate = await getAffiliateById(affiliateId);
  return Boolean(affiliate) && affiliate!.email.toLowerCase() === buyerEmail.toLowerCase();
}
