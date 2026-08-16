import { NextResponse } from "next/server";
import { getHqMember } from "@/lib/hq";
import { listAffiliates } from "@/lib/affiliates";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Name, tier, and join date only — never contact info or production figures.
export const GET = withApiErrorHandling(async () => {
  const member = await getHqMember();
  if (!member) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const affiliates = await listAffiliates();
  const directory = affiliates
    .filter((a) => a.active)
    .map((a) => ({ name: a.name, tier: a.tier, joinedAt: a.createdAt }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ directory });
});
