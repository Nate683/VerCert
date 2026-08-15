import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

// Uploads an expense receipt (PDF or photo) to Vercel Blob and returns its URL.
export const POST = withApiErrorHandling(async (request: Request) => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only PDF, JPEG, PNG, or WEBP files are allowed." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File must be 15MB or smaller." }, { status: 400 });
  }

  const blob = await put(`receipts/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  return NextResponse.json({ url: blob.url });
});
