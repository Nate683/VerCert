import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireExecutiveSession } from "@/lib/executive/require-auth";
import { listDocuments, createDocument } from "@/lib/documents/store";
import { withApiErrorHandling } from "@/lib/api-error";
import { logActivity } from "@/lib/activity-log";
import { getCurrentCustomer } from "@/lib/users/current-user";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB

export const GET = withApiErrorHandling(async () => {
  if (!(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const documents = await listDocuments();
  return NextResponse.json({ documents });
});

export const POST = withApiErrorHandling(async (request: Request) => {
  const actor = await getCurrentCustomer();
  if (!actor || !(await requireExecutiveSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const name = formData.get("name");
  const category = formData.get("category");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File must be 20MB or smaller." }, { status: 400 });
  }

  const blob = await put(`documents/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  const doc = await createDocument({
    name: typeof name === "string" && name.trim() ? name : file.name,
    category: typeof category === "string" && category.trim() ? category : "Other",
    fileUrl: blob.url,
    uploadedBy: actor.email,
  });

  await logActivity(actor.email, "document.uploaded", doc.name);

  return NextResponse.json({ document: doc });
});
