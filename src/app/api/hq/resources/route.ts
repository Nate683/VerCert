import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getHqMember, listResources, createResource } from "@/lib/hq";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const GET = withApiErrorHandling(async () => {
  const member = await getHqMember();
  if (!member) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const resources = await listResources();
  return NextResponse.json({ resources });
});

// Executive-only — affiliates can view/download but never upload.
export const POST = withApiErrorHandling(async (request: Request) => {
  const member = await getHqMember();
  if (!member || member.kind !== "executive") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const title = formData.get("title");
  const description = formData.get("description");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A file is required." }, { status: 400 });
  }
  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "That file type isn't supported." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File must be 20MB or smaller." }, { status: 400 });
  }

  const blob = await put(`hq-resources/${Date.now()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  const resource = await createResource({
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : undefined,
    fileUrl: blob.url,
    fileType: file.type,
    uploadedBy: member.name,
  });

  return NextResponse.json({ resource });
});
