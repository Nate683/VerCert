import type { AffiliateTier } from "@/lib/types";

// Preset tiers assigned on application approval — commission rates mirror
// the levels described in the Commission Structure content shown to
// affiliates (see src/lib/site-content/defaults.ts).
export const AFFILIATE_TIERS: { id: AffiliateTier; label: string; commissionRate: number }[] = [
  { id: "standard", label: "Standard", commissionRate: 8 },
  { id: "associate", label: "Associate", commissionRate: 10 },
  { id: "principal", label: "Principal", commissionRate: 14 },
  { id: "managing_principal", label: "Managing Principal", commissionRate: 18 },
  { id: "partner", label: "Partner", commissionRate: 30 },
];

export function getTierInfo(tier: AffiliateTier) {
  return AFFILIATE_TIERS.find((t) => t.id === tier);
}
