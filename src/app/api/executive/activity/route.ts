import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { listActivity } from "@/lib/activity-log";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// NOTE: both executive realms since 2026-11-08 (owner gave /office full parity) — see lib/executive/require-auth.ts.
// Activity log is /command-only, even though entries can originate from
// either realm's actions.
export const GET = withApiErrorHandling(async () => {
  if (!(await requireCommandSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const entries = await listActivity();
  return NextResponse.json({ entries });
});
