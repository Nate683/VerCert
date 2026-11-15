import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getStrengthStock, listMovements } from "@/lib/inventory";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ strengthId: string }> };

// One strength's stock and its full movement history (newest first). Read-only; staff only.
export const GET = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireExecutiveSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { strengthId } = await params;
  const row = await getStrengthStock(strengthId);
  if (!row) return NextResponse.json({ error: "Strength not found." }, { status: 404 });
  const movements = await listMovements({ strengthId, limit: 500 });
  return NextResponse.json({ row, movements }, { headers: { "Cache-Control": "private, no-store" } });
});
