import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { listBlendRows, listIngredientChoices } from "@/lib/products/blend-composition";
import { withApiErrorHandling } from "@/lib/api-error";
import { noStore, unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

// Executive Office → Blends: every blend strength with its structured composition (or flagged for completion), and
// the catalog compounds an ingredient can reference (hidden ones included and marked).
export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveActor())) return unauthorized();
  const [blends, choices] = await Promise.all([listBlendRows(), listIngredientChoices()]);
  return NextResponse.json({ blends, choices }, noStore);
});
