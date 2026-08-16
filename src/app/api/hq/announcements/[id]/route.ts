import { NextResponse } from "next/server";
import { getHqMember, updateAnnouncement, deleteAnnouncement } from "@/lib/hq";
import { hqAnnouncementUpdateSchema, parseBody } from "@/lib/validation";
import { withApiErrorHandling } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export const PATCH = withApiErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const member = await getHqMember();
  if (!member || member.kind !== "executive") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = await parseBody(request, hqAnnouncementUpdateSchema);
  if ("error" in parsed) return parsed.error;

  const announcement = await updateAnnouncement(id, parsed.data);
  if (!announcement) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
  return NextResponse.json({ announcement });
});

export const DELETE = withApiErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const member = await getHqMember();
  if (!member || member.kind !== "executive") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { id } = await params;
  await deleteAnnouncement(id);
  return NextResponse.json({ ok: true });
});
