import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { getAllBatchNumbers } from "@/lib/products";
import { getCoaDocument, upsertCoaDocument, deleteCoaDocument } from "@/lib/coa-documents";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

// Uploads a signed COA file (PDF or scanned image) for a specific batch
// number. The batch must belong to a real product batch — this isn't a
// free-form file drop.
export const POST = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ batch: string }> }
) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { batch } = await params;
  const known = await getAllBatchNumbers();
  if (!known.some((b) => b.batch === batch)) {
    return NextResponse.json({ error: "Unknown batch number." }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only PDF, JPEG, or PNG files are allowed." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File must be 15MB or smaller." }, { status: 400 });
  }

  const existing = await getCoaDocument(batch);
  if (existing) await del(existing.fileUrl).catch(() => undefined);

  const blob = await put(`coa/${batch}/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  const document = await upsertCoaDocument(batch, blob.url);
  return NextResponse.json({ document });
});

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ batch: string }> }
) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { batch } = await params;
  const existing = await getCoaDocument(batch);
  if (existing) await del(existing.fileUrl).catch(() => undefined);
  await deleteCoaDocument(batch);

  return NextResponse.json({ ok: true });
});
