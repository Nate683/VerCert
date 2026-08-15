import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listCogsEntries, createCogsEntry } from "@/lib/ledger";
import { cogsEntrySchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const entries = await listCogsEntries();
  return NextResponse.json({ entries });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  const actor = await getCurrentCustomer();
  if (!actor || (actor.role !== "command" && actor.role !== "office")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseBody(request, cogsEntrySchema);
  if ("error" in parsed) return parsed.error;

  const entry = await createCogsEntry({ ...parsed.data, createdBy: actor.email });
  await logActivity(actor.email, "cogs.created", entry.productSlug ?? entry.supplier ?? entry.id);
  return NextResponse.json({ entry });
});
