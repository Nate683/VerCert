import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { getRecord, readFile } from "@/lib/coa/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// The original PDF of any record, for review — executives only, whatever the record's status.
export const GET = withApiErrorHandling(async (_request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const record = await getRecord(id);
  const file = record?.fileId ? await readFile(record.fileId) : null;
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file.fileName.replace(/["\\]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
