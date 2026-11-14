import { NextResponse } from "next/server";
import { requireCommandSession } from "@/lib/executive/require-auth";
import { withApiErrorHandling } from "@/lib/api-error";
import { getRecord, pendingRevision, readFile } from "@/lib/coa/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// The original PDF of any record, for review and preview — executives only, whatever the record's status (draft,
// synthetic, unpublished, deleted). ?revision=1 serves the PDF of the record's pending correction instead.
export const GET = withApiErrorHandling(async (request: Request, { params }: Params) => {
  if (!(await requireCommandSession())) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;
  const record = await getRecord(id);
  let fileId = record?.fileId ?? null;
  if (record && new URL(request.url).searchParams.get("revision") === "1") fileId = (await pendingRevision(id))?.fileId ?? null;
  const file = fileId ? await readFile(fileId) : null;
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
