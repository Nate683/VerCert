import { getAffiliateByEmail } from "@/lib/affiliates";
import type { Customer } from "@/lib/types";

// Which registration details an older customer account is missing, for the
// one-time prompt (components/ResearchProfilePrompt.tsx). Null when the
// account isn't asked: executives, anyone with an affiliate record (active
// or not — affiliates give the category at checkout and the acknowledgment
// at /partner), an account that already answered or skipped, or one that
// has nothing missing.
export type ResearchProfileGaps = { category: boolean; phone: boolean; acknowledgment: boolean };

export async function researchProfileGaps(user: Customer): Promise<ResearchProfileGaps | null> {
  if (user.role || user.researchPromptResolvedAt) return null;
  const gaps = {
    category: !user.researchCategory,
    phone: !user.phone,
    acknowledgment: !user.registrationAckAt,
  };
  if (!gaps.category && !gaps.phone && !gaps.acknowledgment) return null;
  // Checked last: it's the only lookup, and most accounts stop above.
  if (await getAffiliateByEmail(user.email)) return null;
  return gaps;
}
