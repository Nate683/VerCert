import { NextResponse } from "next/server";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listCoaDocuments } from "@/lib/coa-documents";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Lists every uploaded COA file, keyed by batch number — available to both
// executive terminals (COA upload is shared product-management tooling).
export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const documents = await listCoaDocuments();
  return NextResponse.json({ documents });
});
