import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { previewGroupsForRecord } from "@/lib/coa/public";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// PREVIEW PUBLIC VIEW — executives only. The customer-facing groups for this record's product + strength as they would
// read with this record published (drafts, pending revisions and synthetic records included). Read-only: it changes no
// status and never feeds public search. Anyone else gets 401.
export const GET = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const groups = await previewGroupsForRecord(id);
  if (!groups) return NextResponse.json({ error: "Record not found." }, { status: 404 });
  return NextResponse.json({ groups }, { headers: { "Cache-Control": "private, no-store" } });
});
