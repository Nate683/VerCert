import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { listActivity } from "@/lib/activity-log";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Activity log is /command-only, even though entries can originate from
// either realm's actions.
export const GET = withApiErrorHandling(async () => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const entries = await listActivity();
  return NextResponse.json({ entries });
});
