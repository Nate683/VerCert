import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listAssets, createAsset } from "@/lib/ledger";
import { ledgerAssetSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const assets = await listAssets();
  return NextResponse.json({ assets });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, ledgerAssetSchema);
  if ("error" in parsed) return parsed.error;

  const asset = await createAsset(parsed.data);
  await logActivity(actor.email, "asset.created", `${asset.name} — $${asset.valueUsd.toFixed(2)}`);
  return NextResponse.json({ asset });
});
