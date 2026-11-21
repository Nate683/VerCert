import { NextResponse } from "next/server";
import { requireExecutiveActor } from "@/lib/executive/require-auth";
import { BlendError, clearComposition, saveComposition } from "@/lib/products/blend-composition";
import { formatMg } from "@/lib/products/blend-composition-shared";
import { blendCompositionSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { unauthorized } from "@/lib/executive/route-helpers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ strengthId: string }> };

const refusal = (err: unknown) => {
  if (err instanceof BlendError) return NextResponse.json({ error: err.message, errors: err.errors }, { status: err.status });
  throw err;
};

// Saves (creates or replaces) one blend strength's composition. Moves no stock and changes no product record.
export const PUT = withApiErrorHandling(async (request: Request, { params }: Params) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { strengthId } = await params;
  const parsed = await parseBody(request, blendCompositionSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const composition = await saveComposition(strengthId, parsed.data, `admin:${actor.email}`);
    await logActivity(actor.email, "blend.composition_saved",
      `${composition.blendSlug} (${strengthId}): ${composition.ingredients.map((i) => `${i.componentSlug} ${formatMg(i.amountMg)}`).join(", ")} = ${formatMg(composition.declaredTotalMg)}`);
    return NextResponse.json({ composition });
  } catch (err) {
    return refusal(err);
  }
});

// Removes the composition (the blend is flagged for completion again).
export const DELETE = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  const actor = await requireExecutiveActor();
  if (!actor) return unauthorized();
  const { strengthId } = await params;
  try {
    const removed = await clearComposition(strengthId);
    if (removed) await logActivity(actor.email, "blend.composition_cleared", strengthId);
    return NextResponse.json({ removed });
  } catch (err) {
    return refusal(err);
  }
});
