import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listMovements, listStrengthStock } from "@/lib/inventory";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Executive Office → Stock (Stage 2): every strength's stock and the most recent movements across all of them.
// Read-only; staff only.
export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const [rows, recent] = await Promise.all([listStrengthStock(), listMovements({ limit: 25 })]);
  return NextResponse.json({ rows, recent }, { headers: { "Cache-Control": "private, no-store" } });
});
