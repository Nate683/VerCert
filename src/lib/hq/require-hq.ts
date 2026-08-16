import { getCurrentCustomer } from "@/lib/users/current-user";
import { getAffiliateByEmail } from "@/lib/affiliates";
import { EXECUTIVE_IDENTITY } from "@/lib/executive/identity";
import type { AffiliateTier, HqMemberKind } from "@/lib/types";

export type HqMember = {
  id: string;
  name: string;
  kind: HqMemberKind;
  tier?: AffiliateTier;
};

// /hq is for executives (either realm) and active affiliates only — never
// customers, even logged-in ones with no affiliate record.
export async function getHqMember(): Promise<HqMember | null> {
  const customer = await getCurrentCustomer();
  if (!customer) return null;

  if (customer.role === "command" || customer.role === "office") {
    return { id: customer.id, name: EXECUTIVE_IDENTITY[customer.role].name, kind: "executive" };
  }

  const affiliate = await getAffiliateByEmail(customer.email);
  if (affiliate?.active) {
    return { id: customer.id, name: affiliate.name, kind: "affiliate", tier: affiliate.tier };
  }

  return null;
}
