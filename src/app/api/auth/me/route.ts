import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/users/current-user";
import { researchProfileGaps } from "@/lib/users/research-profile";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  const user = await getCurrentCustomer();
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      marketingConsent: user.marketingConsent,
      emailVerified: user.emailVerified,
      role: user.role ?? null,
      // Details an older customer account hasn't given yet, for the one-time
      // prompt; null when the account isn't asked.
      researchProfileGaps: await researchProfileGaps(user),
    },
  });
});
